/* eslint-disable no-console -- a narrated demonstration */
import { HUB_ID } from '../../src/shared/consent';
import { alpha, beta, eventually } from './fake-apps';
import { startTestHub } from './test-hub';

/**
 * `npm run link:demo` (brief § 8.8): starts the Hub's Link server in test mode and the two fake
 * apps, then walks through each kind of capability, the consents and the refusals, printing what
 * happens. The same scenarios are asserted by `harness.test.ts`.
 */
const say = (text: string, detail?: unknown) => console.log(`  ${text}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
const title = (text: string) => console.log(`\n${text}`);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  title('Nebula Link — banc d’essai (mode test)');
  const hub = await startTestHub();
  say('Hub de test à l’écoute', hub.pipe);

  const provider = alpha(hub.sessionFile);
  const consumer = beta(hub.sessionFile);
  say('Alpha (fournisseur)', await provider.link.connect());
  say('Beta (consommateur)', await consumer.link.connect());
  await pause(100);

  title('1. Requête publique (query)');
  say('Beta lit alpha.time', await consumer.link.query('alpha.time'));

  title('2. Requête privée : consentement');
  say('Beta lit alpha.secret, sans accord', await consumer.link.query('alpha.secret'));
  say('Demande posée dans le Hub', hub.consentRequests.at(-1));
  hub.grant('nebula.beta', 'alpha.secret');
  say('Après « Autoriser »', await consumer.link.query('alpha.secret'));
  hub.deny('nebula.beta', 'alpha.secret');
  say('Après « Refuser »', await consumer.link.query('alpha.secret'));

  title('3. Widget de l’accueil (le Hub consomme)');
  say('Sans accord', await hub.server.queryAs(HUB_ID, 'alpha.status'));
  hub.grant(HUB_ID, 'alpha.status');
  say('Avec accord', await hub.server.queryAs(HUB_ID, 'alpha.status'));

  title('4. Événement (event)');
  provider.link.emit('alpha.tick', { kind: 'long', durationMin: 15 });
  await eventually(() => consumer.events.some((event) => event.event === 'alpha.tick'));
  say('Beta reçoit alpha.tick', consumer.events.find((event) => event.event === 'alpha.tick'));
  say('Apparence reçue à la connexion (I1)', consumer.events.find((event) => event.event === 'nebula.appearance.changed')?.payload);

  title('5. Ouverture d’écran (intent) et lien profond');
  say('Beta ouvre /panel?tab=a chez Alpha', await consumer.link.intent('nebula.alpha', '/panel', { tab: 'a' }));
  say('Paramètre non déclaré', await consumer.link.intent('nebula.alpha', '/panel', { tab: 'z' }));
  say('nebula://alpha/calendar?date=2026-10-15', await hub.server.routeDeepLink('nebula://alpha/calendar?date=2026-10-15'));
  say('nebula://gamma/ (non installée)', await hub.server.routeDeepLink('nebula://gamma/'));

  title('6. Notification (centre d’activité)');
  say('Publique', await provider.link.notify({ title: 'Briefing prêt', body: '3 sujets', sensitivity: 'public' }));
  say('Privée, sans accord', await provider.link.notify({ title: 'Prélèvement', body: 'Demain', sensitivity: 'private' }));

  title('7. Hub absent');
  await hub.stop();
  await eventually(() => provider.link.status === 'offline');
  say('Alpha passe hors ligne, sans erreur', provider.link.status);
  say('Requête pendant l’absence', await consumer.link.query('alpha.time'));

  provider.link.dispose();
  consumer.link.dispose();
  title(`Journal (sans contenu) : ${hub.audit.length} échanges, dont ${hub.audit.filter((entry) => entry.outcome === 'delivered').length} livrés.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
