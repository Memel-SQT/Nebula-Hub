# Prompts de mise à niveau des apps Nebula

Ces prompts sont à coller dans une session Claude Code **ouverte dans le dépôt de l'app** (Nebula
Finterest, Nebula Clock, Nebula News). Ils font trois choses, dans cet ordre : mettre l'app à jour
et l'auditer, la rendre compatible avec Nebula Hub (Nebula Link, sauvegardes, import), puis
préparer sa publication. Chaque session présente d'abord son plan et attend ton accord.

## Mode d'emploi

1. **Une app à la fois**, dans l'ordre Finterest → Clock → News (brief, M8).
2. Ouvre Claude Code dans le dossier de l'app, colle le **prompt commun**, puis, à la suite, la
   **section propre à l'app**.
3. Avant de lancer : le SDK `@nebula/link` doit être publié (release `link-v1.0.0` du dépôt
   Nebula Hub). Si l'URL du SDK répond 404, la session doit s'arrêter et te le dire.
4. Relis le plan proposé, valide, puis relis le rapport final. Rien n'est fusionné ni publié sans
   ton accord.
5. Quand une app est prête, dis-le dans la session du Hub : le catalogue signé recevra son
   manifeste Link (`link`) et, si elle sait importer, son option d'import.

---

## Prompt commun (à copier tel quel)

