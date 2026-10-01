import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon, type IconName } from '@nebula/design/react';
import { localize } from '@shared/catalog';
import type { CatalogEntry } from '@shared/catalog-view';
import type { OperationPlan } from '@shared/install-state';
import { useLanguage, useT } from '../i18n';

/**
 * Modal confirmation (R04): says what will happen before anything does. Keyboard first: focus
 * goes to the safe choice (Cancel), stays inside the dialog, and Escape cancels.
 */
export function ConfirmDialog({ title, icon = 'alert', tone = 'warning', confirmLabel, onConfirm, onCancel, children }: {
  title: string;
  icon?: IconName;
  tone?: 'warning' | 'danger' | 'accent';
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div ref={dialog} className={`dialog nebula-surface tone-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="dialog-head">
          <span className="dialog-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">
          <button ref={cancel} type="button" className="ghost" onClick={onCancel}>{t('confirm.cancel')}</button>
          <button type="button" className={tone === 'danger' ? 'danger' : ''} data-sound="none" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const KIND_ICON: Record<OperationPlan['kind'], IconName> = { install: 'download', update: 'update', repair: 'repair', uninstall: 'uninstall' };

/** The body of an update / repair / uninstall confirmation: versions, data notice, backup, open app. */
export function OperationConfirmation({ plan, entry, onConfirm, onCancel }: {
  plan: OperationPlan;
  entry: CatalogEntry;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const language = useLanguage();
  const name = entry.app.name;
  const params = { name, version: plan.version ? `v${plan.version}` : '', from: plan.fromVersion ? `v${plan.fromVersion}` : '' };
  return (
    <ConfirmDialog
      title={t(`confirm.${plan.kind}.title`, params)}
      icon={KIND_ICON[plan.kind]}
      tone={plan.kind === 'uninstall' ? 'danger' : 'warning'}
      confirmLabel={t(`confirm.${plan.kind}.confirm`)}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{t(`confirm.${plan.kind}.body`, params)}</p>
      <section className="dialog-section" aria-label={t('confirm.data')}>
        <h3><Icon name="shield" size={15} />{t('confirm.data')}</h3>
        <p>{entry.app.dataNotice ? localize(entry.app.dataNotice, language) : t('confirm.noNotice')}</p>
        {plan.backupPath ? (
          <>
            <p>{t('confirm.backup', { name })}</p>
            <code className="dialog-path">{plan.backupPath}</code>
            <p className="dialog-note">{t('confirm.backupCheck')}</p>
          </>
        ) : null}
      </section>
      {plan.running ? <p className="dialog-note warning"><Icon name="pause" size={15} />{t('confirm.running', { name })}</p> : null}
    </ConfirmDialog>
  );
}
