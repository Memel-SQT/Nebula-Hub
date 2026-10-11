import { useState } from 'react';
import { Icon } from '@nebula/design/react';
import { useT } from '../i18n';

/**
 * The family's save key (ADR-040): every backup and export of the Nebula apps is sealed with it,
 * protected by Windows for this account. The recovery key is shown only on request (it opens
 * every save); another computer's key can be added so its saves open here too.
 */
export function SaveKeyPanel({ onReveal, onImport }: { onReveal: () => Promise<string | null>; onImport: (code: string) => Promise<boolean> }) {
  const t = useT();
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'added' | 'invalid' | 'error'>('idle');

  const reveal = async () => {
    setCode(code ? null : await onReveal().catch(() => null));
  };
  const add = async () => {
    const added = await onImport(input).catch(() => null);
    setStatus(added === null ? 'error' : added ? 'added' : 'invalid');
    if (added) setInput('');
  };

  return (
    <>
      <p className="settings-label" id="settings-save-key-label">{t('settings.saveKey')}</p>
      <small className="path-note">{t('settings.saveKey.hint')}</small>
      <div className="install-dir-actions">
        <button type="button" className="ghost small" data-sound="toggle" onClick={() => void reveal()} aria-expanded={code !== null}>
          <Icon name={code ? 'eyeOff' : 'eye'} size={15} />{t(code ? 'settings.saveKey.hide' : 'settings.saveKey.show')}
        </button>
      </div>
      {code ? (
        <div className="save-key-code" role="group" aria-labelledby="settings-save-key-label">
          <code className="install-dir-path">{code}</code>
          <small className="path-note warning-note"><Icon name="alert" size={14} />{t('settings.saveKey.warning')}</small>
        </div>
      ) : null}
      <p className="settings-label" id="settings-save-key-import-label">{t('settings.saveKey.import')}</p>
      <div className="install-dir-actions">
        <input
          type="text"
          className="save-key-input"
          aria-labelledby="settings-save-key-import-label"
          placeholder="XXXXXXXX-XXXXXXXX-…"
          value={input}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setInput(event.target.value);
            setStatus('idle');
          }}
        />
        <button type="button" className="small" data-sound="toggle" disabled={!input.trim()} onClick={() => void add()}>
          <Icon name="plus" size={15} />{t('settings.saveKey.add')}
        </button>
      </div>
      {status !== 'idle' ? (
        <small className={`path-note ${status === 'added' ? '' : 'warning-note'}`} role="status">
          {t(status === 'added' ? 'settings.saveKey.added' : status === 'invalid' ? 'settings.saveKey.invalid' : 'settings.saveKey.error')}
        </small>
      ) : null}
    </>
  );
}
