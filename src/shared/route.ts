/**
 * The screens of the Hub, as typed state (no router, as in Nebula Finterest). Shared because the
 * main process can ask for a screen too (tray menu, Nebula Link `hub.open`, `nebula://hub/…`).
 */
export type Route =
  | { screen: 'home' }
  | { screen: 'discover' }
  | { screen: 'app'; appId: string }
  | { screen: 'my-apps' }
  | { screen: 'downloads' }
  | { screen: 'integrations' }
  | { screen: 'settings' };
