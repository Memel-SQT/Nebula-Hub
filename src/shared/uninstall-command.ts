import { FORBIDDEN_ARGUMENT } from './installer-args';
import { expandEnvironment } from './reg-file';

/**
 * The uninstall command of an installed app (brief §7.7, ADR-004), turned into an `execFile`
 * array without a shell (R11). The registry gives a command line such as
 * `"C:\…\Uninstall Nebula Finterest.exe" /currentuser /S`; it is only trusted when the executable
 * is an absolute `.exe` inside the app's own install folder and every argument is a plain switch.
 * `QuietUninstallString` is preferred; otherwise `UninstallString` gets `/S`.
 */
export interface CommandLine {
  executable: string;
  args: string[];
}

const SAFE_SWITCH = /^(\/[A-Za-z]{1,20}|--[a-z][a-z-]{1,40})$/;

/** Splits `"exe path" /a /b` (or an unquoted path ending in `.exe`) into executable and args. */
export function parseCommandLine(value: string): CommandLine | null {
  const text = value.trim();
  let executable: string;
  let rest: string;
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    if (end < 0) return null;
    executable = text.slice(1, end);
    rest = text.slice(end + 1);
  } else {
    const match = /^(.+?\.exe)(?=\s|$)/i.exec(text);
    if (!match) return null;
    executable = match[1];
    rest = text.slice(match[1].length);
  }
  if (rest.includes('"')) return null;
  return { executable, args: rest.split(/\s+/).filter(Boolean) };
}

function insideFolder(file: string, folder: string): boolean {
  const base = folder.replace(/[\\/]+$/, '').toLowerCase();
  return file.toLowerCase().startsWith(`${base}\\`);
}

export function uninstallCommand(
  entry: { uninstallString: string | null; quietUninstallString: string | null },
  location: string,
  env: Record<string, string | undefined>,
): CommandLine | null {
  const source = entry.quietUninstallString ?? entry.uninstallString;
  if (!source) return null;
  const parsed = parseCommandLine(expandEnvironment(source, env));
  if (!parsed) return null;
  const { executable, args } = parsed;
  if (!/^[A-Za-z]:\\/.test(executable) || !executable.toLowerCase().endsWith('.exe') || executable.includes('..')) return null;
  if (!insideFolder(executable, expandEnvironment(location, env))) return null;
  if (!args.every((arg) => SAFE_SWITCH.test(arg)) || args.some((arg) => arg.toLowerCase() === FORBIDDEN_ARGUMENT)) return null;
  return { executable, args: args.some((arg) => arg.toUpperCase() === '/S') ? args : [...args, '/S'] };
}
