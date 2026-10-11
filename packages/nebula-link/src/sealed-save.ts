import { execFile } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Sealed saves (docs/NEBULA_LINK.md § 19): every save a Nebula app writes outside its own data
 * (backups, exports, copies) is encrypted with the family's save key, AES-256-GCM, authenticated.
 *
 * The save key is random, created by the first app that needs it, and kept in
 * `%LOCALAPPDATA%\Nebula Link\save-key.json` protected by Windows for the current user (DPAPI):
 * nothing to type, readable by every Nebula app of this Windows account, kept when an app is
 * uninstalled. A recovery code (the raw key) can be shown once to restore saves on another
 * computer; importing it adds the key without removing the others, so older saves stay readable.
 *
 * A sealed save: `NEBULA-SAVE/1\n`, one line of JSON header (app, kind, key id, IV, created at),
 * `\n`, then the 16-byte GCM tag and the ciphertext. Anything else is treated as a plain save.
 */

export const SEAL_MAGIC = 'NEBULA-SAVE/1\n';
const MAGIC = Buffer.from(SEAL_MAGIC, 'utf8');
const MAX_HEADER_BYTES = 1024;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Extra secret mixed into the Windows protection, so other programs of the user cannot just ask for it. */
const DPAPI_ENTROPY = 'nebula-save-key/1';

export interface SaveMeta {
  /** The app that wrote the save (`nebula.finterest`). */
  app: string;
  /** What it is (`backup`, `export`, `sync-copy`…). */
  kind: string;
  createdAt: string;
}

/** Protects and unprotects bytes for the current Windows user (DPAPI); replaceable in tests. */
export interface KeyProtector {
  protect(data: Buffer): Promise<Buffer>;
  unprotect(data: Buffer): Promise<Buffer>;
}

export interface SaveKeyring {
  /** The key new saves are sealed with. */
  current: { id: string; key: Buffer };
  /** Every key this computer knows (imported recovery codes included), by id. */
  keys: Map<string, Buffer>;
}

export function defaultSaveKeyFile(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Nebula Link', 'save-key.json');
}

export function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// ---- Windows protection (DPAPI) through PowerShell: argument arrays, data on stdin (R11).

const POWERSHELL_SCRIPT = [
  'Add-Type -AssemblyName System.Security',
  '$data = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
  `$entropy = [Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')`,
  '$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser',
  // One statement: joined with "; ", an "else" on its own would not parse.
  'if ($env:NEBULA_DPAPI_MODE -eq "protect") { $out = [Security.Cryptography.ProtectedData]::Protect($data, $entropy, $scope) } else { $out = [Security.Cryptography.ProtectedData]::Unprotect($data, $entropy, $scope) }',
  '[Console]::Out.Write([Convert]::ToBase64String($out))',
].join('; ');

function runDpapi(mode: 'protect' | 'unprotect', data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_SCRIPT],
      { windowsHide: true, timeout: 30_000, env: { ...process.env, NEBULA_DPAPI_MODE: mode } },
      (error, stdout) => {
        if (error) return reject(new Error('ERR_DPAPI'));
        const out = Buffer.from(String(stdout).trim(), 'base64');
        return out.length > 0 ? resolve(out) : reject(new Error('ERR_DPAPI'));
      },
    );
    child.stdin?.end(data.toString('base64'));
  });
}

export const windowsProtector: KeyProtector = {
  protect: (data) => runDpapi('protect', data),
  unprotect: (data) => runDpapi('unprotect', data),
};

// ---- The key file.

interface KeyFile {
  schema: 1;
  protection: 'dpapi-user';
  /** Newest last; each one protected by Windows. */
  keys: Array<{ id: string; protected: string; addedAt: string }>;
}

function readKeyFile(file: string): KeyFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as KeyFile;
    if (parsed?.schema !== 1 || !Array.isArray(parsed.keys)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeKeyFile(file: string, content: KeyFile): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(content, null, 2));
  fs.renameSync(temporary, file);
}

