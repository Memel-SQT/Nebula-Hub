import { Icon } from '@nebula/design/react';
import type { CatalogView } from '@shared/catalog-view';
import { isActive, type DownloadsView, type OperationKind } from '@shared/install-state';
import { updateAvailable, type InstalledView } from '@shared/installed-view';
import { familyEntries, installedOf, operationOf } from '../catalog';
import { useT } from '../i18n';
import { AppIcon, Panel } from './Cards';

/**
 * "Updates available" (brief §9.1, §9.4): one line per installed app with a newer release, its
 * own button, and "Update all". Hidden when everything is up to date.
 */
export function UpdatesPanel({ catalog, installed, downloads, onOperation, onUpdateAll }: {
  catalog: CatalogView;
  installed?: InstalledView;
  downloads?: DownloadsView;
  onOperation?: (appId: string, kind: OperationKind) => void;
  onUpdateAll?: () => void;
}) {
  const t = useT();
  const updates = familyEntries(catalog)
    .map((entry) => ({ entry, app: installedOf(installed, entry.app.id) }))
    .filter(({ entry, app }) => updateAvailable(entry, app));
  if (updates.length === 0) return null;
  const busy = (appId: string) => {
    const operation = operationOf(downloads, appId);
    return Boolean(operation && isActive(operation.phase));
  };

  return (
    <Panel eyebrow={t('myApps.updates.eyebrow')} title={t('myApps.updates.title')} badge={String(updates.length)} labelledBy="updates-panel" className="updates-panel">
      <ul className="update-list">
        {updates.map(({ entry, app }) => (
          <li key={entry.app.id} className="update-row">
            <AppIcon src={entry.icon} size={34} />
            <strong>{entry.app.name}</strong>
            <span className="tabular update-versions">v{app!.version} → v{entry.release!.version}</span>
            {onOperation ? (
              <button type="button" className="ghost small" disabled={busy(entry.app.id)} aria-label={t('app.action.updateNamed', { name: entry.app.name })} onClick={() => onOperation(entry.app.id, 'update')}>
                <Icon name="update" size={15} />{t('app.action.update')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {onUpdateAll && updates.length > 1 ? (
        <div className="settings-actions settings-reset">
          <button type="button" className="small" disabled={updates.every(({ entry }) => busy(entry.app.id))} onClick={onUpdateAll}>
            <Icon name="update" size={15} />{t('app.action.updateAll')}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
