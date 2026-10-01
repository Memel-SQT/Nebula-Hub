import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newToken, parseManifestBytes, PROTOCOL, sha256Hex, type SessionFile } from '@nebula/link';
import { writeFileAtomic } from '../fsutil';
import type { AdmittedApp } from './link-server';

/**
 * Link session (docs/NEBULA_LINK.md § 3–4): one pipe per Windows user, named after a hash of the
 * user's SID, and a fresh 32-byte token written at each Hub start in
 * `%LOCALAPPDATA%\Nebula Link\session.json` (inside the user's profile, so not readable by other
 * accounts). The file is removed when the Hub quits normally.
 */
export function defaultSessionDir(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Nebula Link');
}

/** `whoami /user /fo csv /nh` → `"domain\user","S-1-5-21-…"` (execFile, no shell — R11). */
export function parseSid(output: string): string | null {
  const match = /"(S-1-[0-9-]+)"/.exec(output);
  return match ? match[1] : null;
}

function currentSid(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      resolve(error ? null : parseSid(String(stdout)));
    });
  });
}

export function pipeForUser(sid: string): string {
  return `\\\\.\\pipe\\nebula-link-${sha256Hex(sid).slice(0, 16)}`;
}

/** The user's pipe; without a SID (unexpected), the account name stands in. */
export async function userPipe(): Promise<string> {
  const sid = await currentSid();
  return pipeForUser(sid ?? `${process.env.USERDOMAIN ?? ''}\\${os.userInfo().username}`);
}

export async function writeSession(directory: string, pipe: string, hubVersion: string): Promise<SessionFile> {
  const session: SessionFile = { protocol: PROTOCOL, pipe, token: newToken(), hubVersion, pid: process.pid, createdAt: new Date().toISOString() };
  await fs.mkdir(directory, { recursive: true });
  await writeFileAtomic(path.join(directory, 'session.json'), JSON.stringify(session, null, 2));
  return session;
}

export async function removeSession(directory: string, token: string): Promise<void> {
  const file = path.join(directory, 'session.json');
  try {
    // Only our own session: a newer Hub may already have replaced it.
    const current = JSON.parse(await fs.readFile(file, 'utf8')) as { token?: string };
    if (current.token === token) await fs.rm(file, { force: true });
  } catch {
    // Nothing to remove.
  }
}

/**
 * The manifest of an installed app, read from its install folder (`resources\<file>`), never
 * from what the app sends (§ 5). Null when absent, too big or invalid, or for another app.
 */
export async function readInstalledManifest(appId: string, location: string, fileName: string): Promise<AdmittedApp | null> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.json$/.test(fileName)) return null;
  try {
    const bytes = await fs.readFile(path.join(location, 'resources', fileName));
    const parsed = parseManifestBytes(bytes);
    if (!parsed.ok || parsed.manifest.appId !== appId) return null;
    return { appId, manifest: parsed.manifest, hash: sha256Hex(bytes) };
  } catch {
    return null;
  }
}
