# Nebula Link — spécification, protocole `nebula-link/1`

> **Statut : validée le 2026-10-01**, avec les décisions du § 15 (ADR-023). Jalon M6.
>
> Vocabulaire normatif : **doit** = obligatoire ; **ne doit pas** = interdit ; **peut** = permis.

## 1. Rôle et principes

Nebula Link est la couche d'échanges **locale** entre les apps de la famille Nebula. Elle permet
de partager l'apparence, d'ouvrir un écran précis d'une autre app, d'afficher des widgets et de
regrouper les notifications. Le tout se fait **uniquement avec l'accord de l'utilisateur**, et
**rien ne quitte l'ordinateur**.

1. **Étoile** : Nebula Hub est le seul serveur ; chaque app est un client. Les apps ne se parlent
   jamais directement : tout passe par le Hub, qui applique les consentements.
2. **Optionnel** (R09) : une app sans le Hub fonctionne exactement comme avant, sans erreur
   visible, sans attente et sans fenêtre. Link est un plus, jamais une dépendance.
3. **Déclaré** : une app ne peut offrir que ce que décrit son manifeste `nebula.app.json`, livré
   dans son installeur. Ce qui n'est pas déclaré est refusé.
4. **Consenti** (R07) : une donnée privée d'une app ne parvient à une autre (ou au Hub) qu'après
   un « oui » explicite de l'utilisateur, pour cette paire précise, révocable à tout moment.
5. **Sobre** : pas de réseau, pas de compte, pas de télémétrie (R06). Le Hub garde un journal des
   échanges (qui, quoi, quand), jamais leur contenu.

## 2. Modèle de menace

Link **protège** :

- contre les **autres comptes Windows** de la machine : canal propre à chaque utilisateur, jeton
  de session illisible pour les autres comptes, authentification mutuelle. Un faux Hub ou un faux
  client lancé par un autre compte est rejeté ;
- contre les **erreurs d'intégration** : messages bornés et validés, capacités non déclarées
  refusées, paramètres de liens profonds contrôlés, résultats vérifiés avant affichage. Une app
  boguée ne peut pas faire planter le Hub ni une autre app ;
- contre les **fuites involontaires** : consentement par paire pour toute donnée privée, valeurs
  privées jamais écrites sur disque par le Hub, journal sans contenu.

Link **ne protège pas** contre un logiciel malveillant qui tourne déjà sous le compte de
l'utilisateur. Un tel programme peut lire le jeton de session, se faire passer pour une app
installée, ou lire directement les fichiers des apps. Aucune couche locale ne peut l'empêcher ;
Link ne prétend pas le faire. Le Hub ne vérifie pas l'identité du *processus* client (Node ne
donne pas accès à son PID sur un named pipe). Il vérifie le jeton, l'installation de l'app et son
manifeste.

## 3. Transport

- **Canal** : un named pipe Windows par utilisateur,
  `\\.\pipe\nebula-link-<h>`, où `<h>` = 16 premiers caractères hexadécimaux du SHA-256 du SID de
  l'utilisateur (lu avec `whoami /user` via `execFile`, R11). Le nom exact est aussi écrit dans
  le fichier de session (§ 4) : un client n'a pas besoin de le calculer.
- **Messages** : JSON-RPC 2.0, **un message par ligne** (NDJSON, UTF-8, `\n` final). Taille
  maximale **256 Kio** par message. Un message plus long, une ligne qui n'est pas du JSON valide
  ou un objet qui n'est pas du JSON-RPC 2.0 entraînent une erreur (§ 9) ; trois erreurs de ce
  type sur une même connexion entraînent sa fermeture.
- **Débit** : au plus **100 messages par seconde** et par connexion ; au-delà, erreur
  `rate-limited` et, si cela dure plus de 10 s, fermeture.
- **Vivacité** : chaque côté peut envoyer `link.ping` ; sans aucun message pendant 60 s, la
  connexion est considérée comme morte et fermée.
- **Hub absent** : le client ne lève **jamais** d'exception et ne bloque jamais le démarrage de son
  app. Il passe à l'état `offline` en silence et réessaie avec un délai exponentiel (1 s, 2 s, 4 s…
  plafonné à 60 s, avec un peu d'aléa), tant que l'app tourne.

## 4. Session et authentification

### 4.1 Fichier de session

Au démarrage, le Hub génère un **jeton aléatoire de 32 octets**, puis écrit (de façon atomique)
`%LOCALAPPDATA%\Nebula Link\session.json` :

