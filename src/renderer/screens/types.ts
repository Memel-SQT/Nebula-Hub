import type { CatalogView } from '@shared/catalog-view';
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

/** Screens fed by the signed catalog (M2). */
export interface CatalogScreenProps {
  catalog: CatalogView;
  onNavigate: (route: Route) => void;
  onRefresh: () => void;
}
