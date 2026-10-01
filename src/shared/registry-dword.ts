/**
 * Reads one REG_DWORD value from `reg.exe query <key> /v <name>` output. The value lines are
 * not localized (`    Name    REG_DWORD    0x1`) and DWORDs are plain ASCII, so `reg query` is
 * safe here; string values go through `reg export` instead (ADR-003). Returns null when the
 * value is absent or malformed.
 */
export function parseRegDword(output: string, name: string): number | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`^\\s+${escaped}\\s+REG_DWORD\\s+0x([0-9a-f]+)\\s*$`, 'im'));
  return match ? parseInt(match[1], 16) : null;
}
