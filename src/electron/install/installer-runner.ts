import { spawn } from 'node:child_process';

/**
 * Runs a verified installer (brief §7.4, R11): `spawn` with an argument array and no shell.
 *
 * A silent NSIS installer returns when it is done, with 0 on success. If it takes longer than
 * the limit, the Hub stops waiting and says so, but does **not** kill it (R08): an installer
 * stopped half-way would leave a broken app. The next detection tells what really happened.
 */
export type InstallerResult = { kind: 'exit'; code: number | null } | { kind: 'timeout' };

export interface InstallerRunner {
  run(installer: string, args: readonly string[], timeoutMs: number): Promise<InstallerResult>;
}

export const spawnInstallerRunner: InstallerRunner = {
  run(installer, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      const child = spawn(installer, [...args], { shell: false, windowsHide: true, stdio: 'ignore' });
      const timer = setTimeout(() => {
        child.removeAllListeners('exit');
        child.unref();
        resolve({ kind: 'timeout' });
      }, timeoutMs);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve({ kind: 'exit', code });
      });
    });
  },
};
