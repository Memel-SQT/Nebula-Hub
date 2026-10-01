import { Icon } from '@nebula/design/react';
import type { CatalogView } from '@shared/catalog-view';
import { formatDateTime, useLanguage, useT } from '../i18n';

/** Rejected remote catalog (R03) and GitHub rate limit: said plainly, never as a stack trace. */
export function CatalogNotices({ view }: { view: CatalogView }) {
  const t = useT();
  const language = useLanguage();
  return (
    <>
      {view.warning === 'signature-invalid' ? (
        <div className="state-banner warning-banner" role="alert">
          <Icon name="shield" size={18} />
          <div><span>{t('catalog.warning.signature')}</span></div>
        </div>
      ) : null}
      {view.rateLimitedUntil ? (
        <div className="state-banner" role="status">
          <Icon name="info" size={18} />
          <div><span>{t('catalog.rateLimitedUntil', { time: formatDateTime(language, view.rateLimitedUntil) })}</span></div>
        </div>
      ) : null}
    </>
  );
}
