import { backupArgument, backupFileName, backupPath, validateBackup } from './backup';
import type { PreOperationBackup } from './catalog';

const FINTEREST: PreOperationBackup = { argument: '--backup-before-uninstall=', documentsFolder: 'Nebula Finterest', filePrefix: 'finterest-store-backup', format: 'finterest-backup-v1' };
const NOW = new Date(2026, 9, 1, 21, 5, 3);

describe('backup file', () => {
  it('has a sortable, never-reused name', () => {
    expect(backupFileName('finterest-store-backup', NOW)).toBe('finterest-store-backup-2026-10-01_21-05-03.json');
  });

  it('goes into the app folder of Documents', () => {
    expect(backupPath('C:\\Users\\Noé\\Documents\\', FINTEREST, NOW)).toBe('C:\\Users\\Noé\\Documents\\Nebula Finterest\\finterest-store-backup-2026-10-01_21-05-03.json');
  });

  it('is passed as a single argument', () => {
    expect(backupArgument(FINTEREST, 'C:\\Docs\\Nebula Finterest\\b.json')).toBe('--backup-before-uninstall=C:\\Docs\\Nebula Finterest\\b.json');
  });
});

describe('validateBackup (shape only, R07)', () => {
  const file = (patch: Record<string, unknown> = {}) => JSON.stringify({ app: 'Finterest', version: 1, exportedAt: '2026-10-01T19:05:03.000Z', accounts: [{ name: 'Noé', snapshot: { months: [] } }, { name: 'Démo', snapshot: {} }], ...patch });

  it('accepts a Finterest backup and counts its accounts', () => {
    expect(validateBackup('finterest-backup-v1', file())).toEqual({ ok: true, accounts: 2 });
  });

  it('accepts a backup without accounts (nothing to lose), and says so through the count', () => {
    expect(validateBackup('finterest-backup-v1', file({ accounts: [] }))).toEqual({ ok: true, accounts: 0 });
  });

  it.each([
    ['empty', '  '],
    ['invalid', '{ not json'],
    ['unknown-format', JSON.stringify([1, 2])],
    ['unknown-format', file({ app: 'Other' })],
    ['unknown-format', file({ version: 2 })],
    ['unknown-format', file({ exportedAt: undefined })],
    ['invalid', file({ accounts: 'none' })],
    ['invalid', file({ accounts: [{ name: 'x' }] })],
    ['invalid', file({ accounts: [{ snapshot: {} }] })],
  ])('refuses %s content', (reason, text) => {
    expect(validateBackup('finterest-backup-v1', text)).toEqual({ ok: false, reason });
  });
});
