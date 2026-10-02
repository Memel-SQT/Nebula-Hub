import type { CatalogView } from '@shared/catalog-view';
import type { DownloadsView, OperationKind, OperationView } from '@shared/install-state';
import type { InstalledView } from '@shared/installed-view';
import type { Route } from '../navigation';
import type { DataActions, InstallerSaves } from '../components/AppData';

/** Screens fed by the signed catalog (M2) and the detection of installed apps (M3). */
export interface CatalogScreenProps {
  catalog: CatalogView;
  onNavigate: (route: Route) => void;
  onRefresh: () => void;
  installed?: InstalledView;
  onLaunch?: (appId: string) => void;
  onShowFolder?: (appId: string) => void;
  /** Install operations (M4). */
  downloads?: DownloadsView;
  onInstall?: (appId: string) => void;
  onCancelOperation?: (operationId: string) => void;
  onDismissOperation?: (operationId: string) => void;
  /** Update, repair, uninstall (M5): asks for a confirmation first when needed (R04). */
  onOperation?: (appId: string, kind: OperationKind) => void;
  onRequestClose?: (operationId: string) => void;
  onContinueWithoutBackup?: (operation: OperationView) => void;
  onUpdateAll?: () => void;
  /** Apps updated automatically (settings), and the switch. */
  autoUpdate?: Record<string, boolean>;
  onToggleAutoUpdate?: (appId: string, enabled: boolean) => void;
  /** Export / import of the app's data, backup copy folder (ADR-026). */
  dataActions?: DataActions;
  /** "Download the installer" (ADR-026). */
  installerSaves?: InstallerSaves;
}
