/**
 * Registry fixtures. The HKCU blocks are real `reg.exe export` outputs of the three Nebula apps
 * (2026-10-01), anonymized (`<user>`); other installed software was deliberately not exported.
 * The HKLM blocks are synthetic, written in reg.exe's exact format, to cover per-machine installs,
 * the 32-bit view, REG_EXPAND_SZ (hex(2), wrapped on several lines) and escaped quotes.
 */
const U = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

export const HKCU_UNINSTALL = `Windows Registry Editor Version 5.00

[${U}]

[${U}\\a0d0bf64-c6cf-5893-bede-cd00c2b7eccb]
"DisplayName"="Nebula Finterest 0.1.35"
"UninstallString"="\\"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\finterest\\\\Uninstall Nebula Finterest.exe\\" /currentuser"
"QuietUninstallString"="\\"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\finterest\\\\Uninstall Nebula Finterest.exe\\" /currentuser /S"
"DisplayVersion"="0.1.35"
"DisplayIcon"="C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\finterest\\\\Nebula Finterest.exe,0"
"Publisher"="Nebula Finterest"
"NoModify"=dword:00000001
"NoRepair"=dword:00000001
"EstimatedSize"=dword:00049d74

[${U}\\ac8066bb-d655-5a0d-a302-45aba0772a00]
"DisplayName"="Nebula News 0.1.0"
"UninstallString"="\\"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\Nebula News\\\\Uninstall Nebula News.exe\\" /currentuser"
"QuietUninstallString"="\\"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\Nebula News\\\\Uninstall Nebula News.exe\\" /currentuser /S"
"DisplayVersion"="0.1.0"
"DisplayIcon"="C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\Nebula News\\\\Nebula News.exe,0"
"Publisher"="Nebula News"
"Comments"="Daily world news briefing, aggregated from neutral French/English sources, in a premium dark cosmic UI."
"NoModify"=dword:00000001
"NoRepair"=dword:00000001

[${U}\\d73baec4-4824-54af-a3fc-a74adb31ad31]
"DisplayName"="Nebula Clock 1.1.3"
"UninstallString"="\\"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\Nebula Clock\\\\Uninstall Nebula Clock.exe\\" /currentuser"
"QuietUninstallString"="\\"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\Nebula Clock\\\\Uninstall Nebula Clock.exe\\" /currentuser /S"
"DisplayVersion"="1.1.3"
"Publisher"="Nebula Clock contributors"

[${U}\\Nebula Finterest Companion]
"DisplayName"="Nebula FinterestCompanion 2.0"
"DisplayVersion"="2.0.0"
`;

export const HKCU_INSTALL_FINTEREST = `Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\\Software\\a0d0bf64-c6cf-5893-bede-cd00c2b7eccb]
"InstallLocation"="C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Programs\\\\finterest"
"KeepShortcuts"="true"
"ShortcutName"="Nebula Finterest"
`;

/** reg.exe's hex(2) encoding of a REG_EXPAND_SZ, wrapped like reg.exe does. */
export function hex2(name: string, value: string): string {
  const bytes = [...Buffer.from(`${value}\0`, 'utf16le')].map((byte) => byte.toString(16).padStart(2, '0'));
  const lines: string[] = [];
  let line = `"${name}"=hex(2):`;
  for (const [index, byte] of bytes.entries()) {
    const piece = `${byte}${index < bytes.length - 1 ? ',' : ''}`;
    if (line.length + piece.length > 78) {
      lines.push(`${line}\\`);
      line = '  ';
    }
    line += piece;
  }
  lines.push(line);
  return lines.join('\r\n');
}

const M = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

export const HKLM32_UNINSTALL = [
  'Windows Registry Editor Version 5.00',
  '',
  `[${M}\\d73baec4-4824-54af-a3fc-a74adb31ad31]`,
  '"DisplayName"="Nebula Clock 1.1.2"',
  '"DisplayVersion"="1.1.2"',
  hex2('UninstallString', '"%ProgramFiles%\\Nebula Clock\\Uninstall Nebula Clock.exe" /allusers'),
  '"Publisher"="Nebula \\"Clock\\" contributors"',
  '',
  `[${M}\\{11111111-2222-3333-4444-555555555555}]`,
  '"DisplayName"="Logiciel de Noé"',
  '"DisplayVersion"="1.0"',
  '',
].join('\r\n');