/** Creates the key file only if there is none yet, in one step (a hard link): false when another app made it first. */
function createKeyFile(file: string, content: KeyFile): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(content, null, 2));
  try {
    fs.linkSync(temporary, file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/**
 * `createOnly`: there was no key file when the caller looked. Two apps starting together must not
 * each create a key, so the first file wins and the other app reads it (never appended to).
 */
async function addKey(file: string, key: Buffer, protector: KeyProtector, now: Date, createOnly = false): Promise<void> {
  const id = keyId(key);
  const entry = { id, protected: (await protector.protect(key)).toString('base64'), addedAt: now.toISOString() };
  if (createOnly) {
    createKeyFile(file, { schema: 1, protection: 'dpapi-user', keys: [entry] });
    return;
  }
  const content = readKeyFile(file) ?? { schema: 1, protection: 'dpapi-user', keys: [] };
  if (content.keys.some((candidate) => candidate.id === id)) return;
  content.keys.push(entry);
  writeKeyFile(file, content);
}

/**
 * The family's keyring: created at the first call (a random key, protected by Windows), then read.
 * Keys that cannot be unprotected (another Windows account) are skipped; if none is left, a new
 * one is added so new saves can always be sealed.
 */
export async function loadSaveKeyring(options: { file?: string; protector?: KeyProtector; now?: Date } = {}): Promise<SaveKeyring> {
  const file = options.file ?? defaultSaveKeyFile();
  const protector = options.protector ?? windowsProtector;
  const keys = new Map<string, Buffer>();
  let order: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const missing = !fs.existsSync(file);
    const content = readKeyFile(file);
    for (const entry of content?.keys ?? []) {
      try {
        const key = await protector.unprotect(Buffer.from(entry.protected, 'base64'));
        if (key.length === KEY_BYTES && keyId(key) === entry.id) keys.set(entry.id, key);
      } catch {
        // Protected for another account or computer: not usable here.
      }
    }
    order = (content?.keys ?? []).map((entry) => entry.id).filter((id) => keys.has(id));
    if (order.length > 0) break;
    await addKey(file, randomBytes(KEY_BYTES), protector, options.now ?? new Date(), missing);
  }
  const currentId = order[order.length - 1];
  if (!currentId) throw new Error('ERR_SAVE_KEY');
  return { current: { id: currentId, key: keys.get(currentId)! }, keys };
}

/** The recovery code of the current key: 64 hexadecimal characters in groups of 8. */
export function recoveryCode(keyring: SaveKeyring): string {
  return keyring.current.key.toString('hex').toUpperCase().match(/.{8}/g)!.join('-');
}

/** Adds a key from its recovery code (another computer's saves); false when the code is not valid. */
export async function importRecoveryCode(code: string, options: { file?: string; protector?: KeyProtector; now?: Date } = {}): Promise<boolean> {
  const hex = code.replace(/[\s-]/g, '');
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  await addKey(options.file ?? defaultSaveKeyFile(), Buffer.from(hex, 'hex'), options.protector ?? windowsProtector, options.now ?? new Date());
  return true;
}

// ---- Sealing.

export function isSealedSave(bytes: Buffer): boolean {
  return bytes.length > MAGIC.length && bytes.subarray(0, MAGIC.length).equals(MAGIC);
}

export function sealSave(plain: Buffer, keyring: SaveKeyring, meta: Omit<SaveMeta, 'createdAt'> & { createdAt?: string }): Buffer {
  const iv = randomBytes(IV_BYTES);
  const header = Buffer.from(
    JSON.stringify({ app: meta.app, kind: meta.kind, createdAt: meta.createdAt ?? new Date().toISOString(), keyId: keyring.current.id, iv: iv.toString('base64') }) + '\n',
    'utf8',
  );
  const cipher = createCipheriv('aes-256-gcm', keyring.current.key, iv);
  // The header is authenticated too: changing the app or the kind breaks the save.
  cipher.setAAD(Buffer.concat([MAGIC, header]));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, header, cipher.getAuthTag(), body]);
}

export class SealedSaveError extends Error {}

/** Opens a sealed save; throws `SealedSaveError` (`ERR_SAVE_KEY_UNKNOWN`, `ERR_SAVE_DAMAGED`) otherwise. */
export function openSave(bytes: Buffer, keyring: SaveKeyring): { meta: SaveMeta; plain: Buffer } {
  if (!isSealedSave(bytes)) throw new SealedSaveError('ERR_NOT_SEALED');
  const end = bytes.indexOf(0x0a, MAGIC.length);
  if (end < 0 || end - MAGIC.length > MAX_HEADER_BYTES) throw new SealedSaveError('ERR_SAVE_DAMAGED');
  const header = bytes.subarray(MAGIC.length, end + 1);
  let parsed: { app?: unknown; kind?: unknown; createdAt?: unknown; keyId?: unknown; iv?: unknown };
  try {
    parsed = JSON.parse(header.toString('utf8'));
  } catch {
    throw new SealedSaveError('ERR_SAVE_DAMAGED');
  }
  const key = typeof parsed.keyId === 'string' ? keyring.keys.get(parsed.keyId) : undefined;
  if (!key) throw new SealedSaveError('ERR_SAVE_KEY_UNKNOWN');
  const iv = Buffer.from(String(parsed.iv ?? ''), 'base64');
  const rest = bytes.subarray(end + 1);
  if (iv.length !== IV_BYTES || rest.length < TAG_BYTES) throw new SealedSaveError('ERR_SAVE_DAMAGED');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.concat([MAGIC, header]));
    decipher.setAuthTag(rest.subarray(0, TAG_BYTES));
    const plain = Buffer.concat([decipher.update(rest.subarray(TAG_BYTES)), decipher.final()]);
    return { meta: { app: String(parsed.app ?? ''), kind: String(parsed.kind ?? ''), createdAt: String(parsed.createdAt ?? '') }, plain };
  } catch {
    throw new SealedSaveError('ERR_SAVE_DAMAGED');
  }
}

/** A save as plain bytes, sealed or not (older plain saves stay readable for their import). */
export function readSave(bytes: Buffer, keyring: SaveKeyring): Buffer {
  return isSealedSave(bytes) ? openSave(bytes, keyring).plain : bytes;
}

/**
 * Seals a plain save file where it is (retroactive protection): the sealed copy is built, opened
 * again and compared, written next to it, then atomically replaces it. Returns false (and changes
 * nothing) for a file that is already sealed or unreadable.
 */
export function sealFileInPlace(file: string, keyring: SaveKeyring, meta: Omit<SaveMeta, 'createdAt'>): boolean {
  let plain: Buffer;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    plain = fs.readFileSync(file);
  } catch {
    return false;
  }
  if (isSealedSave(plain)) return false;
  const sealed = sealSave(plain, keyring, { ...meta, createdAt: stat.mtime.toISOString() });
  if (!openSave(sealed, keyring).plain.equals(plain)) return false;
  const temporary = `${file}.${process.pid}.sealing`;
  try {
    fs.writeFileSync(temporary, sealed);
    // One atomic replacement: the save is never lost, even if this is interrupted. (On an SSD,
    // overwriting the old bytes first would not reach the same cells anyway.)
    fs.renameSync(temporary, file);
    fs.utimesSync(file, stat.atime, stat.mtime);
    return true;
  } catch {
    fs.rmSync(temporary, { force: true });
    return false;
  }
}