```json
{ "protocol": "nebula-link/1", "pipe": "\\\\.\\pipe\\nebula-link-3f1a9c0b2e7d4a51", "token": "<base64url>", "hubVersion": "0.2.0", "pid": 4242, "createdAt": "2026-10-02T08:00:00.000Z" }
```

- Le dossier hérite des droits du profil de l'utilisateur : lisible par lui, par SYSTEM et par les
  administrateurs, **pas par les autres comptes**.
- Le jeton est **régénéré à chaque démarrage** du Hub et le fichier est supprimé à sa fermeture
  normale. Un fichier resté là d'une ancienne session est sans danger : son jeton ne vaut plus rien.

### 4.2 Poignée de main (authentification mutuelle)

Le jeton **ne circule jamais** sur le pipe. Chaque côté prouve qu'il le connaît (HMAC-SHA256), dans
cet ordre :

1. Client → `link.hello` `{ protocol, appId, appVersion, manifestHash, clientNonce }`. Le
   `manifestHash` est le SHA-256 hexadécimal des octets de son `nebula.app.json` ;
   `clientNonce` fait 32 octets aléatoires (base64url).
2. Hub → résultat `{ hubVersion, serverNonce, serverProof }`, avec
   `serverProof = HMAC(token, "hub|" + clientNonce + "|" + serverNonce + "|" + appId)`.
3. Le client recalcule `serverProof`. S'il diffère, ce n'est pas le vrai Hub (pipe squatté par un
   autre compte, vieux fichier) : il ferme sans rien envoyer de plus et passe `offline`.
4. Client → `link.auth` `{ clientProof }`, avec
   `clientProof = HMAC(token, "client|" + serverNonce + "|" + clientNonce + "|" + appId)`.
5. Le Hub vérifie la preuve, puis que :
   - `appId` est au catalogue signé et que l'app est **installée** (détection, ADR-020) ;
   - le catalogue déclare `link.minProtocol` ≤ 1 pour cette app ;
   - le manifeste de l'app installée, `<dossier d'installation>\resources\nebula.app.json`, est
     valide (§ 5), que son `appId` est le bon et que **son SHA-256 est égal au `manifestHash`
     annoncé**.

   Si tout est bon, il répond
   `{ sessionId, hubVersion, appearance, consents }`, où `consents` est l'état des
   paires qui concernent l'app.
6. **Avant l'étape 5, le Hub ne répond qu'à `link.hello` et `link.auth`, et n'envoie rien
   d'autre.** Un échec ferme la connexion avec une erreur `unauthenticated`, sans détail.

Une app peut avoir **plusieurs connexions** (une par processus principal) ; en pratique une seule.
Le Hub lui-même n'est pas un client : ses capacités sont internes (§ 5.4).

## 5. Manifeste d'app : `nebula.app.json`

À la racine du dépôt de chaque app, copié par son build dans `resources\` (electron-builder
`extraResources`). Le Hub le lit **dans le dossier d'installation**, jamais une copie envoyée par
l'app.

```jsonc
{
  "schema": 1,
  "appId": "nebula.finterest",
  "provides": [
    {
      "id": "finterest.budget.remaining",
      "kind": "widget",
      "sensitivity": "private",
      "title": { "fr": "Reste à vivre", "en": "Left to spend" },
      "description": { "fr": "Montant restant ce mois-ci pour le compte ouvert.", "en": "…" },
      "resultSchema": "WidgetV1",
      "refreshSeconds": 300
    },
    {
      "id": "finterest.payment.upcoming",
      "kind": "event",
      "sensitivity": "private",
      "title": { "fr": "Prélèvement prévu demain", "en": "…" },
      "description": { "fr": "…", "en": "…" },
      "payloadSchema": "NotificationV1"
    }
  ],
  "consumes": [{ "id": "nebula.appearance.changed", "kind": "event" }],
  "deepLinks": [
    { "path": "/calendar", "params": { "date": "date" } },
    { "path": "/accounts", "params": {} }
  ]
}
```

### 5.1 Règles

- `schema` vaut 1. Tout champ inconnu est ignoré (ajouts compatibles) ; un champ connu invalide
  rend le manifeste **entier** invalide (l'app n'est alors pas admise sur Link).
- Identifiant de capacité : `^[a-z][a-z0-9-]*(\.[a-z0-9-]+){1,4}$`, **préfixé par le nom court de
  l'app** (`finterest.`, `clock.`, `news.`). Seul le Hub émet sous `nebula.`.
  - **Nom court** : l'`appId` sans le préfixe `nebula.` (`nebula.clock` → `clock`). C'est aussi
    l'hôte de ses liens profonds (§ 7).
- `kind` : `query` (question → réponse), `event` (publication → abonnés), `intent` (demande
  d'ouvrir un écran ou de faire une action **non destructive**) ou `widget` (une `query` dont le
  résultat est une carte du Hub, rafraîchie au plus toutes les `refreshSeconds`, minimum 60).
- `sensitivity` : `public` ou `private` (§ 6). Une capacité dont le résultat peut contenir une
  donnée personnelle **doit** être `private`.
- `title` / `description` : `fr` obligatoire, `en` facultatif, 80 et 300 caractères au plus. Ce
  sont eux que l'utilisateur lit dans les écrans de consentement.
- `resultSchema` (query, widget) et `payloadSchema` (event, intent) : un nom du registre de
  schémas (§ 8). Le Hub **valide** chaque résultat et chaque charge utile avant de les transmettre
  ou de les afficher ; une donnée non conforme est rejetée et journalisée.
- `consumes` : les capacités d'autres apps (ou du Hub) que l'app veut utiliser. Une app ne peut
  appeler, écouter ou viser que ce qu'elle déclare ici.
- `deepLinks` : chemins (`^/[a-z0-9/-]{0,60}$`) et leurs paramètres typés : `date`
  (`AAAA-MM-JJ`), `month` (`AAAA-MM`), `integer` (entier de 0 à 10⁹), `text` (100 caractères au
  plus, sans caractère de contrôle), ou une liste de valeurs permises (`["classic", "long"]`).
  Tout paramètre absent du manifeste est refusé.
- Taille du manifeste : 64 Kio au plus ; 50 capacités et 30 liens profonds au plus.

### 5.2 Le Hub comme fournisseur

Le Hub a ses propres capacités, sans manifeste sur disque (elles font partie de son code) :

| Id | Kind | Sensibilité | Rôle |
|---|---|---|---|
| `nebula.appearance.changed` | event | public | I1 — apparence unifiée (§ 10.1) |
| `nebula.hub.present` | event | public | I6 — présence et version du Hub |
| `hub.open` | intent | public | I2 — ouvrir le Hub (`/`, `/app/<appId>`, `/my-apps`, `/downloads`, `/integrations`) |

**Amendement 2026-10-05 (ADR-034).** Nouvelle route `/docked?id=<appId>` (lien
`nebula://hub/docked?id=…`) : le Hub s'ouvre sur l'app affichée dans le Hub (mode Hub, § 17).
Une app ne peut la demander que pour elle-même (`id` = son propre appId), sinon `invalid-params`.
C'est par elle qu'une **extension** (Nebula News) demande à s'afficher, puisqu'elle n'ouvre
jamais sa propre fenêtre tant que le Hub est là.

