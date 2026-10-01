# Nebula Link — spécification, protocole `nebula-link/1`

> **Statut : proposition, à valider** (brief § 8, jalon M6). Aucune ligne du serveur, du SDK ou du
> banc d'essai n'est écrite avant ta validation. Les points qui demandent une décision sont
> marqués **[À VALIDER]** et repris en fin de document.
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
   `{ sessionId, hubVersion, paused: false, appearance, consents }`, où `consents` est l'état des
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
| `nebula.link.paused` | event | public | Link mis en pause ou repris (envoyé juste avant la coupure) |
| `hub.open` | intent | public | I2 — ouvrir le Hub (`/`, `/app/<appId>`, `/my-apps`, `/downloads`, `/integrations`) |

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
- **« Tout couper »** (pause de Link) : le Hub envoie `nebula.link.paused`, ferme toutes les
  connexions et refuse les nouvelles jusqu'à la reprise. Les apps passent `offline` en silence.
  La pause survit à un redémarrage du Hub. **[À VALIDER]**
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
| -32008 | `paused` | Link est en pause |
| -32009 | `rate-limited` | Trop de messages |
| -32010 | `invalid-result` | Le résultat ou la charge utile ne respecte pas son schéma |

## 10. Intégrations de la V1

| # | Intégration | Capacités | Règles particulières |
|---|---|---|---|
| I1 | Apparence unifiée | `nebula.appearance.changed` (Hub → toutes, public, `AppearanceV1`) | Envoyée à l'authentification puis à chaque changement. Chaque app a le réglage « Suivre l'apparence Nebula », activé par défaut après adoption. Finterest garde ses thèmes `old-*` : si l'utilisateur y est, seul le reste change. |
| I2 | Lanceur et liens profonds | `hub.open` ; les `deepLinks` de chaque app | Le bouton « Apps Nebula » de chaque app ouvre `nebula://hub/` (le protocole lance le Hub s'il ne tourne pas). |
| I3 | Widgets de l'accueil | `news.headlines.today` (public, `HeadlinesV1` dans un `WidgetV1`), `clock.focus.today` (public), `finterest.budget.remaining` (**private**) | Finterest ne répond que si un compte est déverrouillé (sinon `null`). Sa valeur est **masquée par défaut** (•••) jusqu'au clic, **jamais écrite sur disque** par le Hub, et effacée quand le Hub se cache dans la zone de notification. |
| I4 | Pause lecture | `clock.break.started` (public, `BreakStartedV1`) → intent `news.open-briefing` | Option du Hub, **désactivée par défaut** : au début d'une pause longue, si News est installée, une notification propose « Lire le briefing ». |
| I5 | Centre d'activité | `link.notify` ; `*.notification` | Le Hub regroupe et peut relayer en notification Windows (réglable par app). Historique de **30 jours pour les notifications publiques** ; les privées ne sont **gardées qu'en mémoire** (perdues au redémarrage du Hub). **[À VALIDER]** |
| I6 | Présence du Hub | `nebula.hub.present` (`PresenceV1`) | Permet à chaque app de proposer le mode « Gérée par le Hub » (ADR-015) : mises à jour déléguées au Hub. |
| — | Sauvegardes (ADR-016) | `clock.backup.export`, `news.backup.export` (intents) | L'app écrit **elle-même** sa sauvegarde dans le fichier que le Hub lui indique (sous le dossier des sauvegardes) ; l'import se confirme dans l'app. Arrive en M8 avec l'adoption. |

**Renommages par rapport au brief** (pour suivre les identifiants réels, ADR-011 et ADR-013) :
`pomodoro.*` devient `clock.*`, `nebula.store.present` devient `nebula.hub.present`, et
`nebula://pomodoro/...` devient `nebula://clock/...`.

**Proposés mais hors V1** (brief § 8.6) : recherche globale entre apps, profil Nebula local
partagé (nom et avatar suggérés à la création d'un compte Finterest, sans toucher aux PIN), et
lien « actualité économique → simulateur Finterest ». Le protocole les permettrait sans
changement (`query` + `intent`). **[À VALIDER]**

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
- `notifications` (publiques uniquement, 30 jours).

Les valeurs reçues par Link (widgets, résultats de requêtes, notifications privées) restent **en
mémoire** dans le Hub.

## 13. Banc d'essai (`tests/link-harness/`)

- Deux fausses apps en Node pur, qui utilisent le vrai SDK : un **fournisseur** (une capacité de
  chaque `kind`, une publique et une privée) et un **consommateur**.
- Un script qui démarre le serveur Link du Hub en **mode test** : pipe et fichier de session dans
  un dossier temporaire, manifestes et « apps installées » simulés.
- Scénarios démontrés et testés : chaque type de capacité ; consentement demandé puis accordé,
  puis refusé, puis révoqué ; Hub absent (client `offline`, sans exception) puis présent
  (reconnexion) ; faux Hub (mauvaise preuve) ; faux client (mauvais jeton, app non installée,
  manifeste modifié) ; messages invalides (JSON cassé, trop gros, méthode inconnue, paramètres
  invalides) ; pause et reprise ; lien profond vers une app connectée, déconnectée ou absente.

## 14. Versions

- Le protocole s'appelle `nebula-link/1`. Ajouter une méthode, un schéma ou un champ facultatif
  le laisse en `/1` ; toute rupture crée `/2`, que le Hub peut servir en parallèle.
- `link.minProtocol` (catalogue) dit quel protocole une app exige. Le Hub refuse proprement une
  app qui demande plus qu'il ne sait faire, et sa fiche l'explique.

## 15. Décisions à valider

1. **Renommages** `pomodoro.*` → `clock.*` et `nebula.store.present` → `nebula.hub.present`
   (§ 10).
2. **Consentement non bloquant** : la première demande privée reçoit `consent-required` et la
   question est posée dans le Hub, plutôt que de faire attendre l'app (§ 6).
3. **Notifications privées** gardées en mémoire seulement, jamais sur disque (§ 10, I5).
4. **Pause de Link persistante** après un redémarrage du Hub (§ 6).
5. **Authentification mutuelle par HMAC** : le jeton ne circule jamais, et le client vérifie aussi
   le Hub (§ 4.2).
6. **Propositions hors V1** confirmées hors périmètre : recherche globale, profil partagé,
   actualité → simulateur (§ 10).
7. **Le Hub refuse une app dont le manifeste installé ne correspond pas** à celui qu'elle annonce
   (§ 4.2, étape 5). Conséquence : une app en développement (non installée) ne se connecte qu'au
   Hub en mode test.