```text
Tu travailles dans le dépôt d'une app de la famille Nebula (Nebula Finterest, Nebula Clock ou
Nebula News). Ces apps sont des apps Electron Windows, locales, sans compte ni télémétrie. Nebula
Hub (dépôt Memel-SQT/Nebula-Hub) est leur lanceur, leur store et le hub de Nebula Link, la couche
d'échanges locale entre elles. Ta mission a trois parties : mettre l'app à jour et l'auditer, la
rendre compatible avec le Hub, préparer sa publication.

RÈGLES (non négociables)
- Lis d'abord le CLAUDE.md du dépôt (s'il existe), le README et le DEV_CHANGES, et suis leurs
  conventions. Travaille sur une branche `feat/nebula-link` créée depuis la branche principale.
- Présente-moi un PLAN numéroté avant de modifier quoi que ce soit, et attends mon accord. Arrête-toi
  aussi avant toute opération destructive ou toute publication (push, tag, release).
- L'app doit rester 100 % utilisable SANS le Hub : Link est optionnel, ne bloque jamais le
  démarrage, ne lève jamais d'erreur quand le Hub est absent.
- Ne perds jamais de données utilisateur : migrations additives uniquement, aucun changement de
  format sans lecture de l'ancien, tests de non-régression sur des données réelles anonymisées.
- Aucune télémétrie, aucun appel réseau nouveau. Link est un IPC local (named pipe), opt-in.
- Sécurité Electron : contextIsolation, sandbox, pas de nodeIntegration, CSP, un seul preload aux
  méthodes précises (jamais d'`invoke(channel)` générique), navigation et window.open bloqués,
  pas de shell (execFile/spawn avec tableaux d'arguments).
- Code, commentaires et commits en anglais ; README et docs dans la langue du dépôt.

PARTIE 1 — MISE À JOUR ET AUDIT
1. Inventaire : versions d'Electron, Node, electron-builder, frameworks, dépendances obsolètes
   (`npm outdated` / `pnpm outdated`), vulnérabilités (`npm audit` / `pnpm audit`).
2. Mets à jour ce qui peut l'être sans risque (Electron récent et supporté, electron-builder,
   dépendances patch/minor) ; liste à part les montées majeures risquées avec leur impact.
3. Audit du code : sécurité Electron (liste ci-dessus), IPC (validation de chaque entrée côté
   main), chemins construits depuis des données externes, gestion d'erreurs, accessibilité
   (libellés, clavier), textes en dur, code mort, tests manquants sur les parties critiques
   (données, sauvegarde, mises à jour).
4. Corrige les problèmes trouvés (un commit par sujet), ajoute les tests qui manquent.
5. Vérifie : typecheck, lint, tests, build, et le paquet Windows (`dist`). Tout doit passer.

PARTIE 2 — COMPATIBILITÉ NEBULA HUB
A. Nebula Link (spécification : docs/NEBULA_LINK.md du dépôt Memel-SQT/Nebula-Hub, à lire en
   entier sur GitHub).
   - Dépendance : "@nebula/link": "https://github.com/Memel-SQT/Nebula-Hub/releases/download/link-v1.0.0/nebula-link-1.0.0.tgz"
     (si l'URL répond 404, arrête-toi et dis-le-moi). Zéro dépendance, CJS + ESM + types.
   - Manifeste `nebula.app.json` à la racine, copié dans `resources\` par electron-builder
     (`extraResources`). Le Hub le lit dans le dossier d'installation et refuse une app qui annonce
     autre chose : ce qui n'est pas déclaré est refusé.
   - Le SDK tourne dans le processus principal uniquement ; le renderer y accède par le preload
     existant, avec des méthodes précises.
   - `NebulaLink.create({ appId, appVersion, manifestPath })`, `connect()` au démarrage (ne lève
     jamais), `dispose()` à la fermeture.
   - I1 : réglage « Suivre l'apparence Nebula » (activé par défaut) ; à la réception de
     `nebula.appearance.changed`, applique thème, accent, fond animé, niveau d'animation, volume
     des sons et langue (objet AppearanceV1). Les réglages locaux restent possibles quand le
     réglage est coupé.
   - I2 : petit bouton « Apps Nebula » dans la navigation, qui ouvre `nebula://hub/` (le
     protocole lance le Hub s'il ne tourne pas ; sans Hub installé, le bouton propose de
     l'installer depuis sa page GitHub, via shell.openExternal après validation de l'URL).
     Gère les intents : `link.onIntent(...)` et, au démarrage, `NebulaLink.intentFromArgv(process.argv, link.manifest)`
     (argument `--nebula-intent`), plus `second-instance`.
   - I3 / I4 / I5 : les capacités de cette app (voir la section propre à l'app) : `provide` pour
     les widgets (WidgetV1, textes de 80 caractères au plus, jamais de HTML), `emit` pour les
     événements, `notify` pour le centre d'activité (sensibilité `private` pour toute donnée
     personnelle).
   - I6 : à la réception de `nebula.hub.present`, propose dans les réglages de l'app « Mises à
     jour gérées par Nebula Hub » (désactivé par défaut). Activé, l'updater intégré de l'app ne
     télécharge plus rien lui-même.
   - MODE HUB (§ 17 de la spécification, ADR-027) : l'app peut s'afficher « dans le Hub » tout en
     gardant son processus et ses données. Déclare `{ "id": "nebula.hub.dock", "kind": "event" }`
     dans `consumes` et abonne-toi avec `link.on('nebula.hub.dock', …)`. Charge utile DockV1 :
     • `{ state: 'docked', visible: true, raise, bounds }` → fenêtre SANS CADRE (une seconde
       BrowserWindow dédiée ou la principale reconfigurée), `setBounds(bounds)` exactement
       (coordonnées écran DIP), `showInactive()` (jamais de vol de focus), `skipTaskbar: true` ;
       si `raise`, `moveTop()` ;
     • `{ state: 'docked', visible: false }` → cache la fenêtre ;
     • `{ state: 'released' }` OU perte de connexion au Hub (`link.onStatus`) → retour IMMÉDIAT à
       la fenêtre normale (cadre, taille et position d'avant). L'app ne doit jamais rester
       invisible ni inaccessible.
     Ajoute dans l'app un bouton « Détacher » visible en mode Hub, qui revient à la fenêtre
     normale. Teste : bascule aller-retour, Hub qui quitte en plein mode Hub, plusieurs écrans,
     mise à l'échelle 100 / 125 / 150 %.
   - Tests : avec le Hub absent (l'app démarre et fonctionne), avec un faux Hub (banc d'essai :
     tests/link-harness/ du dépôt Nebula Hub, à reproduire en petit), schémas des résultats.
B. Données : sauvegarde, copie, import (ADR-016 et ADR-026 du Hub). But : on peut désinstaller,
   réinstaller, importer, et ne rien perdre ; l'app ne reste jamais bloquée entre deux.
   - Dossier RACINE des sauvegardes : `Documents\<Nom de l'app>\` (ex. `Documents\Nebula Finterest\`).
     C'est la référence : l'app y écrit toujours, et c'est là qu'elle regarde EN PREMIER pour
     importer ou restaurer.
   - Si l'utilisateur choisit un autre dossier (synchronisation, clé USB…), ce dossier ne reçoit
     qu'une COPIE (duplication) ; le dossier racine garde toujours l'original, et l'app lit
     d'abord le dossier racine.
   - Sauvegarde sans interface : `"<App>.exe" --backup-before-uninstall=<chemin complet du fichier>`
     écrit la sauvegarde puis quitte (code 0), même si l'app est déjà ouverte, sans fenêtre, en
     moins de 2 minutes. Format JSON versionné et documenté (`<app>-backup-v1`), lisible par
     l'import de l'app.
   - Import ciblé : `"<App>.exe" --import-backup=<chemin>` ouvre l'écran d'import de l'app sur ce
     fichier et demande une confirmation à l'utilisateur avant d'écrire quoi que ce soit (jamais
     d'import silencieux). Si l'app est déjà ouverte, l'argument arrive par `second-instance`.
   - Désinstallation : si l'installeur NSIS supprime les données, il fait d'abord la sauvegarde
     ci-dessus ; si cette sauvegarde échoue, il demande confirmation au lieu de bloquer. La
     désinstallation reste possible même sans sauvegarde (l'utilisateur l'a choisi), avec un
     message qui l'invite à exporter ses données ailleurs.
   - Après une réinstallation, au premier lancement sans données, si le dossier racine contient
     des sauvegardes, propose « Importer votre dernière sauvegarde » (avec sa date) : oui / non.
C. Publication : config `publish` GitHub, `latest.yml` publié avec l'installeur NSIS (taille et
   SHA-512 : le Hub les vérifie avant d'exécuter quoi que ce soit), `artifactName` de la forme
   `Nebula-<App>-Setup-${version}.${ext}`, arguments silencieux NSIS standard (`/S`, `/D=`,
   `--updated`), jamais de suppression de données sur une mise à jour.

PARTIE 3 — RAPPORT
Termine par un rapport court : ce qui est fait (5 lignes), commandes de validation et résultats,
écarts et décisions, points de sécurité et de données touchés, et les questions qui restent.
Mets à jour README et DEV_CHANGES (ou CHANGELOG) selon les conventions du dépôt. Ne pousse rien,
ne crée ni tag ni release sans mon accord explicite.
```

---

## Section Nebula Finterest (à coller après le prompt commun)

```text
APP : Nebula Finterest (appId `nebula.finterest`, exécutable `Nebula Finterest.exe`, dépôt
Memel-SQT/Nebula-Finterest). Elle a déjà `--backup-before-uninstall=` (format
`finterest-backup-v1`, vérifié par le Hub) et un import depuis un fichier dans ses réglages.

- Dossier de synchronisation (v0.1.36) : aujourd'hui « chaque profil y est recopié ». Change le
  modèle pour qu'il soit une DUPLICATION seulement : les comptes et leurs identifiants de base
  (profils, PIN hachés, réglages) restent dans le dossier racine local, qui est lu EN PRIORITÉ au
  démarrage ; le dossier choisi ne reçoit qu'une copie et ne sert qu'en secours (import, autre
  ordinateur), jamais à la place du dossier racine. Explique le comportement dans les réglages.
- Garde `--backup-before-uninstall=` et le format `finterest-backup-v1` compatibles (le Hub le
  valide : `{ app: 'Finterest', version: 1, exportedAt, accounts: [{ name, snapshot }] }`).
- Ajoute `--import-backup=<chemin>` (écran d'import pré-rempli, confirmation obligatoire, choix
  du compte cible comme aujourd'hui).
- Link :
  - widget `finterest.budget.remaining` (kind `widget`, sensitivity `private`, WidgetV1) : répond
    UNIQUEMENT si un compte est déverrouillé, sinon `null` ; aucune donnée d'un compte verrouillé.
  - notifications `private` : « Prélèvement prévu demain » (titre court, montant seulement dans le
    corps, jamais dans un titre public).
  - deep links : `/` et l'écran du mois (`/month?date=YYYY-MM`), à déclarer dans le manifeste.
- Thèmes `old-*` intacts : s'ils sont choisis, « Suivre l'apparence Nebula » ne change que le reste.
- Migrations additives uniquement. Précise dans le README que « aucun appel réseau » reste vrai
  (Link est un IPC local, opt-in) et mets à jour DEV_CHANGES.
```

## Section Nebula Clock (à coller après le prompt commun)

```text
APP : Nebula Clock (appId `nebula.clock`, minuteur Pomodoro, dépôt Memel-SQT/nebula-clock,
monorepo pnpm, app Electron dans `apps/desktop`). Suis CONTRIBUTING.md et les commits
conventionnels (commitlint) du dépôt.

- Link :
  - widget `clock.focus.today` (public) : pomodoros faits / objectif du jour et série (données
    FocusTodayV1 présentées dans un WidgetV1 : valeur « 5 / 8 », légende « Série : 12 jours »).
  - événement `clock.break.started` (public, BreakStartedV1 `{ kind: 'short' | 'long', durationMin }`)
    au début de chaque pause.
  - notification publique « Session terminée » en fin de session.
  - deep links : `/` et `/start?preset=<nom>`.
- Données : si l'app garde un historique ou des réglages à protéger, ajoute la sauvegarde sans
  interface et l'import décrits plus haut (format `clock-backup-v1`, dossier racine
  `Documents\Nebula Clock\`), et signale-le dans le rapport : le Hub devra connaître ce format.
- Electron 33 est ancien : propose la montée vers une version supportée, avec les tests.
```

## Section Nebula News (à coller après le prompt commun)

```text
APP : Nebula News (appId `nebula.news`, briefing du jour, dépôt Memel-SQT/Nebula-News, app Next.js
empaquetée pour Windows ; main Electron en CommonJS dans `desktop/main.js` : utilise
`require('@nebula/link')`).

- Publication : ajoute la config `publish` GitHub et `artifactName` =
  `Nebula-News-Setup-${version}.${ext}` pour devenir installable depuis le Hub (latest.yml publié).
- Link :
  - widget `news.headlines.today` (public) : les 3 premiers sujets du briefing du jour
    (HeadlinesV1 présentés dans un WidgetV1 : `items` = titre + source, `deepLink` vers le briefing).
  - intent `news.open-briefing` (chemin `/briefing`), utilisé par le Hub quand une pause longue
    de Clock commence et que l'utilisateur a activé l'option.
  - notification publique « Votre briefing est prêt ».
- Données : sauvegarde / import comme plus haut si l'app garde des préférences ou un historique
  (format `news-backup-v1`, dossier racine `Documents\Nebula News\`), à signaler dans le rapport.
```

---

## Ce que le Hub fera de son côté

- Ajouter à chaque app son entrée `link` dans le catalogue signé (manifeste `nebula.app.json`) dès
  qu'une version compatible est publiée, et l'option `importArgument` (`--import-backup=`) pour
  qu'« Importer une sauvegarde » ouvre directement l'écran d'import de l'app.
- Reconnaître les nouveaux formats de sauvegarde (`clock-backup-v1`, `news-backup-v1`) s'ils
  existent.
- Activer l'intégration I4 (pause lecture) quand Clock et News publient leurs capacités.
- Proposer « Ouvrir dans le Hub » dès que le manifeste installé d'une app consomme
  `nebula.hub.dock` (rien à faire de plus côté Hub : c'est déjà en place).