### 5.3 Le Hub comme consommateur

Les widgets et le centre d'activité sont des usages **du Hub** : le consentement porte alors sur la
paire « Nebula Hub ↔ capacité », exactement comme pour une app.

## 6. Consentements

Les règles sont des **fonctions pures** de `src/shared/consent.ts`, testées une à une.

- **Paire** = (consommateur, capacité), où le consommateur est une app ou `nebula.hub`.
- Une paire peut être `granted`, `denied` ou indécise. Toute décision est enregistrée avec sa date.
- **Capacité `public`** : autorisée par défaut, **visible** dans le centre « Intégrations » et
  désactivable (`denied`).
- **Capacité `private`** : refusée tant que l'utilisateur n'a pas dit oui. La **première demande**
  ne bloque pas : l'appelant reçoit l'erreur `consent-required` et le Hub affiche une demande
  claire, du type « Nebula Hub veut afficher le reste à vivre de Nebula Finterest sur l'accueil ».
  Elle apparaît dans le Hub (carte du widget, centre « Intégrations ») et, si le Hub est caché,
  en notification Windows. Après un « oui », la prochaine demande passe ; après un « non », la
  paire est `denied` et l'appelant reçoit `consent-denied` sans nouvelle question.
- **Révocation** : à tout moment, depuis la matrice app × capacité. Elle s'applique
  immédiatement : abonnements coupés, widgets vidés de leur valeur, et
  `link.consent.changed` envoyé aux deux apps concernées.
- **Désinstallation** : les paires de l'app sont **archivées, pas supprimées**, et restaurées si
  elle est réinstallée.
- **Pas de pause globale** (décision du 2026-10-01) : on coupe une intégration en refusant sa
  paire. « Tout refuser pour cette app » refuse d'un coup toutes les paires d'une app.
- **Journal** (`link_audit`) : date, consommateur, fournisseur, capacité, type d'échange,
  résultat (`delivered`, `consent-required`, `denied`, `invalid`, `error`, `timeout`) et taille.
  **Jamais le contenu.** Gardé 30 jours. Le centre « Intégrations » y lit la date du dernier
  échange de chaque paire.

