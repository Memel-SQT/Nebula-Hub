import type { CatalogView } from '@shared/catalog-view';
import type { InstalledView } from '@shared/installed-view';
import type { LoadState } from '../components/ScreenState';
import type { Route } from '../navigation';

/** Common props of the data screens. */
export interface DataScreenProps {
  status: LoadState;
  /** Date of the last successful sync, shown by the offline state. */
  syncedAt?: string | null;
  onNavigate: (route: Route) => void;
  onRetry?: () => void;
}

/** Screens fed by the signed catalog (M2) and the detection of installed apps (M3). */
export interface CatalogScreenProps {
  catalog: CatalogView;
  onNavigate: (route: Route) => void;
  onRefresh: () => void;
  installed?: InstalledView;
  onLaunch?: (appId: string) => void;
  onShowFolder?: (appId: string) => void;
}
