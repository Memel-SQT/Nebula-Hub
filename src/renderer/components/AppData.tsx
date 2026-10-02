import { useState } from 'react';
import { Icon } from '@nebula/design/react';
import type { ExportDataResult, ImportDataResult, InstallerSaveProgress, SaveInstallerResult } from '@shared/backup';
import type { CatalogEntry } from '@shared/catalog-view';
import { progressRatio } from '@shared/progress';
import { formatPercent, useLanguage, useT } from '../i18n';

/** What the screens need for the data actions (ADR-026), provided by App. */
export interface DataActions {
  backupCopyDirectory: string | null;
  exportData(appId: string): Promise<ExportDataResult>;
  importData(appId: string): Promise<ImportDataResult>;
  reveal(filePath: string): void;
}

/** "Download the installer": progress pushed by the main process, and the last result. */
export interface InstallerSaves {
  progress: Record<string, InstallerSaveProgress | undefined>;
  results: Record<string, SaveInstallerResult | undefined>;
  save(appId: string): void;
}

type Busy = 'export' | 'import' | null;
type Outcome = { kind: 'export'; result: ExportDataResult } | { kind: 'import'; result: ImportDataResult } | null;

/**
 * "Your data" for an app that makes its own backups (Finterest): the root folder where every backup
 * lands (and the app looks first), the optional copy, then export now and import a backup. With
 * both, uninstalling and reinstalling never loses anything (ADR-026).
 */
export function DataActionsPanel({ entry, installed, actions }: { entry: CatalogEntry; installed: boolean; actions: DataActions }) {
  const t = useT();
  const spec = entry.app.windows.preOperationBackup;
  const [busy, setBusy] = useState<Busy>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  if (!spec) return null;
  const name = entry.app.name;

  const run = (kind: 'export' | 'import') => {
    setBusy(kind);
    setOutcome(null);
    const done = (result: ExportDataResult | ImportDataResult) => {
      setBusy(null);
      setOutcome({ kind, result } as Outcome);
    };
    const failed = () => {
      setBusy(null);
      setOutcome(kind === 'export' ? { kind, result: { ok: false, reason: 'not-started' } } : { kind, result: { mode: 'failed' } });
    };
    (kind === 'export' ? actions.exportData(entry.app.id) : actions.importData(entry.app.id)).then(done, failed);
  };

  return (
    <div className="data-actions">
      <p className="panel-note"><Icon name="folderSync" size={16} />{t('data.root', { name, folder: spec.documentsFolder })}</p>
      <p className="panel-note muted">{actions.backupCopyDirectory ? t('data.copyOn', { path: actions.backupCopyDirectory, folder: spec.documentsFolder }) : t('data.copyOff')}</p>
      <p className="panel-note muted">{t('data.reinstall', { name })}</p>
      <div className="settings-actions">
        <button type="button" className="ghost small" disabled={!installed || busy !== null} aria-busy={busy === 'export'} onClick={() => run('export')}>
          <Icon name="upload" size={15} className={busy === 'export' ? 'spin' : undefined} />{busy === 'export' ? t('data.exporting') : t('data.export')}
        </button>
        <button type="button" className="ghost small" disabled={!installed || busy !== null} aria-busy={busy === 'import'} onClick={() => run('import')}>
          <Icon name="download" size={15} />{busy === 'import' ? t('data.importing') : t('data.import')}
        </button>
      </div>
      <div role="status" aria-live="polite">{outcome ? <DataOutcome outcome={outcome} name={name} onReveal={actions.reveal} /> : null}</div>
    </div>
  );
}

function DataOutcome({ outcome, name, onReveal }: { outcome: NonNullable<Outcome>; name: string; onReveal: (file: string) => void }) {
  const t = useT();
  const reveal = (file: string) => (
    <button type="button" className="ghost small" onClick={() => onReveal(file)}><Icon name="external" size={14} />{t('data.reveal')}</button>
  );
  if (outcome.kind === 'export') {
    const result = outcome.result;
    if (!result.ok) {
      const known = ['unsupported', 'not-installed', 'busy'].includes(result.reason);
      return <p className="operation-note error"><Icon name="alert" size={15} />{known ? t(`data.error.${result.reason as 'busy'}`) : t('data.error.backup', { problem: t(`backup.problem.${result.reason as 'missing'}`) })}</p>;
    }
    return (
      <div className="data-result">
        <p className="operation-meta success"><Icon name="check" size={13} /><span>{t('data.exported', { count: String(result.accounts) })}<code className="operation-path">{result.path}</code></span></p>
        {result.copyState === 'ok' ? <p className="operation-meta success"><Icon name="check" size={13} /><span>{t('backup.copyOk')}<code className="operation-path">{result.copyPath}</code></span></p> : null}
        {result.copyState === 'failed' ? <p className="operation-meta"><Icon name="alert" size={13} /><span>{t('backup.copyFailed')}<code className="operation-path">{result.copyPath}</code></span></p> : null}
        {reveal(result.path)}
      </div>
    );
  }
  const result = outcome.result;
  switch (result.mode) {
    case 'cancelled':
      return null;
    case 'launched':
      return <p className="operation-meta success"><Icon name="check" size={13} />{t('data.importLaunched', { count: String(result.accounts), name })}</p>;
    case 'manual':
      return (
        <div className="data-result">
          <p className="operation-meta success"><Icon name="info" size={13} /><span>{t('data.importManual', { count: String(result.accounts), name })}<code className="operation-path">{result.file}</code></span></p>
          {reveal(result.file)}
        </div>
      );
    case 'invalid':
      return <p className="operation-note error"><Icon name="alert" size={15} />{t('data.importInvalid', { problem: t(`backup.problem.${result.reason}`) })}</p>;
    default:
      return <p className="operation-note error"><Icon name="alert" size={15} />{t(`data.error.${result.mode}`)}</p>;
  }
}

/** "Download the installer" with its progress and result (verified file in Downloads). */
export function InstallerSaveButton({ entry, saves, onReveal }: { entry: CatalogEntry; saves: InstallerSaves; onReveal: (file: string) => void }) {
  const t = useT();
  const language = useLanguage();
  const progress = saves.progress[entry.app.id];
  const result = saves.results[entry.app.id];
  if (!entry.release?.installer) return null;
  return (
    <div className="installer-save">
      <button type="button" className="ghost" disabled={Boolean(progress)} aria-busy={Boolean(progress)} onClick={() => saves.save(entry.app.id)}>
        <Icon name="download" size={16} />
        {progress ? t('installer.saving', { percent: formatPercent(language, progressRatio(progress.received, progress.total)) }) : t('installer.save')}
      </button>
      <div role="status" aria-live="polite">
        {!progress && result?.ok ? (
          <div className="data-result">
            <p className="operation-meta success"><Icon name="check" size={13} /><span>{t('installer.saved')}<code className="operation-path">{result.path}</code></span></p>
            <button type="button" className="ghost small" onClick={() => onReveal(result.path)}><Icon name="external" size={14} />{t('data.reveal')}</button>
          </div>
        ) : null}
        {!progress && result && !result.ok ? <p className="operation-note error"><Icon name="alert" size={15} />{t(`installer.error.${result.reason}`)}</p> : null}
        {!progress && !result ? <small className="path-note">{t('installer.saveHint')}</small> : null}
      </div>
    </div>
  );
}
