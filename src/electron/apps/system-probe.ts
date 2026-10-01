import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decodeRegFile } from '../../shared/reg-file';
import { parseTasklist } from '../../shared/tasklist';

/**
 * The few things the Hub asks Windows, through execFile/spawn with argument arrays only (R11):
 * registry exports (ADR-003), the process list, file existence, starting an app. Behind an
 * interface so the detection logic is tested without touching the real system.
 */
export interface SystemProbe {
  /** Text of `reg export <key>`, or null when the key does not exist. */
  exportRegistry(key: string): Promise<string | null>;
  /** Lower-cased image names of the running processes. */
  runningProcesses(): Promise<Set<string>>;
  fileExists(filePath: string): Promise<boolean>;
  /** Starts a program detached from the Hub (it keeps running if the Hub quits). */
  start(executable: string, workingDirectory: string, args?: readonly string[]): Promise<void>;
  /**
   * Asks a program to close, politely: `taskkill /IM <exe>` **without** `/F` sends a close
   * message to its windows, exactly like clicking their close button. Never forced (R08); only
   * called after the user asked for it.
   */
  requestClose(exeName: string): Promise<void>;
}

let exportCounter = 0;

function run(command: string, args: string[], options: { timeout: number; maxBuffer?: number; encoding?: BufferEncoding }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: options.timeout, maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024, encoding: options.encoding ?? 'latin1' }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });
}

export const windowsProbe: SystemProbe = {
  async exportRegistry(key) {
    const target = path.join(os.tmpdir(), `nebula-hub-${process.pid}-${(exportCounter += 1)}.reg`);
    try {
      await run('reg.exe', ['export', key, target, '/y'], { timeout: 15_000 });
      return decodeRegFile(await fs.readFile(target));
    } catch {
      // reg.exe exits with 1 when the key does not exist (e.g. no per-machine install).
      return null;
    } finally {
      await fs.rm(target, { force: true });
    }
  },

  async runningProcesses() {
    try {
      return parseTasklist(await run('tasklist.exe', ['/FO', 'CSV', '/NH'], { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }));
    } catch {
      return new Set();
    }
  },

  async fileExists(filePath) {
    try {
      return (await fs.stat(filePath)).isFile();
    } catch {
      return false;
    }
  },

  async requestClose(exeName) {
    // taskkill reports an error when an app has no window to close (tray): nothing else to do.
    await run('taskkill.exe', ['/IM', exeName], { timeout: 10_000 }).catch(() => undefined);
  },

  start(executable, workingDirectory, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], { cwd: workingDirectory, detached: true, stdio: 'ignore', windowsHide: false });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  },
};
