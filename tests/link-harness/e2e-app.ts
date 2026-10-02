import fs from 'node:fs';
import path from 'node:path';
import { HUB_ID } from '../../src/shared/consent';
import { DockController } from '../../src/electron/link/dock';
import { startTestHub } from './test-hub';

/**
 * End-to-end check of a real Nebula app against the Hub's Link server in test mode (M8): the app
 * is started by hand with NEBULA_LINK_SESSION_FILE pointing at this Hub's session file. Steps are
 * driven by files in the work folder (`go-widget`, `go-dock`, `go-release`, `stop`), so a CDP script can check
 * the app's window in between.
 *
 *   node dist/link-e2e/e2e-app.js <appId> <manifest path> <work folder> [capability to grant…]
 */
const [appId, manifest, work, ...grants] = process.argv.slice(2);
const flag = (name: string) => fs.existsSync(path.join(work, name));
const waitFor = async (condition: () => boolean, ms = 120_000) => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

async function main(): Promise<void> {
  const hub = await startTestHub({ installed: { [appId]: manifest } });
  for (const capability of grants) hub.grant(HUB_ID, capability);
  fs.writeFileSync(path.join(work, 'session.txt'), hub.sessionFile);
  console.log('hub ready, session file written');

  await waitFor(() => hub.server.connectedApps().some((app) => app.appId === appId));
  console.log('app connected');
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const widgets = process.env.E2E_WIDGETS?.split(',').filter(Boolean) ?? [];
  for (const widget of widgets) console.log(`widget ${widget} (before go-widget):`, JSON.stringify(await hub.server.queryAs(HUB_ID, widget)));
  await waitFor(() => flag('go-widget') || flag('stop'));
  for (const widget of widgets) console.log(`widget ${widget}:`, JSON.stringify(await hub.server.queryAs(HUB_ID, widget)));

  const dock = new DockController({
    dockable: () => [appId],
    subscribed: () => hub.server.subscribersOf('nebula.hub.dock'),
    send: (target, payload) => hub.server.sendTo(target, 'nebula.hub.dock', payload),
    content: () => ({ x: 120, y: 80, width: 1200, height: 800 }),
    launch: async () => true,
    onChange: () => undefined,
  });
  console.log('subscribed to the Hub mode:', hub.server.subscribersOf('nebula.hub.dock').includes(appId));

  await waitFor(() => flag('go-dock') || flag('stop'));
  if (flag('go-dock')) {
    dock.setArea({ x: 236, y: 40, width: 964, height: 760 });
    await dock.show(appId);
    console.log('dock sent: expected bounds x=356 y=120 width=964 height=760');
    await waitFor(() => flag('go-release') || flag('stop'));
    if (flag('go-release')) {
      dock.release(appId);
      console.log('release sent');
    }
  }
  await waitFor(() => flag('stop'));
  console.log('notifications received:', JSON.stringify(hub.notifications));
  console.log('consent requests:', JSON.stringify(hub.consentRequests));
  await hub.stop();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