## 7. Liens profonds `nebula://`

- Forme : `nebula://<nom court>/<chemin>?<paramètres>`. Par exemple
  `nebula://finterest/calendar?date=2026-10-15`, `nebula://news/briefing`,
  `nebula://clock/start?preset=classic` ou `nebula://hub/app/nebula.news`.
- Le Hub s'enregistre comme gestionnaire du protocole (`app.setAsDefaultProtocolClient`, version
  installée seulement) et reçoit les liens par `second-instance`.
- **Validation** : l'app doit exister au catalogue, le chemin et chaque paramètre doivent être
  déclarés dans son manifeste, et les types respectés (§ 5.1). Un lien de plus de 2 000 caractères,
  ou contenant quoi que ce soit d'autre, est refusé et journalisé.
- **Routage** :
  1. l'app est connectée à Link : le Hub lui envoie `link.intent.deliver` `{ path, params, source }` ;
  2. l'app est installée mais pas connectée : le Hub la lance (comme le lanceur, ADR-020) avec
     **un seul** argument `--nebula-intent=<base64url du JSON { path, params, source }>`. L'app
     le traite au démarrage, ou par `second-instance` si elle était déjà ouverte ;
  3. l'app n'est pas installée : le Hub ouvre sa fiche.
- L'app revalide toujours l'intent reçu contre son propre manifeste (défense en profondeur).

## 8. Registre de schémas

Les schémas sont du code partagé (Hub et SDK), versionné : un changement incompatible crée un
nouveau nom (`V2`). Chaque validateur est une fonction pure et testée, qui borne aussi les tailles.

| Schéma | Contenu |
|---|---|
| `AppearanceV1` | Exactement `{ theme, accentPreset, customPrimary, customSecondary, background, motion, soundEnabled, soundVolume, language }` (brief § 10.4), validé par `parseNebulaAppearance` champ par champ. |
| `WidgetV1` | `{ title, value?, unit?, caption?, items?: [{ label, value }] (5 au plus), deepLink?, updatedAt }` ; textes de 80 caractères au plus. Le Hub l'affiche avec ses propres gabarits, **jamais du HTML**. |
| `NotificationV1` | `{ id?, title (80), body (300), sensitivity, deepLink?, category? }` |
| `HeadlinesV1` | `{ date, items: [{ title, source, deepLink }] (3 au plus) }` — News « À la une » |
| `FocusTodayV1` | `{ date, done, goal, streak }` — Clock « Focus du jour » |
| `BreakStartedV1` | `{ kind: "short" \| "long", durationMin }` — Clock, I4 |
| `PresenceV1` | `{ hubVersion, protocol, managesUpdates }` — I6 |
| `EmptyV1` | `{}` |
| `DockV1` | `{ state: "docked", visible, raise, bounds: { x, y, width, height } }` (entiers, DIP écran) ou `{ state: "released" }` — mode Hub, § 17 |

## 9. Méthodes JSON-RPC

Préfixe `link.` réservé. Les identifiants de requête sont des chaînes ou des entiers ; les
notifications n'ont pas d'identifiant.

**Client → Hub**

| Méthode | Type | Paramètres | Résultat |
|---|---|---|---|
| `link.hello`, `link.auth` | requête | § 4.2 | § 4.2 |
| `link.ready` | requête | `{ provides: [ids] }` (ce que l'app sait servir maintenant, sous-ensemble du manifeste) | `{}` |
| `link.query` | requête | `{ capability, params }` | le résultat du fournisseur, validé, ou `null` |
| `link.subscribe` / `link.unsubscribe` | requête | `{ event }` | `{ consent }` |
| `link.emit` | notification | `{ event, payload }` | — |
| `link.notify` | requête | `NotificationV1` | `{ accepted }` |
| `link.intent` | requête | `{ target: appId, path, params }` | `{ delivered: "link" \| "launched" \| "store" }` |
| `link.ping` | requête | `{}` | `{}` |

**Hub → client**

| Méthode | Type | Paramètres | Réponse attendue |
|---|---|---|---|
| `link.query.invoke` | requête | `{ capability, params, requester }` | résultat conforme au schéma, ou `null` (« rien à montrer », par exemple aucun compte déverrouillé) |
| `link.event` | notification | `{ event, payload, source }` | — |
| `link.intent.deliver` | requête | `{ path, params, source }` | `{ handled: boolean }` |
| `link.consent.changed` | notification | `{ consumer, capability, state }` | — |
| `link.ping` | requête | `{}` | `{}` |

**Délais** : une requête relayée vers une app (query, intent) expire après **5 s** (`timeout`).

**Codes d'erreur** : JSON-RPC standard (`-32700` analyse, `-32600` requête invalide, `-32601`
méthode inconnue, `-32602` paramètres invalides), plus :

