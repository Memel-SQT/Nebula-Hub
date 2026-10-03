import { isRunning } from '../../shared/tasklist';

/**
 * "Quit Nebula" (ADR-030): closes every running family app, then the Hub quits. Only after the
 * user's explicit confirmation, which says what happens (R08).
 *
 * 1. Each running app is asked to close politely (`taskkill /IM` without `/F`: a close message to
 *    its windows, like its close button), so it saves its data and quits by itself.
 * 2. The Hub waits a few seconds for them to exit.
 * 3. The ones still running (an app that only hides to the tray when its window closes, a hung
 *    app) are then stopped with their child processes (`taskkill /F /T /IM`).
 *
 * Only the executables of the signed catalog are ever named, never the Hub's own.
 */
export interface QuitNebulaDeps {
  /** Executable names of the family apps (catalog `exeName`), the Hub excluded. */
  exeNames: readonly string[];
  running(): Promise<Set<string>>;
  requestClose(exeName: string): Promise<void>;
  forceClose(exeName: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** How long the apps get to close by themselves. */
  graceMs?: number;
  pollMs?: number;
}

export interface QuitNebulaReport {
  /** Closed by themselves after the polite request. */
  closed: string[];
  /** Still running after the grace period, then stopped. */
  forced: string[];
}

export async function closeNebulaApps(deps: QuitNebulaDeps): Promise<QuitNebulaReport> {
  const before = await deps.running();
  const targets = deps.exeNames.filter((name) => isRunning(before, name));
  if (targets.length === 0) return { closed: [], forced: [] };
  await Promise.all(targets.map((name) => deps.requestClose(name)));

  const grace = deps.graceMs ?? 6000;
  const poll = deps.pollMs ?? 500;
  let left = targets;
  for (let waited = 0; waited < grace && left.length > 0; waited += poll) {
    await deps.sleep(poll);
    const now = await deps.running();
    left = left.filter((name) => isRunning(now, name));
  }
  await Promise.all(left.map((name) => deps.forceClose(name)));
  return { closed: targets.filter((name) => !left.includes(name)), forced: left };
}
