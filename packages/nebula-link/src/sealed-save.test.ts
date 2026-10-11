/**
 * @jest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  importRecoveryCode,
  isSealedSave,
  loadSaveKeyring,
  openSave,
  readSave,
  recoveryCode,
  sealFileInPlace,
  sealSave,
  windowsProtector,
  type KeyProtector,
} from './sealed-save';

/** Stands in for Windows protection: reversible, and tied to one "account" (the mask). */
function fakeProtector(mask = 0x5a): KeyProtector {
  const flip = (data: Buffer) => Buffer.from(data.map((byte) => byte ^ mask));
  return { protect: async (data) => flip(data), unprotect: async (data) => flip(data) };
}

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-seal-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('sealed saves (spec § 19)', () => {
  it('creates the family key once, protected, and reads the same key again', async () => {
    const file = path.join(dir, 'save-key.json');
    const first = await loadSaveKeyring({ file, protector: fakeProtector() });
    const second = await loadSaveKeyring({ file, protector: fakeProtector() });
    expect(second.current.id).toBe(first.current.id);
    const stored = fs.readFileSync(file, 'utf8');
    // The raw key never lands on disk.
    expect(stored).not.toContain(first.current.key.toString('base64'));
    expect(stored).not.toContain(first.current.key.toString('hex'));
  });

  it('gives every app starting together the same key', async () => {
    const file = path.join(dir, 'save-key.json');
    // Each protector call yields, so the apps interleave like separate processes would.
    const slow = (): KeyProtector => {
      const base = fakeProtector();
      return { protect: async (data) => { await new Promise((resolve) => setTimeout(resolve, 5)); return base.protect(data); }, unprotect: base.unprotect };
    };
    const rings = await Promise.all([1, 2, 3, 4].map(() => loadSaveKeyring({ file, protector: slow() })));
    expect(new Set(rings.map((ring) => ring.current.id)).size).toBe(1);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).keys).toHaveLength(1);
  });

  it('seals and opens a save; the content is not readable in the file', async () => {
    const keyring = await loadSaveKeyring({ file: path.join(dir, 'k.json'), protector: fakeProtector() });
    const plain = Buffer.from(JSON.stringify({ app: 'Sample', income: 2750, label: 'secret-label' }));
    const sealed = sealSave(plain, keyring, { app: 'nebula.sample', kind: 'backup' });
    expect(isSealedSave(sealed)).toBe(true);
    expect(sealed.includes(Buffer.from('secret-label'))).toBe(false);
    const opened = openSave(sealed, keyring);
    expect(opened.plain.equals(plain)).toBe(true);
    expect(opened.meta).toMatchObject({ app: 'nebula.sample', kind: 'backup' });
    // Older plain saves stay readable.
    expect(readSave(plain, keyring).equals(plain)).toBe(true);
  });

  it('refuses a tampered save, a changed header and an unknown key', async () => {
    const keyring = await loadSaveKeyring({ file: path.join(dir, 'k.json'), protector: fakeProtector() });
    const sealed = sealSave(Buffer.from('payload'), keyring, { app: 'nebula.sample', kind: 'backup' });
    const flipped = Buffer.from(sealed);
    flipped[flipped.length - 1] ^= 1;
    expect(() => openSave(flipped, keyring)).toThrow('ERR_SAVE_DAMAGED');
    const relabelled = Buffer.from(sealed.toString('latin1').replace('"backup"', '"export"'), 'latin1');
    expect(() => openSave(relabelled, keyring)).toThrow('ERR_SAVE_DAMAGED');
    const other = await loadSaveKeyring({ file: path.join(dir, 'other.json'), protector: fakeProtector() });
    expect(() => openSave(sealed, other)).toThrow('ERR_SAVE_KEY_UNKNOWN');
  });

  it('restores on another computer with the recovery code, keeping its own key', async () => {
    const here = await loadSaveKeyring({ file: path.join(dir, 'here.json'), protector: fakeProtector() });
    const sealed = sealSave(Buffer.from('backup of this PC'), here, { app: 'nebula.sample', kind: 'backup' });
    const elsewhereFile = path.join(dir, 'elsewhere.json');
    const before = await loadSaveKeyring({ file: elsewhereFile, protector: fakeProtector(0x33) });
    expect(await importRecoveryCode('not a code', { file: elsewhereFile, protector: fakeProtector(0x33) })).toBe(false);
    expect(await importRecoveryCode(recoveryCode(here), { file: elsewhereFile, protector: fakeProtector(0x33) })).toBe(true);
    const after = await loadSaveKeyring({ file: elsewhereFile, protector: fakeProtector(0x33) });
    expect(openSave(sealed, after).plain.toString()).toBe('backup of this PC');
    expect(after.keys.has(before.current.id)).toBe(true);
    expect(recoveryCode(here)).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{8}){7}$/);
  });

  it('seals an existing plain save in place, once, keeping its date (retroactive)', async () => {
    const keyring = await loadSaveKeyring({ file: path.join(dir, 'k.json'), protector: fakeProtector() });
    const file = path.join(dir, 'sample-backup.json');
    fs.writeFileSync(file, '{"secret":"plain"}');
    const old = new Date('2026-01-02T03:04:05Z');
    fs.utimesSync(file, old, old);
    expect(sealFileInPlace(file, keyring, { app: 'nebula.sample', kind: 'backup' })).toBe(true);
    const bytes = fs.readFileSync(file);
    expect(isSealedSave(bytes)).toBe(true);
    expect(bytes.includes(Buffer.from('plain'))).toBe(false);
    expect(openSave(bytes, keyring).plain.toString()).toBe('{"secret":"plain"}');
    expect(fs.statSync(file).mtime.toISOString()).toBe(old.toISOString());
    expect(sealFileInPlace(file, keyring, { app: 'nebula.sample', kind: 'backup' })).toBe(false);
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.sealing'))).toEqual([]);
  });

  (process.platform === 'win32' ? it : it.skip)('protects the key with Windows (DPAPI) for real', async () => {
    const data = Buffer.from('0123456789abcdef0123456789abcdef');
    const protectedBytes = await windowsProtector.protect(data);
    expect(protectedBytes.equals(data)).toBe(false);
    expect((await windowsProtector.unprotect(protectedBytes)).equals(data)).toBe(true);
  }, 60_000);
});