| Code | Nom | Sens |
|---|---|---|
| -32001 | `unauthenticated` | Poignée de main absente ou ratée |
| -32002 | `consent-required` | Paire privée indécise : la question est posée à l'utilisateur |
| -32003 | `consent-denied` | Paire refusée (ou désactivée pour une capacité publique) |
| -32004 | `unknown-capability` | Non déclarée (manifeste du fournisseur ou `consumes` de l'appelant) |
| -32005 | `provider-offline` | L'app qui fournit n'est pas connectée |
| -32006 | `timeout` | Pas de réponse du fournisseur à temps |
| -32007 | `too-large` | Message de plus de 256 Kio |
| -32008 | — | Réservé (ancienne pause globale, retirée) |
| -32009 | `rate-limited` | Trop de messages |
| -32010 | `invalid-result` | Le résultat ou la charge utile ne respecte pas son schéma |

## 10. Intégrations de la V1

| # | Intégration | Capacités | Règles particulières |
|---|---|---|---|
| I1 | Apparence unifiée | `nebula.appearance.changed` (Hub → toutes, public, `AppearanceV1`) | Envoyée à l'authentification puis à chaque changement. Chaque app a le réglage « Suivre l'apparence Nebula », activé par défaut après adoption. Finterest garde ses thèmes `old-*` : si l'utilisateur y est, seul le reste change. |
| I2 | Lanceur et liens profonds | `hub.open` ; les `deepLinks` de chaque app | Le bouton « Apps Nebula » de chaque app ouvre `nebula://hub/` (le protocole lance le Hub s'il ne tourne pas). |
| I3 | Widgets de l'accueil | `news.tech.today` (public, `WidgetV1`), `clock.focus.today` (public), `finterest.budget.remaining` (**private**) ; masqués par défaut (ADR-031) : `news.headlines.today`, `news.focus.today`, `news.finance.today` | Finterest ne répond que si un compte est déverrouillé (sinon `null`). Sa valeur est **masquée par défaut** (•••) jusqu'au clic, **jamais écrite sur disque** par le Hub, et effacée quand le Hub se cache dans la zone de notification. **News 0.4.0** suit trois thèmes, un widget par thème (public, `WidgetV1`, `refreshSeconds` 900, `null` si le thème est vide) : `news.focus.today` pour Nebula Clock (pauses), `news.finance.today` pour Nebula Finterest, `news.tech.today` pour l'accueil du Hub, où « Tech du jour » remplace « À la une ». Dans Intégrations → « Widgets de l'accueil », chaque widget s'affiche ou se masque ; un widget masqué n'est jamais lu. Un widget n'ouvre que son app : un `deepLink` vers un autre hôte est retiré. Une app qui vient de se connecter n'est lue que **25 s** après sa connexion (demande de l'utilisateur, 2026-10-05) : Nebula News démarre encore son serveur et une lecture plus tôt n'aboutirait pas ; la carte reste « chargement » pendant ce délai. |
| I4 | Pause lecture | `clock.break.started` (public, `BreakStartedV1`) → intent `news.open-briefing` | Option du Hub, **désactivée par défaut** : au début d'une pause longue, si News est installée, une notification propose « Lire le briefing ». |
| I5 | Centre d'activité | `link.notify` ; `*.notification` | Le Hub regroupe et peut relayer en notification Windows (réglable par app). Historique de **30 jours**, notifications privées comprises (reçues avec consentement). Il peut être **effacé** dans Réglages → Avancé : tout l'historique, ou celui d'une app. |
| I6 | Présence du Hub | `nebula.hub.present` (`PresenceV1`) | Permet à chaque app de proposer le mode « Gérée par le Hub » (ADR-015) : mises à jour déléguées au Hub. |
| — | Sauvegardes (ADR-016) | `clock.backup.export`, `news.backup.export` (intents) | L'app écrit **elle-même** sa sauvegarde dans le fichier que le Hub lui indique (sous le dossier des sauvegardes) ; l'import se confirme dans l'app. Arrive en M8 avec l'adoption. |

**Renommages par rapport au brief** (pour suivre les identifiants réels, ADR-011 et ADR-013) :
`pomodoro.*` devient `clock.*`, `nebula.store.present` devient `nebula.hub.present`, et
`nebula://pomodoro/...` devient `nebula://clock/...`.

**Proposés mais hors V1** (brief § 8.6) : recherche globale entre apps, profil Nebula local
partagé (nom et avatar suggérés à la création d'un compte Finterest, sans toucher aux PIN), et
lien « actualité économique → simulateur Finterest ». **Hors V1** ; le protocole les permettrait
sans changement (`query` + `intent`).

## 11. SDK client `@nebula/link` (`packages/nebula-link`)

- Tourne **uniquement dans le processus principal** des apps. Le renderer y accède par le preload
  existant de l'app, avec des méthodes précises : jamais un passe-plat générique.
- Zéro dépendance à l'exécution (`node:net`, `node:crypto`, `node:fs`). Livré en **CJS et ESM**
  avec ses types : News a un `desktop/main.js` en CommonJS, Finterest regroupe son main avec tsup.
- Distribution (ADR-008, acceptée) : archive `nebula-link-<version>.tgz` publiée en asset de
  release du Hub (tag `link-v<version>`), référencée par URL. L'empreinte `integrity` est inscrite
  dans le lockfile.

```ts
const link = NebulaLink.create({ appId: 'nebula.finterest', appVersion, manifestPath });
await link.connect();          // ne lève jamais ; résout vite même sans Hub
link.status;                   // 'connected' | 'offline'
link.onStatus((status) => …);
link.provide('finterest.budget.remaining', async (ctx) => widget | null);
link.on('nebula.appearance.changed', (appearance) => apply(appearance));
link.emit('clock.break.started', { kind: 'long', durationMin: 15 });
link.notify({ title, body, sensitivity: 'public', deepLink: 'nebula://news/briefing' });
link.onIntent((intent) => route(intent));      // depuis Link ou depuis --nebula-intent
link.intent('nebula.news', '/briefing');       // via le Hub
link.query('news.headlines.today');            // via le Hub, avec consentement
link.dispose();
```

- `NebulaLink.intentFromArgv(process.argv)` décode et valide `--nebula-intent` pour les apps qui
  démarrent par un lien.
- Le SDK valide aussi ce qu'il envoie (schémas § 8). Il n'enregistre pas de handler pour une
  capacité absente du manifeste, et ne logue jamais le contenu des échanges.

## 12. Données du Hub

Dans `store.sqlite` (migrations additives) :

- `consents` (consommateur, capacité, état, date de décision, date d'archivage) ;
- `link_audit` (§ 6), purgé après 30 jours ;
- `notifications` (publiques et privées, 30 jours, effaçables dans Réglages → Avancé).

Les valeurs des widgets et les résultats de requêtes restent **en mémoire** dans le Hub : seules
les notifications sont gardées, puisque c'est leur rôle (historique).

## 13. Banc d'essai (`tests/link-harness/`)

- Deux fausses apps en Node pur, qui utilisent le vrai SDK : un **fournisseur** (une capacité de
  chaque `kind`, une publique et une privée) et un **consommateur**.
- Un script qui démarre le serveur Link du Hub en **mode test** : pipe et fichier de session dans
  un dossier temporaire, manifestes et « apps installées » simulés.
- Scénarios démontrés et testés : chaque type de capacité ; consentement demandé puis accordé,
  puis refusé, puis révoqué ; Hub absent (client `offline`, sans exception) puis présent
  (reconnexion) ; faux Hub (mauvaise preuve) ; faux client (mauvais jeton, app non installée,
  manifeste modifié) ; messages invalides (JSON cassé, trop gros, méthode inconnue, paramètres
  invalides) ; lien profond vers une app connectée, déconnectée ou absente.

## 14. Versions

- Le protocole s'appelle `nebula-link/1`. Ajouter une méthode, un schéma ou un champ facultatif
  le laisse en `/1` ; toute rupture crée `/2`, que le Hub peut servir en parallèle.
- `link.minProtocol` (catalogue) dit quel protocole une app exige. Le Hub refuse proprement une
  app qui demande plus qu'il ne sait faire, et sa fiche l'explique.

## 15. Décisions (validées le 2026-10-01, ADR-023)

1. **Renommages** `pomodoro.*` → `clock.*`, `nebula.store.present` → `nebula.hub.present` :
   acceptés.
2. **Consentement non bloquant** : la première demande privée reçoit `consent-required` et la
   question est posée dans le Hub (laissé à mon choix).
3. **Notifications privées gardées** 30 jours comme les publiques, avec un effacement dans
   Réglages → Avancé (demande explicite).
4. **Pas de pause globale de Link** (« inutile ») : retirée du protocole et de l'interface.
5. **Authentification mutuelle par HMAC**, le jeton ne circulant jamais : retenue.
6. **Propositions hors V1** (recherche globale, profil partagé, actualité → simulateur) : non
   implémentées.
7. **Manifeste vérifié sur l'app installée** : retenu ; une app en développement se connecte au
   Hub en mode test.

## 16. Précisions de mise en œuvre (M6, ADR-024)

Ces points complètent la spécification sans en changer les règles.

- **Notifications et consentement** : `link.notify` passe par une capacité implicite par app,
  `<nom court>.notify` (par exemple `finterest.notify`), consommée par le Hub. Les notifications
  publiques sont acceptées ; les privées suivent la paire « Nebula Hub ↔ `<app>.notify` »,
  affichée dans la matrice sous « Notifications privées ».
- **Le Hub ne consomme que des widgets** et des événements de type `NotificationV1` ; il
  n'appelle jamais une `query` d'app.
- **Ouverture d'écran** : une intent vers un chemin couvert par une capacité `intent` suit le
  consentement de cette capacité (publique : autorisée par défaut), et l'app appelante doit la
  déclarer dans `consumes`. Un chemin sans capacité `intent` reste une simple navigation.
- **Événements d'état du Hub** : `nebula.appearance.changed` et `nebula.hub.present` sont envoyés
  dès l'abonnement, pour qu'un client démarre synchronisé.
- **Hello identique pour toute app** : le Hub répond à `link.hello` sans regarder si l'app est
  installée ; l'admission se joue à `link.auth`, sans dire pourquoi elle échoue.
- **Mode test et développement** : avec `NEBULA_HUB_USER_DATA_DIR`, le Hub utilise un pipe
  `nebula-link-dev-<pid>` et un fichier de session dans ce dossier, pour ne jamais entrer en
  collision avec le Hub installé.
- **Manifeste** : un chemin d'intent (`path`) doit figurer dans `deepLinks` ; les segments `.` et
  `..` d'un lien `nebula://` sont refusés avant toute normalisation.

## 17. Mode Hub : une app dans la fenêtre du Hub (amendement, ADR-027)

Ajouté le 2026-10-02 à la demande de l'utilisateur (« les apps tournent soit seules, soit dans le
Hub »). Le principe ne change pas : chaque app garde **son processus, sa fenêtre et ses données** ;
le Hub ne charge ni ne voit jamais son interface (R07, R10).

- **Capacité du Hub** `nebula.hub.dock` (event, public, `DockV1`). Une app compatible la déclare
  dans `consumes` et s'y abonne au démarrage. C'est ce qui la rend « compatible mode Hub » : le Hub
  ne propose ce mode qu'à une app dont le manifeste installé consomme cet événement.
- **Envoi ciblé** : contrairement à l'apparence, cet événement n'est jamais diffusé ; le Hub
  l'envoie à **une seule app**, connectée, abonnée et autorisée (la paire peut être coupée dans
  Intégrations).
- **Charge utile** : `{ state: 'docked', visible, raise, bounds }`, `bounds` en coordonnées écran
  DIP (l'unité de `BrowserWindow.setBounds` d'Electron), ou `{ state: 'released' }`.
- **Côté app** :
  - `docked` + `visible` : fenêtre sans cadre (créée ou réutilisée), placée exactement sur
    `bounds`, affichée **sans prendre le focus** (`showInactive`), sans icône dans la barre des
    tâches. Si `raise` est vrai, elle repasse au premier plan (`moveTop`) sans voler le focus ;
    **Amendement 2026-10-04 (ADR-032)** : `moveTop` seul ne suffit pas. Windows refuse de faire
    passer devant la fenêtre d'un processus qui n'a pas le droit de premier plan, ce qui est le cas
    de l'app dès que le Hub est actif. L'app reste alors cachée derrière le Hub. Chaque `raise`, et
    chaque passage de caché à visible, se fait donc en trois appels : `setAlwaysOnTop(true)`,
    `moveTop()`, puis `setAlwaysOnTop(false)`. La fenêtre passe au-dessus du Hub sans rester
    « toujours au premier plan ». Le Hub renvoie `raise` après 0,4 s, 1,5 s et 3,5 s quand l'app
    apparaît, tant qu'il garde le focus ;
  - `docked` + `visible: false` : la fenêtre se cache (le Hub est réduit, caché, ou montre un
    autre écran ou une autre app) ;
  - `released`, ou perte de la connexion au Hub : retour à la fenêtre normale de l'app (cadre,
    taille et position d'avant), **toujours** ; l'app ne doit jamais rester invisible.
  - L'app reste utilisable au clavier et à la souris normalement ; elle peut proposer un bouton
    « Détacher » qui revient à sa fenêtre (et le Hub le comprend en voyant l'app quitter le mode).
    Concrètement (2026-10-02, adopté par Finterest, Clock et News) : l'app **se désabonne** de
    `nebula.hub.dock` (le Hub l'oublie aussitôt), revient à sa fenêtre normale, puis se réabonne
    pour que le mode Hub puisse être choisi à nouveau depuis le Hub.
- **Côté Hub** (`DockController`) : le Hub envoie la zone de contenu de son écran « app dans le
  Hub » à chaque déplacement, redimensionnement, réduction ou changement d'écran (rien n'est
  renvoyé si rien ne bouge). Une seule app est montrée à la fois, les autres apps ouvertes en mode
  Hub sont cachées : la barre latérale sert d'onglets. Une app qui ne répond pas (version
  antérieure) reste dans sa propre fenêtre ; l'utilisateur peut toujours la détacher. Quand le Hub
  quitte, toutes les apps reçoivent `released`.
- **Choix de l'utilisateur** : par app, « Ouvrir dans le Hub plutôt que dans sa propre fenêtre »
  (désactivé par défaut), sur la fiche de l'app. Le lanceur (barre latérale, accueil, zone de
  notification) suit ce choix.

## 18. Packs d'apparence (amendement, ADR-035)

Une app de la famille installée peut partager des **thèmes supplémentaires** avec les autres apps
et le Hub. Rien ne passe par le tube : c'est un fichier déposé par l'app propriétaire, lu par les
autres, avec ou sans le Hub (une app standalone les voit aussi).

- **Emplacement** : `%LOCALAPPDATA%\Nebula Link\appearance\<id>.json`, à côté du fichier de
  session. L'app propriétaire l'écrit à chaque démarrage (`writeAppearancePack`, écriture
  atomique) et le retire à sa désinstallation (`removeAppearancePack`, ou son désinstalleur).
- **Contenu** (`AppearancePack`, schéma 1, 256 Kio au plus) :
  - `id` (minuscules et chiffres) et `owner: { appId, exe }`, l'exécutable de l'app propriétaire ;
  - `themes` (1 à 4) : `id` préfixé par celui du pack (`<id>-…`, jamais un thème intégré),
    `scheme` (`dark` ou `light`), `label` (fr, en), `tokens` (propriétés CSS `--…` → valeur) et
    `chrome: { page, ink }` (couleurs hexadécimales de la barre de titre native) ;
  - `names` (facultatif) : nom affiché de chaque app de la famille (par identifiant) tant qu'un
    thème du pack est actif ;
  - `mark` et `marks` (facultatifs) : la marque du pack et un logo SVG par app (par identifiant).
- **Validation stricte** (`parseAppearancePack`, partagée par le Hub et le SDK) : un champ connu
  invalide rejette tout le pack. Les valeurs des jetons n'acceptent que des couleurs, longueurs,
  durées et les fonctions `var`, `calc`, `color-mix`, `rgb(a)`, `hsl(a)`, `linear-gradient`,
  `radial-gradient` : pas de `url()`, de guillemets, de point-virgule, d'accolade ni d'échappement.
  Les SVG sont affichés **comme images** (`<img src="data:image/svg+xml;base64,…">`), jamais
  insérés dans la page ; ceux qui contiennent `<script>`, `<foreignObject>`, un attribut `on…` ou
  `javascript:` sont refusés.
- **Disponibilité** : un pack n'est proposé que si son propriétaire est installé (son exécutable
  existe ; le Hub exige en plus que sa détection le voie). Sans le pack, ses thèmes n'apparaissent
  nulle part.
- **Application** : le thème du pack se pose **par-dessus** le thème intégré du même `scheme` :
  `data-theme` garde `nebula-dark` ou `nebula-light` (tous les sélecteurs communs continuent de
  s'appliquer), `data-pack-theme` porte l'identifiant du thème du pack, et ses jetons deviennent
  des propriétés en ligne sur la racine (`applyPackTheme` de `@nebula/design`). Les couleurs
  d'accent ne s'y appliquent pas. Les noms et logos du pack ne changent que l'affichage, jamais les
  noms d'installation.
- **Repli** : le choix est enregistré à part du thème intégré (`packTheme` dans le Hub). Si le pack
  disparaît, l'app revient au thème intégré enregistré, sans rien perdre.
- **Diffusion** : I1 (`nebula.appearance.changed`) envoie l'identifiant du thème du pack dans
  `theme`. Une app qui le connaît par le dossier l'applique ; une app qui ne le connaît pas garde
  sa règle habituelle (thème inconnu → défaut).
