import type { LoadState } from '../components/ScreenState';
import type { Route } from '../navigation';

/** Common props of the data screens. Data arrives from M2 (catalog) and M3 (detection) on. */
export interface DataScreenProps {
  status: LoadState;
  /** Date of the last successful sync, shown by the offline state. */
  syncedAt?: string | null;
  onNavigate: (route: Route) => void;
  onRetry?: () => void;
}
