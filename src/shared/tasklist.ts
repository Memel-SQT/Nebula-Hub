/**
 * Image names of the running processes from `tasklist /FO CSV /NH` (brief §7.1). Only lines that
 * are CSV records are read: the "no task" message is localized and simply ignored. Lower-cased,
 * since Windows file names are case-insensitive.
 */
export function parseTasklist(output: string): Set<string> {
  const names = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)","\d+"/.exec(line.trim());
    if (match) names.add(match[1].toLowerCase());
  }
  return names;
}

export function isRunning(processes: Set<string>, exeName: string): boolean {
  return processes.has(exeName.toLowerCase());
}
