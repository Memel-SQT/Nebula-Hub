/**
 * The screens of the Hub, as typed state (no router, as in Nebula Finterest). Shared because the
 * main process can ask for a screen too (tray menu, Nebula Link `hub.open`, `nebula://hub/…`).
 */
export type Route =
  | { screen: 'home' }
  /** Today's tech articles from Nebula News (ADR-036). */
  | { screen: 'news' }
  | { screen: 'discover' }
  | { screen: 'app'; appId: string }
  | { screen: 'my-apps' }
  | { screen: 'downloads' }
  | { screen: 'integrations' }
  | { screen: 'settings' }
  /** An app shown inside the Hub (ADR-027). */
  | { screen: 'docked'; appId: string };
