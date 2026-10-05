# @nebula/link

Le SDK client de **Nebula Link**, la couche d'échanges locale entre les apps Nebula et
Nebula Hub (protocole `nebula-link/1`, spécification : `docs/NEBULA_LINK.md` du dépôt
Nebula Hub).

- S'utilise **dans le processus principal** de l'app (Electron), jamais dans le renderer : le
  renderer passe par le preload existant de l'app, avec des méthodes précises.
- **Aucune dépendance** : `node:net`, `node:crypto` et `node:fs`. Livré en CommonJS
  (`require`) et en ESM (`import`), avec ses types.
- **Ne bloque jamais l'app** : sans Nebula Hub, `connect()` répond `offline` tout de suite,
  réessaie en arrière-plan, et chaque appel rend `{ ok: false, error: 'offline' }`.

## Installation

Le SDK est publié en archive sur une release du dépôt Nebula Hub (tag `link-v<version>`) :

```json
"dependencies": {
  "@nebula/link": "https://github.com/Memel-SQT/Nebula-Hub/releases/download/link-v1.0.0/nebula-link-1.0.0.tgz"
}
```

npm et pnpm inscrivent son empreinte (`integrity`) dans le lockfile.

## Utilisation

Chaque app déclare ce qu'elle offre et utilise dans `nebula.app.json`, copié dans `resources\`
par son build (`extraResources`). Le Hub lit ce fichier dans le dossier d'installation et
refuse une app qui annonce autre chose.

```ts
import { NebulaLink } from '@nebula/link';

const link = NebulaLink.create({ appId: 'nebula.clock', appVersion: app.getVersion(), manifestPath });
await link.connect();                                   // ne lève jamais

link.on('nebula.appearance.changed', (appearance) => applyNebulaAppearance(appearance));
link.provide('clock.focus.today', async () => ({ title: 'Focus du jour', value: '3 / 8', updatedAt: new Date().toISOString() }));
link.emit('clock.break.started', { kind: 'long', durationMin: 15 });
link.onIntent((intent) => router.open(intent.path, intent.params));

// Démarrage par un lien profond (nebula://clock/start?preset=classic) :
const intent = NebulaLink.intentFromArgv(process.argv, link.manifest);
if (intent) router.open(intent.path, intent.params);
```

Une donnée `private` n'est transmise qu'avec l'accord de l'utilisateur, donné dans le Hub
(centre « Intégrations »). Le contenu des échanges n'est jamais journalisé.

## Packs d'apparence (1.1.0)

Une app peut proposer les thèmes qu'une autre app installée partage (spécification § 18). Le SDK
lit et valide le dossier commun, sans jamais lever d'erreur :

```ts
import { findPackTheme, readAppearancePacks } from '@nebula/link';

const packs = readAppearancePacks();                    // packs valides dont le propriétaire est installé
const chosen = findPackTheme(packs, appearance.theme);  // thème du pack reçu du Hub ou choisi dans l'app
```

L'app propriétaire publie le sien avec `writeAppearancePack(pack)` à chaque démarrage et le
retire avec `removeAppearancePack(id)`.
