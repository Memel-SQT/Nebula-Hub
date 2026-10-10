# Nebula Store — Journal des décisions (ADR)

Règles du journal : les ADR sont numérotés, **jamais réécrits**. Une décision qui change fait
l'objet d'un nouvel ADR qui « remplace » ou « amende » l'ancien. Statuts : **Accepté**,
**Proposé** (en attente de validation), **Remplacé par ADR-xxx**.

Les constats qui fondent ces décisions sont détaillés dans [DISCOVERY.md](DISCOVERY.md).

---

## ADR-001 — Electron 44 et versions de l'outillage

- **Statut** : Accepté (M0) — les écarts au brief sont signalés.
- **Contexte** : le brief demande la dernière version stable d'Electron (Finterest est en 32, News
  en 43) et la même structure d'outillage que Finterest. Au 2026-10-01 : Electron 44.5.1,
  electron-builder 26.15.3, electron-updater 6.8.9, tsup 8.5, TypeScript 7.0, Vite 8.3, Jest 30,
  ESLint 10.
- **Décision** :

  | Outil | Version | Raison |
  |---|---|---|
  | Electron | **44.x** | dernière stable |
  | electron-builder | **26.15.x** | dernière ; déjà éprouvée par News sur Windows |
  | electron-updater | **6.8.x** | identique à Finterest |
  | TypeScript | **5.9.x** | `ts-jest` 29.4 exige `typescript < 7` |
  | Vite | **7.x** (repli 6.x si `@vitejs/plugin-react` pose problème) | Vite 8 change de bundler (Rolldown) ; inutile de cumuler ce risque avec le portage |
  | Jest + ts-jest + jsdom | **29.x** | identique à Finterest |
  | ESLint | **9.x** | imposé par le brief |
  | React | **18.3** | imposé par le brief, comme toute la famille |
  | Node | **≥ 22.12** | ⚠ Écart : le paquet `electron@44` exige Node ≥ 22.12 pour s'installer. La CI passera en Node 22 (Finterest est en 20). |
- **Conséquences** : la vérification de compatibilité tsup ↔ Electron 44 ↔ electron-builder 26
  se fait au premier `dist:win` de M1. Un échec donnera lieu à un ADR qui amende celui-ci.

## ADR-002 — Langue des documents

- **Statut** : Accepté (M0).
- **Décision** : code, commentaires, commits et `CLAUDE.md` en anglais (brief). `README.md`,
  rapports de jalon **et les documents de `docs/`** (dont ce journal) en français, puisque ce sont
  des documents de travail destinés à l'auteur, comme le hub `Repo-Nebula-Context`.
- **Conséquence** : à inverser par un nouvel ADR si `docs/NEBULA_LINK.md` et
  `docs/INTEGRATION_GUIDE.md` doivent être lus par des contributeurs non francophones.

## ADR-003 — Lecture du registre : `reg.exe export` plutôt que `reg.exe query`

- **Statut** : Proposé (ajuste un choix [PAR DÉFAUT] : même outil, autre sous-commande).
- **Contexte** : le brief propose `reg.exe query` via `execFile`, sans dépendance native. Constat :
  quand sa sortie est redirigée, `reg.exe` écrit dans la page de code OEM (850 sur un Windows
  français). Un chemin d'installation contenant un caractère non ASCII (profil `C:\Users\Noé\…`)
  serait mal décodé, et Node ne sait pas décoder le CP850 nativement. Les lignes de conclusion
  (« Fin de la recherche : … ») sont en outre localisées.
- **Décision** : `execFile('reg.exe', ['export', <clé>, <fichier temporaire>, '/y'])`. Le fichier
  `.reg` produit est en **UTF-16LE avec BOM**, indépendant de la langue du système. Il est analysé
  par un parseur pur et testé dans `src/shared/registry.ts` (chaînes échappées, `dword:`,
  `hex(2):` pour `REG_EXPAND_SZ`), avec des fixtures tirées de sorties réelles anonymisées. Le
  fichier temporaire vit dans `%LOCALAPPDATA%\Nebula Store\tmp\` et est supprimé aussitôt.
- **Clés lues** (lecture seule) : `HKCU` puis `HKLM` de
  `Software\Microsoft\Windows\CurrentVersion\Uninstall` (et la vue 32 bits de HKLM), plus, pour
  chaque app retenue, `Software\<nom de la clé Uninstall>` qui porte `InstallLocation`.
- **Règle de détection** (indépendante des GUID, comme demandé) : `DisplayName === productName`
  ou commence par `productName + " "` ; puis l'emplacement vient de `InstallLocation` (clé
  `Software\<GUID>`), à défaut du dossier parent de l'exécutable entre guillemets de
  `UninstallString` ; l'app n'est « installée » que si `<emplacement>\<exeName>` existe.
- **Référence** : la clé Uninstall est nommée `UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3)`
  (`app-builder-lib/out/targets/nsis/NsisTarget.js`), vérifié sur les trois apps installées. Le
  Store **n'utilise pas** ce calcul pour détecter, mais s'en sert dans les tests et comme
  contrôle de cohérence.
- **Alternative écartée** : un module natif (`winreg`, `registry-js`) : dépendance native à
  recompiler pour chaque version d'Electron, sans gain ici. PowerShell : plus lent (≈ 0,5 s) et
  soumis aux politiques d'exécution.

## ADR-004 — Arguments des installeurs NSIS : reproduire `electron-updater` [CRITIQUE]

- **Statut** : Accepté (M0) — à démontrer en M5 par les trois recettes de la section 7.6.
- **Contexte** : une mise à jour lancée par le Store ne doit jamais supprimer les données d'une
  app, en particulier celles de Finterest (`deleteAppDataOnUninstall: true`).
- **Ce que dit le code** (identique en app-builder-lib 24.13.3, 25.1.8 et 26.15.3) :
  - `electron-updater/out/NsisUpdater.js`, `doInstall()` : `args = ["--updated"]`, puis `/S` si
    silencieux, `--force-run` si relance demandée, `/D=<dir>` seulement si `installDirectory` est
    fixé (non par défaut), `--package-file=` seulement pour les installeurs web.
  - `templates/nsis/include/installUtil.nsh`, `uninstallOldVersion` : le nouvel installeur exécute
    l'ancien désinstalleur avec `/S /KEEP_APP_DATA <mode> --updated _?=<dir>`, et passe
    `--delete-app-data` à la place **uniquement** si lui-même l'a reçu.
  - `templates/nsis/uninstaller.nsh` : suppression de `%APPDATA%\…` seulement si
    `${ifNot} ${isUpdated}` ou si `--delete-app-data` est présent.
  - `out/targets/nsis/nsisScriptGenerator.js` : les drapeaux sont des paramètres de ligne de
    commande testés par `StdUtils.TestParameter`.
  - `templates/nsis/include/allowOnlyOneInstallerInstance.nsh` : en mode `/S`, un installeur
    **tue l'app** si elle tourne (`MessageBox … /SD IDOK` puis `taskkill`), et un second
    installeur de la même app s'arrête (mutex nommé par le GUID).
- **Décision** :

  | Opération | Arguments (tableau `execFile`) |
  |---|---|
  | Installation neuve | `["/S"]`, plus `"/D=<dir>"` **en dernier**, non entre guillemets, si l'utilisateur a choisi un dossier |
  | Mise à jour | `["--updated", "/S"]` |
  | Réparation | `["--updated", "/S"]` (même version réinstallée) |
  | Relance après opération | jamais `--force-run` : le Store lance l'app lui-même s'il le faut (7.8) |
  | Interdit, partout | `--delete-app-data`, et `/D` lors d'une mise à jour ou d'une réparation (l'installeur relit `InstallLocation`) |
- **Obligations qui en découlent** :
  1. Avant tout installeur, l'app doit être **fermée avec le consentement de l'utilisateur** (R08),
     sinon l'installeur la tue lui-même.
  2. Après la fermeture et après tout échec, le Store **relit la version installée** : l'updater
     intégré de l'app (`autoInstallOnAppQuit`) peut avoir installé la mise à jour entre-temps, ou
     occuper le mutex.
  3. Une désinstallation lance `QuietUninstallString` (découpé en exécutable + arguments, sans
     shell) puis **attend la disparition de la clé de registre** avec un délai maximal : le
     désinstalleur NSIS se recopie dans `%TEMP%` et rend la main tout de suite.
  4. Les tests du main simulent ces trois comportements (faux installeur qui tue, qui prend le
     mutex, qui rend la main avant la fin).

## ADR-005 — Rendu des notes de version : lexer `marked` → éléments React

- **Statut** : Proposé — [À VALIDER].
- **Options** :
  - **A. `marked` + `DOMPurify`** : produit du HTML puis l'assainit, affiché par
    `dangerouslySetInnerHTML`. Éprouvé, mais on manipule du HTML distant, l'assainissement dépend
    d'une configuration correcte, et deux dépendances.
  - **B. Rendu maison complet** : zéro dépendance, mais un parseur Markdown à écrire et à
    maintenir (listes imbriquées, code, tableaux GFM…).
  - **C. Recommandée : le *lexer* de `marked` seul** (`marked.lexer()`, zéro dépendance
    transitive), dont les jetons sont convertis en éléments React par un composant maison. Les
    jetons `html` sont **ignorés**, les images non chargées (CSP), les liens rendus en boutons qui
    appellent `shell.openExternal` via le preload après vérification `https:` dans le main.
- **Pourquoi C** : **aucun HTML distant n'atteint jamais le DOM**, donc rien à assainir et pas de
  `dangerouslySetInnerHTML` dans le code. On profite d'un parseur robuste (GFM) sans écrire de
  parseur. La sécurité tient par construction plutôt que par configuration. Testable en jsdom.

## ADR-006 — Police : pile système de Finterest

- **Statut** : Accepté (M0) — conforme au [PAR DÉFAUT] du brief.
- **Contexte** : le design system recommande Inter « quand une police web est possible », sinon
  `'Segoe UI Variable Text', 'Segoe UI', system-ui` ; Finterest utilise
  `'Aptos', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif`.
- **Décision** : pile de Finterest, sans police chargée (ni Internet ni fichier embarqué). Le Store
  doit être indiscernable de Finterest au niveau des composants, et la pile du design system en
  est un sous-ensemble. Chiffres tabulaires pour versions, tailles et progressions.

## ADR-007 — Dossiers de données du Store

- **Statut** : Accepté (M0).
- **Décision** :
  - `name` du paquet : `nebula-store` ; `productName` : `Nebula Store`.
  - `userData` **épinglé** explicitement à `%APPDATA%\Nebula Store` dans `main.ts`, avant toute
    lecture, à la manière de Finterest : un futur renommage du produit ne doit pas « perdre » les
    consentements et l'historique. Variable d'environnement `NEBULA_STORE_USER_DATA_DIR` pour les
    tests manuels, jamais définie en production.
  - Téléchargements : `%LOCALAPPDATA%\Nebula Store\downloads\` ; jeton Link :
    `%LOCALAPPDATA%\Nebula Link\session.json`.
  - `nsis.deleteAppDataOnUninstall` : **non activé** (consentements archivés et historique
    conservés si l'utilisateur réinstalle).
- **Constat** : aucun dossier existant n'entre en collision (DISCOVERY § 5).

## ADR-008 — Distribution du SDK `nebula-link`

- **Statut** : Proposé — [À VALIDER].
- **Contexte** : trois consommateurs, deux gestionnaires de paquets : Finterest et News (npm),
  Clock (pnpm). La famille ne partage aujourd'hui que par copie de fichiers.
- **Options** :
  - **Dépendance git avec sous-dossier** (`github:Memel-SQT/Nebula-Store#path:packages/nebula-link`) :
    ⚠ **npm ne la supporte pas** (syntaxe pnpm / Yarn uniquement) ; écartée pour Finterest et News.
  - **GitHub Packages** : exige un jeton d'authentification même pour un paquet public ; écarté
    (CI et installation locale compliquées).
  - **Registre npm public** : possible, mais publie un paquet sous un nom à réserver, pour trois
    consommateurs.
  - **Archive `.tgz` en asset de release** (recommandée) : `npm pack` produit
    `nebula-link-<v>.tgz`, publié sur une release du Store (tag `link-v<v>`). Les apps déclarent
    `"@nebula/link": "https://github.com/Memel-SQT/Nebula-Store/releases/download/link-v1.0.0/nebula-link-1.0.0.tgz"`.
    npm **et** pnpm supportent les URL d'archive, et **inscrivent l'empreinte `integrity`
    (sha512) dans le lockfile** : version immuable et vérifiée, sans registre ni jeton.
  - **Copie vendorisée** (`vendor/nebula-link/` + fichier `VERSION`) : fidèle à la culture de la
    famille, hors ligne, mais mise à jour manuelle et dérive possible — exactement ce que le hub
    reproche à la diffusion des tokens.
- **Recommandation** : l'archive en asset de release ; la copie vendorisée reste le repli si tu
  préfères que les apps n'aient aucune dépendance distante.

## ADR-009 — Source de la DA : design system et lot v0.1.36 de Finterest

- **Statut** : Proposé — [À VALIDER] (question 1 du rapport M0).
- **Contexte** : voir DISCOVERY § 4. Le brief demande de porter les modules de Finterest
  v0.1.36 et de faire de `packages/nebula-design` la source partagée de la famille ; les règles de
  la famille (`nebula-design-system/AGENTS.md`) interdisent de copier des tokens depuis un produit
  voisin et désignent `nebula-design-system` comme unique source.
- **Proposition** :
  1. Les **valeurs de base** (palettes sombre et claire, dégradé 100°, halo, mouvement) sont
     reprises de `nebula-design-system/tokens/` et **contrôlées une à une** contre Finterest ; elles
     sont identiques sauf les points listés en DISCOVERY § 4.1.
  2. Les **noms de variables** restent ceux de Finterest (`--page`, `--surface`, `--accent`,
     `--gold`…), parce que les modules v0.1.36 à porter en dépendent et que la parité est verrouillée.
  3. Les modules du lot v0.1.36 (thèmes verre, accents, fonds, niveaux d'animation, sons, effets,
     icônes, splash, réglages) sont **portés depuis Finterest**, seule source existante, avec la
     mention d'origine en tête de fichier.
  4. Arbitrages de valeurs : `--danger` = `#FB7185` / `#BE123C` (prose de la DA et brief) ;
     `data-motion` couvre la règle « deux réductions de mouvement indépendantes ».
  5. `packages/nebula-design` est **une étape**, pas une seconde source : à la fin de la V1, son
     contenu a vocation à remonter dans `nebula-design-system` (tokens étendus, lot v0.1.36,
     `ports/nebula-store/`), pour que le flux reste « design system → produits ».

## ADR-010 — Sources du catalogue : pas de miroir Gitea

- **Statut** : Proposé — [À VALIDER].
- **Contexte** : `git.rodriguesnoa.fr` résout, y compris par le DNS public, vers une adresse
  Tailscale : il n'est joignable que depuis le tailnet, et ne répondait pas au moment du test.
- **Proposition** : ordre de lecture du catalogue signé :
  1. `raw.githubusercontent.com/Memel-SQT/Nebula-Store/main/catalog/nebula-catalog.json` (+ `.sig`) ;
  2. assets `nebula-catalog.json` / `.sig` de la **dernière release** du Store (`github.com`) ;
  3. dernier catalogue valide en cache, avec avertissement.

  `git.rodriguesnoa.fr` reste dans la liste blanche R05 mais n'est **pas** interrogé par défaut ;
  il pourra devenir une source optionnelle (réglage avancé) si tu le veux pour un usage dans le
  tailnet. Toutes les sources passent par la même vérification de signature (R03).

## ADR-011 — Identifiants du Store et de Clock

- **Statut** : Proposé — [À VALIDER].
- **Contexte** : le brief propose `appId: "com.nebula.store"`. Les apps récentes de la famille
  suivent `<produit>.nebula.desktop` (`news.nebula.desktop`, `clock.nebula.desktop`) ; seul
  Finterest garde l'historique `com.finterest.desktop`. Par ailleurs le brief nomme le Pomodoro
  `nebula.pomodoro`, mais le produit s'appelle **Nebula Clock**.
- **Proposition** :
  - `appId` du Store : **`store.nebula.desktop`**. Il fixe le GUID de la clé de désinstallation et
    l'AppUserModelId des notifications Windows : il ne pourra plus changer après la v0.1.0.
  - Identifiant catalogue et Link de Clock : **`nebula.clock`**, et liens profonds
    `nebula://clock/...` (le brief écrit `nebula://pomodoro/...`). Un alias `pomodoro` peut être
    accepté par le routeur si tu y tiens.

## ADR-012 — Validation des propositions de M0

- **Statut** : Accepté (2026-10-01, réponse au rapport M0 : « carte blanche sur la config »).
- **Décision** : les ADR proposés en M0 sont acceptés tels quels :
  - ADR-003 (`reg export`), ADR-005 (lexer `marked` → React), ADR-008 (SDK en archive `.tgz`
    publiée en asset de release), ADR-009 (valeurs du design system, noms de Finterest, lot
    v0.1.36 porté depuis Finterest, remontée prévue vers `nebula-design-system`), ADR-010 (pas de
    miroir Gitea par défaut), ADR-011 (`appId` `store.nebula.desktop`, identifiant `nebula.clock`
    et liens `nebula://clock/...`).
  - Node ≥ 22.12 en local et en CI (ADR-001).
  - Un commit local par jalon, jamais de push sans accord explicite.
  - Recette [CRITIQUE] (c) de la section 7.6 : « importable » signifie que chaque profil est
    recréé avec le même nom, puis la sauvegarde importée compte par compte (les PIN et les
    avatars ne sont pas sauvegardés par Finterest).
  - L'installation réelle de Finterest (0.1.35) sur la machine de développement n'est pas mise à
    jour pour les tests : les recettes passent par Windows Sandbox.
- **Conséquence** : l'identifiant `nebula.clock` n'entre dans le dépôt `nebula-clock` qu'en M8
  (R01), par son `nebula.app.json`.

## ADR-013 — Le produit s'appelle « Nebula Hub » et sert de lanceur

- **Statut** : Accepté (2026-10-01, demande explicite). Remplace l'`appId` proposé par ADR-011.
- **Décision** :
  - Nom du produit : **Nebula Hub** (le brief disait « Nebula Store »). `productName` `Nebula Hub`,
    paquet `nebula-hub`, **`appId` `hub.nebula.desktop`** (convention `<produit>.nebula.desktop`),
    exécutable `Nebula Hub.exe`, installeur `Nebula-Hub-Setup-${version}.exe`, dépôt GitHub
    `Memel-SQT/Nebula-Hub` (miroir `git.rodriguesnoa.fr/noa/Nebula-Hub.git`), identifiant catalogue
    et Link `nebula.hub`, événement de présence `nebula.hub.present` (ex-`nebula.store.present`).
  - Données : `%APPDATA%\Nebula Hub` (épinglé, cf. ADR-007), `%LOCALAPPDATA%\Nebula Hub\`.
    Aucune collision (DISCOVERY § 5).
  - Pont preload : `window.nebulaHub`.
  - L'écran d'accueil (le « Hub » du brief) s'appelle **Accueil** / **Home** dans l'interface.
  - **Rôle de lanceur** : l'accueil donne la priorité au lancement des apps installées ; le tray
    et le démarrage avec Windows en font le point d'entrée de la famille. Les apps **gardent leur
    version autonome** : elles s'installent, se lancent et se mettent à jour sans le Hub (R09),
    et le Hub les détecte quelle que soit la façon dont elles ont été installées.
- **Conséquence** : les documents déjà écrits (DISCOVERY, ADR-001 à 012) gardent le nom
  « Nebula Store », qui désigne le même produit. Le dossier local `Nebula-Store\` peut être
  renommé `Nebula-Hub\` entre deux sessions, sans effet sur le code.

## ADR-014 — Personnalisation complète dans toutes les apps

- **Statut** : Accepté (2026-10-01, demande explicite). Amende la section 10.7 du brief et
  ADR-009 (l'adoption par les autres apps n'est plus « à valider » : elle est dans le périmètre).
- **Décision** : Finterest, Clock et News reçoivent toute la personnalisation de Finterest
  v0.1.36 (4 thèmes Nebula, 6 accents + personnalisé, 6 fonds, 3 niveaux d'animation, 8 sons,
  effets, icônes), **en version autonome comme sous le Hub**. Sous le Hub, I1 la synchronise.
- **Moyen** : `packages/nebula-design` (`@nebula/design`) est la source unique. Il est
  distribué comme le SDK Link (archive `.tgz` en asset de release, ADR-008) et consommé :
  - par Finterest : remplace ses copies de `theme.ts`, `appearance.ts`, `sound.ts`, `effects.ts`,
    `BackgroundFx.tsx`, `Icon.tsx` (ses thèmes `old-*` restent locaux et figés, via le paramètre
    `frozenTheme` d'`applyAppearance`) ;
  - par Clock : ses tokens (`--bg-base`…) sont branchés sur ceux du paquet par une couche de
    correspondance, le preset Tailwind est conservé ;
  - par News : `tailwind.config.ts` référence les variables CSS au lieu des valeurs en dur.
- **Calendrier** : réalisé en M8, un dépôt à la fois, sur la branche `feat/nebula-link`, selon le
  `CLAUDE.md` de chaque dépôt (R01 inchangée). Le paquet est conçu dès M1 pour cette adoption :
  aucune dépendance au Hub, sélecteur de surfaces vitrées paramétrable, hooks sans stockage.

## ADR-015 — Migration entre version autonome et version gérée par le Hub

- **Statut** : Accepté (2026-10-01, demande explicite). Réalisation : M5 (réinstallation),
  M7 (assistant), M8 (bascule dans chaque app).
- **Constat** : une app « autonome » et une app « gérée par le Hub » sont **le même binaire**,
  installé par le même installeur NSIS. Ce qui change est un **mode**, porté par l'app.
- **Décision** :
  - Chaque app a un mode **Gérée par le Hub** (mises à jour déléguées au Hub, apparence suivie,
    Link actif) ou **Autonome** (son propre `electron-updater`, son apparence locale). Le choix
    est stocké par l'app et exposé via Link (M8).
  - **Migrer vers le Hub** (une app ou « Tout migrer ») : pour chaque app détectée, le Hub
    (1) fait la sauvegarde préalable de l'app (7.6, `preOperationBackup`), (2) propose une
    **réinstallation vérifiée** de la version courante (téléchargement, SHA-512, installeur en
    mode mise à jour `--updated /S` : données conservées, ADR-004), puis (3) bascule l'app en mode
    géré. L'étape (2) est optionnelle, cochée par défaut : elle sert à garantir l'intégrité de
    l'installation, pas à la « convertir ».
  - **Repasser en autonome** : bascule du mode, sans réinstallation ni effet sur les données. Le
    Hub peut ensuite être désinstallé sans toucher aux apps.
  - Toute réinstallation passe par l'écran de confirmation R04 (ce qui arrive aux données, chemin
    de la sauvegarde).

## ADR-016 — Sauvegardes et exports depuis le Hub

- **Statut** : Accepté (2026-10-01, demande explicite). Réalisation : M5 (Finterest), M7
  (écrans), M8 (Clock, News).
- **Contrainte** : R07 — le Hub ne lit jamais les données d'une autre app. **Chaque app produit
  elle-même sa sauvegarde** ; le Hub la déclenche, la vérifie et la range.
- **Décision** :
  - Réglages → **Sauvegardes** : « Exporter », « Restaurer », « Dossier des sauvegardes » (par
    défaut `Documents\Nebula Hub\Sauvegardes`, modifiable par une boîte de dialogue native du main ;
    le renderer ne manipule jamais de chemin).
  - L'export ouvre un assistant : **Complète** (toutes les apps installées qui savent se
    sauvegarder) ou **Personnalisée** (cases à cocher, une seule app possible).
  - Un export produit un dossier horodaté `Nebula Hub – <date>\` contenant un fichier par app et
    un `manifest.json` (app, version de l'app, date, taille, SHA-512 de chaque fichier), vérifié
    à la restauration.
  - Moyens par app : Finterest via son mode existant `--backup-before-uninstall=<fichier>` (sans
    modification de Finterest) ; Clock et News via une capacité Link `*.backup.export` /
    `*.backup.import` ajoutée en M8 (Clock a déjà un export/import JSON, News n'en a pas).
  - **Hors périmètre** : déplacer le dossier de données *vivant* d'une app. Finterest épingle
    `%APPDATA%\Finterest` volontairement (son `CLAUDE.md` l'interdit) ; Finterest propose déjà son
    propre dossier de synchronisation secondaire. À rouvrir par un nouvel ADR si nécessaire.


## ADR-017 — Choix visuels de M1

- **Statut** : Accepté (M1), à la suite des retours sur la première version.
- **Décisions** :
  - **Fenêtre sans cadre natif** (`titleBarStyle: 'hidden'`) : seuls les trois contrôles Windows
    sont dessinés, transparents sur le fond de l'app, symboles à la couleur d'encre du thème
    (`titleBarOverlay`, mis à jour à chaque changement de thème et de thème système). Une bande
    de 36 px sert de zone de glissement. Barres de défilement aux couleurs des jetons.
  - **Mise en page dans la grammaire du tableau de bord de Finterest** : cartes de synthèse à
    bordure supérieure colorée, panneaux avec sur-titre, titre et pilule, lignes de résumé, en-tête
    avec commande encadrée à droite.
  - **Barre latérale sans séparation** : le panneau est transparent ; un voile (pseudo-élément)
    de la couleur de la barre, flouté et masqué en dégradé, s'efface vers le contenu. Le thème et
    le fond animé passent dessous sans couture, le texte reste sur la partie opaque du voile.
  - **Liste de la famille embarquée** (`src/renderer/family.ts`, icônes officielles copiées des
    dépôts publics dans `catalog/icons/`) jusqu'au catalogue signé de M2, qui la remplacera ;
    elle servira ensuite de repli au premier lancement hors ligne.
  - **Logos** : trois propositions avec halo d'étoile et poussière d'étoiles ; la proposition A
    sert provisoirement aux icônes jusqu'au choix (arrêt de M1).

## ADR-018 — Logo « Orbite » et icônes

- **Statut** : Accepté (2026-10-01, choix de l’utilisateur à l’arrêt de M1).
- **Décision** : la proposition **B — Orbite** devient la marque de Nebula Hub (`CURRENT_MARK`).
  - Comme elle est la moins lisible en petit, elle reçoit une **variante optique** (`MARKS.b.small`) :
    trois tuiles en trait plus épais et l’étoile, sans orbite ni poussière. Elle sert pour 16 à
    32 px (`build/icon.ico` jusqu’à 32 px, `HubMark` à 32 px ou moins) ; au-delà, la marque complète.
  - **Tray** : glyphe monochrome sans plaque (brief 10.6), blanc sur barre des tâches sombre
    (`assets/tray-dark.png`), foncé sur barre claire (`tray-light.png`), choisi d’après
    `HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, valeur
    `SystemUsesLightTheme` (le mode *système*, que `nativeTheme` ne
    donne pas), relu à chaque changement de thème.
- **Confirmé au même moment** : le réglage « Dossier des sauvegardes » (ADR-016) désigne le dossier
  où le Hub range les exports, pas le dossier de données des apps.

## ADR-019 — Acquisition du catalogue : sources, anti-retour arrière, client réseau

- **Statut** : Accepté (M2). Précise ADR-010.
- **Décisions** :
  - **Quatre sources**, toutes vérifiées (signature Ed25519 puis schéma) : GitHub raw (branche
    main), assets de la dernière release du Hub, dernière copie vérifiée en cache, et un
    **catalogue signé inclus dans l'app** (extraResources). Ce dernier n'était pas dans le brief :
    il garantit un premier lancement complet hors ligne, et un Hub utilisable tant que le dépôt
    `Nebula-Hub` n'est pas publié.
  - **Anti-retour arrière** : parmi les copies valides, le `generatedAt` le plus récent l'emporte.
    Un ancien catalogue signé, rejoué par le réseau, ne remplace pas un plus récent.
  - Une source qui répond avec un catalogue invalide est ignorée **avec un avertissement** visible
    (R03) ; une source injoignable est ignorée silencieusement (mode hors ligne).
  - **Client réseau** : `node:https` en requêtes simples, redirections suivies **manuellement**
    pour vérifier chaque saut contre la liste blanche avant d'ouvrir la connexion (R05), taille
    et durée plafonnées, ETag / `If-None-Match`. Choisi plutôt que `net.fetch` d'Electron pour
    contrôler chaque saut et tester sans Electron. Limite connue : les proxys système ne sont pas
    utilisés (à revoir si un utilisateur en a besoin).
  - **Cache** dans `store.sqlite` (sql.js) : `http_cache` (URL, ETag, corps), `catalog_cache`
    (dernier catalogue vérifié), `sync_state` (dates, releases connues par app et par canal).
    Rafraîchissement réseau au plus toutes les 6 h, sauf « Actualiser » ou changement de canal.
  - Les **visuels** (icônes, captures) sont servis au renderer en `data:` URL, uniquement pour les
    chemins déclarés par le catalogue ; la copie incluse dans l'app est servie en priorité.
  - Scripts en TypeScript (`scripts/sign-catalog.ts`, `scripts/generate-catalog-key.ts`) plutôt
    que `sign-catalog.mjs` : ils réutilisent la validation et la vérification du Hub lui-même.
  - Clé de signature générée le 2026-10-01, privée hors dépôt (`%USERPROFILE%\.nebula-hub\`),
    empreinte publique dans `docs/CATALOG.md` et dans les réglages du Hub.

## ADR-020 — Détection et lancement des apps installées (M3)

- **Statut** : Accepté (M3). Amende ADR-003 sur trois points de mise en œuvre.
- **Amendements à ADR-003** :
  - Le parseur s'appelle `src/shared/reg-file.ts` (et non `registry.ts`, déjà proche de
    `registry-dword.ts`) ; la règle de détection pure est dans `src/shared/detection.ts`.
  - Le fichier `.reg` temporaire est écrit dans le dossier temporaire du système (`os.tmpdir()`,
    soit `%LOCALAPPDATA%\Temp`), avec un nom unique par processus, puis supprimé aussitôt. Créer un
    dossier `Nebula Store\tmp` n'apportait rien et aurait gardé l'ancien nom du produit.
  - Une app dont la clé de désinstallation existe mais dont l'exécutable manque n'est **pas
    masquée** : elle apparaît « Installation incomplète », sans bouton « Ouvrir ». La masquer
    aurait caché un cas que la réparation (M5) doit justement proposer.
- **Décisions** :
  - **Ordre des clés** : HKCU, puis HKLM, puis la vue 32 bits de HKLM ; la première entrée
    trouvée l'emporte (les apps de la famille s'installent par utilisateur). La portée
    (« pour cet utilisateur » / « pour tous les utilisateurs ») est affichée.
  - **Version installée** : `DisplayVersion` de l'entrée de désinstallation.
  - **App ouverte** : `tasklist.exe /FO CSV /NH` (via execFile), comparé au nom de l'exécutable
    du catalogue, sans distinction de casse. Information affichée seulement : le Hub ne ferme
    jamais une app sans accord (R08).
  - **Quand détecter** : au démarrage, à chaque catalogue reçu, quand la fenêtre du Hub reprend
    le focus, 2,5 s après un lancement, et sur « Détecter à nouveau ». Les demandes sont
    regroupées (anti-rebond) et une détection ne tourne jamais deux fois en parallèle : un appel
    pendant une détection en programme exactement une autre. Mesuré : ≈ 0,5–0,8 s sur la machine
    de développement, sans bloquer l'interface.
  - **Lancement** : seul le processus principal décide du chemin, recalculé depuis la détection
    (`<emplacement>\<exeName du catalogue signé>`), vérifié absolu, directement dans
    l'emplacement et existant. `spawn(exe, [], { detached, cwd: emplacement })` puis `unref` :
    aucun argument, aucun shell (R11), et l'app survit à la fermeture du Hub. Le renderer ne
    transmet qu'un identifiant d'app ; le Hub refuse de se lancer lui-même.
  - **Ce que voit le renderer** : identifiant, version, portée, emplacement, exécutable présent,
    app ouverte. Les commandes de désinstallation restent dans le processus principal.
  - **Lanceur** : sur l'accueil et dans la barre latérale, un clic sur une app installée l'ouvre ;
    la fiche reste à un bouton (« Voir la fiche »). Les apps non installées ouvrent leur fiche.
    Le menu de la zone de notification liste aussi « Lancer <app> ».
- **Conséquence** : M4–M5 réutilisent `InstalledAppsService` pour relire la version après une
  installation, une mise à jour ou une réparation (ADR-004), et pour attendre la disparition de
  la clé après une désinstallation.

## ADR-021 — Téléchargement et installation (M4)

- **Statut** : Accepté (M4). Précise la section 7 du brief et ADR-004.
- **File d'opérations** : une seule opération à la fois, téléchargement **et** installation
  compris (un installeur NSIS prend de toute façon un verrou global par app). La file vit en
  mémoire dans le processus principal (`InstallManager`) ; seul l'historique est persisté.
- **Écart au brief (§5.3)** : pas de table `downloads`. Les téléchargements sont purgés au
  démarrage (brief) : une table qui décrirait des fichiers effacés n'aurait rien à restaurer.
  `install_history` (migration 2, additive) porte le journal ; la table `downloads` pourra
  arriver plus tard si une reprise après redémarrage du Hub devient utile.
- **Dossier de téléchargement** : `%LOCALAPPDATA%\Nebula Hub\downloads` (local, jamais itinérant ;
  le brief disait `Nebula Store`, renommé par ADR-013). Vidé au démarrage. Un installeur est
  supprimé après une installation réussie ; après un échec de l'installeur, il est gardé pour
  « Réessayer » pendant la session et **vérifié à nouveau** (taille + SHA-512) avant d'être relancé.
- **Téléchargement** (`src/electron/net/download.ts`) : flux vers un fichier `.part`, chaque saut
  de redirection vérifié contre la liste blanche avant la connexion (R05), jamais au-delà de la
  taille de `latest.yml`, `Content-Length` contrôlé dès l'en-tête. **Reprise** par `Range` si le
  serveur répond `206` avec le bon `Content-Range` ; sinon le fichier repart de zéro (une fois).
  Une coupure réseau ou un serveur muet (30 s) garde le `.part` ; une taille ou une empreinte
  fausse le supprime (R02). Vérifié en réel : coupure à 40 %, reprise via `Range` sur le CDN des
  releases GitHub, SHA-512 conforme au `latest.yml` de la release.
- **Installation** : arguments d'ADR-004 (`/S`, puis `/D=<dossier>` en dernier si l'utilisateur a
  choisi un dossier ; `--updated /S` pour M5) calculés par `shared/installer-args.ts`, qui refuse
  `--delete-app-data` et tout dossier douteux (relatif, UNC, guillemets, `..`, caractères
  interdits). `spawn` avec tableau d'arguments, sans shell (R11).
- **Délai** : 10 minutes. Passé ce délai, le Hub arrête d'attendre et le dit, mais **ne tue pas**
  l'installeur (R08) : un installeur interrompu laisserait une app cassée.
- **Le registre fait foi** (ADR-004) : après l'installeur, quel que soit son code de sortie, le Hub
  relance la détection ; l'opération réussit seulement si la version attendue est installée et
  son exécutable présent. Sinon : code de sortie, délai, app introuvable ou autre version.
- **App ouverte** : si l'exécutable tourne au moment d'installer, l'opération passe en « En
  attente de fermeture » et attend que l'utilisateur la ferme (annulable). Le Hub ne ferme jamais
  l'app (R08) ; la fermeture propre via Link viendra en M6–M8.
- **Machine à états** (`shared/install-state.ts`) : la table du brief, plus deux précisions :
  pas d'annulation pendant `installing` et `verifying-install` (on n'interrompt pas un
  installeur), et `update-available → installed` quand l'updater propre de l'app a fait la mise
  à jour. `failed` et `cancelled` reviennent à la phase de repos donnée par la détection.
- **Dossier d'installation** (réglage) : un dossier de base choisi par l'utilisateur ; chaque app
  va dans `<base>\<productName>`. Les apps déjà installées ne bougent pas (une mise à jour ne
  passe jamais `/D`).
- **SmartScreen** : une ligne sur la fiche, à côté du bouton « Installer », jusqu'à la première
  installation réussie. Les installeurs lancés par le Hub n'ont pas la « marque du Web » et ne
  déclenchent normalement pas SmartScreen ; la ligne reste vraie et prévient la question.
- **Journal** : export JSON (opérations seulement, sans donnée des apps) à l'endroit choisi par
  l'utilisateur, via la boîte de dialogue de Windows.
- **Tests** : serveur HTTP local qui se comporte mal à la demande (taille, empreinte, redirection
  hors liste blanche, coupure puis reprise, `Range` ignoré ou faux, serveur muet, annulation) ;
  `InstallManager` avec faux téléchargeur, faux installeur et vrai processus Node faisant office
  d'installeur (arguments transmis tels quels, code de sortie, délai sans arrêt du processus).

## ADR-022 — Mises à jour, réparation, désinstallation et protection des données (M5)

- **Statut** : Accepté (M5). Amende ADR-021 (machine à états) ; applique ADR-004 et la section 7.6.
- **Machine à états** : trois phases s'ajoutent à celles du brief. `backing-up` (l'app écrit sa
  sauvegarde), `backup-failed` (l'opération attend la décision de l'utilisateur) et `removing` (le
  désinstallateur tourne, la clé de registre doit disparaître). `repairing` et `uninstalling`
  restent les phases d'entrée d'une réparation et d'une désinstallation. Pas d'annulation pendant
  `installing`, `verifying-install` et `removing`. Table complète et testée sur chaque paire de
  phases dans `src/shared/install-state.ts`.
- **Confirmation (R04)** : obligatoire pour une réparation, une désinstallation, et la mise à jour
  d'une app qui déclare `preOperationBackup` (Finterest). Le processus principal refuse
  l'opération sans le `oui` explicite (`confirmation-required`). L'écran dit ce qui arrive aux
  données (`dataNotice` du catalogue), affiche **le chemin exact de la sauvegarde** et prévient si
  l'app est ouverte. Le chemin affiché est celui utilisé (plan conservé 15 min).
- **Sauvegarde (section 7.6)** : après la fermeture de l'app, le Hub lance
  `"<exe>" --backup-before-uninstall=<Documents>\Nebula Finterest\finterest-store-backup-<AAAA-MM-JJ_HH-mm-ss>.json`.
  Le nom est horodaté : contrairement à celui de `installer.nsh`, il n'est jamais écrasé. Finterest
  avale toutes ses erreurs et sort avec 0 : le Hub vérifie donc le **fichier**. Il doit être
  présent, faire au plus 50 Mo, et être du JSON `app: 'Finterest'`, `version: 1`, `exportedAt`, avec
  `accounts[]` de `{ name, snapshot }`. Le Hub ne lit que cette forme et compte les comptes ; il ne
  garde, n'affiche ni n'envoie rien du contenu (R07). Une sauvegarde sans compte est valide (rien à
  perdre) ; le nombre de comptes est affiché.
- **Sauvegarde en échec** : l'opération s'arrête en `backup-failed` sans rien modifier.
  L'utilisateur annule, ou continue après une **seconde confirmation** (bouton « danger »). Une
  installation incomplète (exécutable absent) ne peut pas se sauvegarder : même règle.
- **Fermeture de l'app (R08)** : jamais forcée. Le Hub attend. Le bouton « Fermer <app> » envoie
  **une seule** demande polie, `taskkill /IM <exe>` sans `/F` : c'est le même message que le bouton
  de fermeture de la fenêtre. Si l'app reste dans sa zone de notification, l'utilisateur la ferme
  lui-même. La fermeture via Link viendra en M6–M8.
- **Relecture après fermeture (ADR-004)** : si l'updater intégré de l'app a déjà installé la mise
  à jour en quittant, l'opération se termine sans installeur (« s'est mise à jour elle-même »).
  Après un installeur de mise à jour ou de réparation, le registre est relu jusqu'à 5 fois à 3 s
  d'intervalle, le temps que l'ancien désinstallateur se termine.
- **Réparation** : seulement quand la version installée est celle publiée ; sinon le Hub propose
  « Mettre à jour » (`repair-unavailable`). L'installeur est retéléchargé et vérifié (SHA-512),
  puis lancé avec `--updated /S`, exactement comme une mise à jour.
- **Désinstallation** : le Hub lance `QuietUninstallString`, ou à défaut `UninstallString` + `/S`.
  La commande est découpée sans shell. L'exécutable doit être un `.exe` absolu, dans le dossier de
  l'app, et les arguments de simples commutateurs ; `--delete-app-data` n'est jamais passé. Le
  Hub attend ensuite que la clé de registre disparaisse (3 min au plus). Pour Finterest, c'est son
  propre désinstallateur qui supprime `%APPDATA%\Finterest` (`deleteAppDataOnUninstall`) : le
  `dataNotice` le dit, d'où la sauvegarde. L'archivage des consentements Link ne s'applique
  qu'à partir de M6.
- **Mises à jour automatiques** : par app, désactivées par défaut (`settings.autoUpdate`). Les
  activer pour une app qui se sauvegarde demande une confirmation, une fois. Le Hub les lance 5 s
  après la stabilisation du catalogue et de la détection, et seulement pour une app fermée. Il
  n'attend jamais l'utilisateur : si l'app est ouverte pendant l'opération ou si la sauvegarde
  échoue, l'opération échoue, et cette version n'est plus retentée automatiquement pendant la
  session.
- **« Tout mettre à jour »** : une seule confirmation, qui liste les apps et leurs sauvegardes ;
  les mises à jour passent ensuite une à une.
- **Zone de notification** : le nombre de mises à jour s'affiche dans l'infobulle. Une entrée
  « Mises à jour disponibles (n) » ouvre « Mes apps », et une autre lance « Rechercher des mises
  à jour ».
- **Écart au brief (§9.8, « le badge indique le nombre de mises à jour »)** : Electron ne permet
  pas de surimpression sur l'icône de zone de notification sous Windows. Le nombre passe donc par
  l'infobulle et le menu.
- **Recettes [CRITIQUE]** : automatisées dans `scripts/sandbox/m5.mjs`
  (`scripts/sandbox.ps1 -Recipe m5`). Le script installe Finterest 0.1.35 (vérifié contre son
  `latest.yml`) et bloque son réseau, pour que la mise à jour testée soit celle du Hub. Il crée
  deux comptes avec des données par l'interface de Finterest, puis lance (a) la mise à jour,
  (b) la réparation et (c) la désinstallation, suivie de la réinstallation et de l'import compte
  par compte. Après chaque étape, il relit les données par Finterest elle-même.

## ADR-023 — Validation de la spécification Nebula Link (M6)

- **Statut** : Accepté (2026-10-01, réponses à la spécification `docs/NEBULA_LINK.md`).
- **Décisions** :
  - Renommages `pomodoro.*` → `clock.*` et `nebula.store.present` → `nebula.hub.present` acceptés.
  - Consentement **non bloquant** : la première demande d'une donnée privée reçoit
    `consent-required`, et la question est posée dans le Hub.
  - **Notifications privées gardées** 30 jours comme les publiques (amende la proposition « en
    mémoire seulement »). L'historique, entier ou celui d'une app, s'efface dans Réglages → Avancé
    (M7, avec le centre d'activité). Les valeurs des widgets (dont le reste à vivre de Finterest)
    restent jamais écrites sur disque, comme l'exige le brief.
  - **Pas de pause globale de Link.** Écart au brief (§ 8.5 « Tout couper », § 9.6 « bouton pause »,
    § 9.8 tray) : jugée inutile, puisque chaque intégration se coupe en refusant sa paire. Le code
    d'erreur `-32008` reste réservé.
  - Authentification mutuelle par HMAC-SHA256 (le jeton ne circule jamais) et vérification du
    manifeste de l'app installée : retenues.
  - Propositions « hors V1 » du brief (recherche globale, profil partagé, actualité économique →
    simulateur) : non implémentées.
- **Recettes Windows Sandbox mises de côté** (même date, à la demande de l'utilisateur) : la
  Sandbox perd sa connexion sur la machine de développement. Le kit `scripts/sandbox/` reste
  disponible ; les trois tests [CRITIQUE] de la section 7.6 et la recette M4 ne sont **pas
  exécutés**, et ce risque est connu et accepté. Les comportements restent couverts par les tests
  automatiques.

## ADR-024 — Nebula Link : mise en œuvre (M6)

- **Statut** : Accepté (M6). Applique `docs/NEBULA_LINK.md` (ADR-023) ; précisions au § 16 de la
  spécification.
- **Paquet `@nebula/link`** (`packages/nebula-link`) : le protocole (framing NDJSON, JSON-RPC,
  preuves HMAC, fichier de session), les manifestes, les schémas, les liens profonds et le client.
  Le Hub l'utilise depuis ses sources (alias, comme `@nebula/design`) : **le serveur et le SDK
  partagent exactement le même code de validation**. Construit par tsup en CJS (`.cjs`), ESM
  (`.mjs`) et types, sans aucune dépendance (modules Node seulement). Vérifié en l'installant
  depuis son archive dans un projet CommonJS vierge.
- **Distribution** (ADR-008) : `npm run link:pack` produit `install/link/nebula-link-<v>.tgz`. Le
  workflow `link-release.yml` publie un tag `link-v<v>` en release **non marquée « latest »**,
  parce que le Hub lit sa propre dernière release (source du catalogue, mises à jour). Les tags
  `link-v*` ne sont pas du semver : le sélecteur de versions du Hub les ignore déjà, et un test
  le verrouille.
- **Serveur** (`src/electron/link/`) : `link-server.ts` (pipe, poignée de main, routage, limites),
  `link-store.ts` (consentements archivés à la désinstallation, journal écrit par lots de 5 s car
  chaque écriture de `store.sqlite` réécrit le fichier entier, notifications 30 jours),
  `session.ts` (pipe nommé d'après le SID, jeton, lecture du manifeste dans `resources\` du
  dossier d'installation), `link-hub.ts` (assemblage, vue de l'écran Intégrations).
- **Pipe pris** (autre Hub de l'utilisateur, ou squat) : Link passe « indisponible », le reste du
  Hub fonctionne.
- **Lancement avec intent** : le lanceur (ADR-020) accepte un seul argument, toujours construit
  par le Hub (`--nebula-intent=<base64url>`).
- **Protocole `nebula://`** : enregistré par la version installée seulement
  (`setAsDefaultProtocolClient`) ; liens reçus au démarrage et par `second-instance`.
- **Écran Intégrations** : demandes en attente (Autoriser / Refuser), matrice app × capacité avec
  interrupteur par paire, retour au réglage par défaut, « Tout refuser pour <app> », date du
  dernier échange. Indicateur Link réel dans la barre latérale et sur l'accueil.
- **Reporté à M7** : effacement de l'historique des notifications dans Réglages → Avancé (le
  stockage et la suppression sont déjà dans `LinkStore`), widgets de l'accueil, centre
  d'activité, notifications Windows.
- **Banc d'essai** (`tests/link-harness/`) : Hub en mode test, deux fausses apps sur le vrai SDK,
  un client brut pour les messages invalides. Il est joué par Jest et par `npm run link:demo`,
  sur de vrais named pipes.

## ADR-025 — Le Hub : accueil, widgets, centre d'activité, premier lancement (M7)

- **Statut** : Accepté (M7). Complète ADR-023 et ADR-024.
- **Widgets (I3)** : le Hub lit chaque capacité `widget` des apps installées et admises, en tant que
  consommateur `nebula.hub`, sous les règles de consentement habituelles (`WidgetBoard`,
  `src/electron/link/widgets.ts`). Lecture à l'arrivée de l'app, puis à l'intervalle déclaré (30 s
  au minimum, 5 min par défaut). Une carte privée indécise ou refusée n'est plus relue tant que
  l'utilisateur ne change pas d'avis : le journal ne se remplit pas de refus. Les valeurs restent
  **en mémoire** ; seul l'ordre des cartes est enregistré (`widgetOrder`, identifiants de
  capacités). Fenêtre cachée dans la zone de notification : plus aucune lecture, et les valeurs
  privées sont oubliées. À l'écran, une valeur privée est **masquée par défaut** et se masque à
  nouveau dès qu'elle change.
- **Réorganisation** : glisser-déposer, et deux boutons « vers le début / vers la fin » par carte
  pour le clavier et les lecteurs d'écran, avec une annonce de la nouvelle position.
- **Centre d'activité (I5)** : panneau latéral de l'accueil, 30 jours d'historique (notifications des
  apps et fin des opérations du Hub, enregistrées sous l'identifiant `nebula.hub`). L'état « lu »
  est une date (`activitySeenAt`) dans les réglages, pas une colonne : pas de migration. Le texte
  d'une notification privée est masqué jusqu'au clic.
- **Notifications Windows** : relais du centre d'activité quand le Hub **n'est pas au premier
  plan**, désactivable globalement et app par app (`windowsNotifications`, `mutedApps`).
  **[CRITIQUE]** Une notification privée n'envoie à Windows que le nom de l'app et une phrase
  neutre : Windows peut l'afficher sur l'écran de verrouillage et la garder dans son historique,
  que le Hub ne contrôle pas. Une demande de consentement reçue pendant que le Hub est caché est
  aussi signalée à Windows.
- **Premier lancement** : trois écrans (le Hub ; les apps détectées ; démarrage avec Windows et
  notifications Windows en oui/non expliqués), passables à tout moment (bouton ou Échap), rejouables
  dans Réglages → Avancé. **Écart au brief** : le troisième écran ne propose pas « Link oui/non »,
  car il n'y a plus de pause globale de Link (ADR-023) ; il explique le consentement par paire.
- **Réglages** : « Démarrer avec Windows » (seule la version installée s'inscrit), notifications
  (global, par app), Avancé (effacer tout l'historique ou celui d'une app, après confirmation ;
  revoir l'accueil).
- **Zone de notification** : entrée « Centre d'activité (n non lues) » qui ouvre l'accueil.
- **Reporté à M8** : I4 (pause lecture Clock → News), qui dépend des capacités réelles des apps.

## ADR-026 — Données des apps sans blocage, copie des sauvegardes, installeur, mise en page large

- **Statut** : Accepté (retours de l'utilisateur du 2026-10-02). **Amende ADR-022** sur un point :
  la sauvegarde avant opération n'est plus obligatoire.
- **Sauvegarder d'abord, par défaut** : la confirmation d'une mise à jour, d'une réparation ou d'une
  désinstallation d'une app qui se sauvegarde (Finterest) porte une case « Sauvegarder mes données
  avant (recommandé) », cochée. La décocher affiche ce qui arrive aux données (désinstallation :
  supprimées définitivement avec l'app ; sinon : plus de filet si l'opération tourne mal), invite à
  exporter ailleurs, renomme le bouton (« Désinstaller sans sauvegarde ») et passe le dialogue en
  ton « danger ». Le processus principal n'accepte ce choix qu'avec la confirmation, jamais pour
  une mise à jour automatique. **[CRITIQUE]** R04 reste respectée : rien ne se passe sans une
  confirmation qui dit ce qu'il advient des données. But : une app ne reste plus bloquée entre une
  désinstallation et une réinstallation à cause d'une sauvegarde que l'utilisateur ne veut pas.
  L'ancien chemin (sauvegarde ratée → seconde confirmation) est inchangé.
- **Dossier racine et copie** : chaque sauvegarde reste dans `Documents\<app>` (la référence, lue
  en premier par l'app). Réglages → Sauvegardes permet de choisir un dossier qui reçoit **une copie**
  (`<dossier>\<app>\<même nom de fichier>`). Une copie ratée ne bloque rien ; elle est signalée.
  Le Hub copie le fichier octet pour octet sans le lire au-delà de la vérification de forme déjà
  admise (R07, ADR-022).
- **Exporter mes données** (fiche de l'app) : l'app écrit sa sauvegarde maintenant, hors de toute
  opération, avec la même vérification et la même copie. Refusé pendant une opération sur l'app.
- **Importer une sauvegarde** : l'utilisateur choisit un fichier (le sélecteur s'ouvre sur le
  dossier racine) ; le Hub vérifie sa forme, puis : si le catalogue déclare `importArgument`
  (`--import-backup=`, champ facultatif ajouté au schéma de `preOperationBackup`), l'app s'ouvre sur
  son import ; sinon le Hub ouvre l'app, montre le fichier dans l'Explorateur et dit où cliquer.
  L'import se confirme toujours dans l'app.
- **Télécharger l'installeur** (fiche de l'app) : même téléchargement et mêmes contrôles qu'une
  installation (liste blanche, taille, SHA-512 de la release, R02), puis copie du fichier vérifié
  dans Téléchargements, sans jamais écraser un fichier existant. Rien n'est exécuté. Pour installer
  l'app seule, plus tard ou ailleurs.
- **Installer en un clic** depuis une carte (Découvrir, lanceur de l'accueil) pour une app pas
  encore installée.
- **Mise en page** : le contenu de chaque écran est une colonne centrée dont la largeur maximale
  grandit avec l'écran (1480 px, 1680 px dès 1900 px, 1960 px dès 2400 px, 2280 px dès 3000 px) ;
  au-delà de 2400 px de large, la taille de base du texte passe à 17 puis 18 px. Cartes de synthèse
  en grille fluide, tuiles du lanceur qui s'élargissent. Vérifié sans débordement de 760 à 3440 px.
- **Prompts pour les apps** : `docs/PROMPT_APPS.md` (mise à jour, audit, Nebula Link, dossier
  racine + copie, sauvegarde sans interface, `--import-backup=`, publication), à coller app par app.
  Remplace la conduite de M8 par la session du Hub ; R01 reste vrai pour cette session.
- **À valider — apps « dans le Hub »** : trois voies étudiées.
  1. *Fenêtre ancrée* (recommandée) : l'app garde son processus et sa fenêtre ; en mode « Hub »,
     elle s'ouvre sans cadre, posée sur la zone de contenu du Hub, et suit ses déplacements,
     redimensionnements et sa réduction (événement Link `nebula.hub.dock` avec la zone, en
     coordonnées écran). La barre latérale du Hub reste visible : on passe d'une app à l'autre
     comme des onglets. En mode autonome, rien ne change. Demande un amendement de la
     spécification Link et l'adoption par chaque app.
  2. *Onglets internes* (le Hub charge l'interface des apps dans sa propre fenêtre) : écartée, le
     Hub exécuterait le code et lirait les données des apps (R07, R10), sans leur processus
     principal.
  3. *Fenêtre réparentée* (SetParent Windows) : écartée, fragile (DPI, focus, raccourcis) et
     demande du code natif.

## ADR-027 — Apps « dans le Hub » par fenêtre ancrée

- **Statut** : Accepté (l'utilisateur a validé la voie recommandée par ADR-026 le 2026-10-02).
  Amende `docs/NEBULA_LINK.md` (nouveau § 17, schéma `DockV1`).
- **Décision** : une app ouverte « dans le Hub » garde son processus et sa fenêtre ; sa fenêtre,
  sans cadre, se pose exactement sur la zone de contenu du Hub et la suit. Le Hub lui envoie, à
  elle seule, l'événement Link `nebula.hub.dock` (zone en DIP écran, visible ou non, passage au
  premier plan, ou retour à la fenêtre normale).
- **Pourquoi** : c'est la seule voie qui garde R07 (le Hub ne lit ni n'exécute le code ou les
  données d'une app) et R10 (pas de contenu étranger dans la fenêtre durcie du Hub), sans code
  natif. Les onglets internes et le réparentage Windows sont écartés (ADR-026).
- **Hub** : `src/shared/dock.ts` (géométrie et messages, purs), `src/electron/link/dock.ts`
  (`DockController` : ouverture, lancement si besoin, une app visible à la fois, suivi de la
  fenêtre, détachement, tout relâcher en quittant), `LinkServer.sendTo` / `subscribersOf`, écran
  `docked` (barre fine + zone mesurée par `ResizeObserver`), réglage `openInHub` par app.
- **Limites connues** : l'empilement entre deux processus n'est pas garanti par Windows ; le Hub
  demande à l'app de repasser devant à chaque fois qu'il reprend le focus (`raise`). Une app non
  compatible (sans `nebula.hub.dock` dans son manifeste) n'a pas l'option ; une app compatible qui
  ne répond pas reste dans sa fenêtre, sans blocage.
- **Adoption** : chaque app, avec le prompt `docs/PROMPT_APPS.md` (section « Mode Hub »).

## ADR-028 — Barre latérale flottante, icônes de navigation, harmonisation visuelle de la famille

- **Statut** : Accepté (retour de l'utilisateur du 2026-10-02 : menus de la barre latérale pas
  assez espacés, icônes à rendre spécifiques et belles, barre plus moderne ; toutes les apps
  doivent se ressembler et suivre la DA). Complète ADR-014 et ADR-026.
- **Cause du défaut** : la réinitialisation `button.plain` (installed.css, M4) est plus
  spécifique que `.nav-button` ; elle annulait marge intérieure, hauteur et survols de toutes
  les entrées de la barre latérale (20 px de haut au lieu de 44).
- **Décision** :
  - la barre latérale devient un panneau flottant (décalé de 12 px des bords, rayon
    `--radius-lg`, flou d'arrière-plan) ;
  - les sections sont rangées en groupes titrés (« Votre espace », « Gestion »), et le lanceur
    reste en dessous ;
  - Réglages, une carte d'état Nebula Link et le pied local sont épinglés en bas ;
  - les entrées font 44 px, avec l'icône dans une tuile ; l'état actif suit la recette de la
    DA, plus une barre d'accent ;
  - le rail compact (< 1100 px) et la barre du haut (< 720 px) sont conservés ;
  - tous les sélecteurs sont préfixés par `.sidebar` (`styles/sidebar.css`).
- **Icônes** : six glyphes de navigation dans `@nebula/design` (`navHome`, `compass`, `apps`,
  `downloadTray`, `orbit`, `gear`). Ils suivent le même style (24 px, trait 1.8, une forme
  duotone) et sont partagés avec les apps.
- **Famille** : `docs/PROMPT_DESIGN.md` est le prompt qui aligne Finterest, Clock et News sur la
  DA. Le Hub y est la référence vivante : même coquille, même barre latérale, mêmes icônes et
  même modèle d'apparence (celui diffusé par Nebula Link), avec la migration des réglages
  existants.

## ADR-029 — Nebula Hub se met à jour lui-même

- **Statut** : Accepté (demande de l'utilisateur du 2026-10-02 : un bouton pour mettre à jour
  Nebula Hub). Amende ADR-022, qui réservait les mises à jour aux apps (`is-hub`).
- **Décision** : le Hub suit le chemin de toutes les mises à jour (ADR-021/022), appliqué à
  lui-même :
  1. il prend l'installeur de la release du Hub dans le catalogue signé (R03) ;
  2. il le télécharge depuis une source autorisée (R05) et le vérifie en taille et en SHA-512
     contre `latest.yml` (R02) ;
  3. après le « oui » de l'utilisateur, et une fois terminée toute opération d'app en cours, il
     lance cet installeur détaché avec `--updated /S --force-run`, puis se ferme ;
  4. l'installeur NSIS remplace le Hub et le relance.
- **Arguments** : ceux d'`electron-updater` (ADR-004). Les données sont conservées
  (`%APPDATA%\Nebula Hub`, `deleteAppDataOnUninstall: false`). Jamais `/D`, jamais
  `--delete-app-data`.
- **Où** :
  - dans la barre latérale, une carte au-dessus de la carte Nebula Link, seulement quand une
    version plus récente existe ;
  - dans Réglages, une section toujours présente : version installée, dernière version,
    « Rechercher une mise à jour », « Mettre à jour » ;
  - sur la ligne et la fiche de Nebula Hub dans « Mes apps ».
  Dans tous les cas, une confirmation dit ce qui va se passer.
- **Garde-fous** :
  - refus depuis une version de développement ou un dossier de données jetable (cela
    remplacerait le vrai Hub installé) ;
  - annulation possible tant que l'installeur n'est pas lancé ;
  - un fichier qui ne correspond pas est supprimé et rien n'est lancé ;
  - un échec laisse le Hub dans sa version actuelle.
- **Code** : `src/shared/hub-update.ts` (état, blocages, arguments, purs et testés),
  `src/electron/install/hub-updater.ts`, `launchDetached` (`installer-runner.ts`), canaux
  `hub-update:*`, composants `HubUpdateCard` / `HubUpdatePanel`.
- **Limite** : la première mise à jour vers 0.2.1 se fait encore à la main, car la 0.2.0 n'a
  pas ce bouton. Le chemin réel complet (installeur qui remplace le Hub en cours puis le
  relance) sera vérifié au passage 0.2.1 → version suivante.

## ADR-030 — « Quitter Nebula » ferme toute la famille

- **Statut** : Accepté (demande de l'utilisateur du 2026-10-03 : un bouton « Quitter Nebula » qui
  ferme tous les processus Nebula possibles). Précise R08.
- **Décision** : un bouton dans la barre latérale (sous Réglages) et une entrée du menu de la zone
  de notification ouvrent une confirmation. Celle-ci nomme les apps ouvertes et dit ce qui va se
  passer. Après le « oui » :
  1. chaque app de la famille en cours est invitée à se fermer (`taskkill /IM`, sans `/F` : comme
     sa croix), pour qu'elle enregistre ses données et se ferme d'elle-même ;
  2. le Hub attend jusqu'à 6 secondes ;
  3. celles qui tournent encore (une app réduite dans la zone de notification à la fermeture de sa
     fenêtre, comme Nebula Clock, ou une app bloquée) sont arrêtées avec leurs processus enfants
     (`taskkill /F /T /IM`) ;
  4. le Hub se ferme.
- **R08** : l'arrêt forcé n'a lieu qu'après cette confirmation explicite, et seulement après
  l'invitation polie. Seuls les exécutables du catalogue signé sont nommés, jamais celui du Hub,
  sans shell (R11). C'est refusé pendant une installation ou la mise à jour du Hub, qu'il ne faut
  pas couper.
- **Code** : `src/electron/apps/quit-nebula.ts` (testé), `SystemProbe.forceClose`, canaux
  `hub:quit-nebula` / `hub:quit-nebula-ask`, `trayQuitAll`.
- **Évolution possible** : une demande de fermeture par Nebula Link (événement que les apps
  écouteraient) éviterait l'arrêt forcé des apps réduites dans la zone de notification. Il faudrait
  pour cela une nouvelle version des apps.

## ADR-031 — Les thèmes de Nebula News sur l'accueil du Hub

- **Statut** : Accepté (prompt « thèmes de Nebula News » du 2026-10-03 ; réponses de l'utilisateur :
  « Tech du jour » remplace « À la une », et les thèmes destinés aux autres apps sont masqués par
  défaut). Complète ADR-025 (widgets de l'accueil).
- **Contexte** : News 0.4.0 suit trois thèmes, un par app de la famille, et publie un widget par
  thème en plus de « À la une ». Le Hub lisait tous les widgets des apps installées : quatre cartes
  News seraient apparues sur l'accueil.
- **Décision** :
  - l'accueil n'affiche par défaut que les widgets faits pour lui. « Tech du jour »
    (`news.tech.today`) y remplace « À la une » ;
  - `news.headlines.today`, `news.focus.today` (pour Clock) et `news.finance.today` (pour
    Finterest) sont masqués par défaut (`HOME_HIDDEN_BY_DEFAULT`) ;
  - le panneau « Widgets de l'accueil » d'Intégrations permet de tout afficher ou masquer
    (`settings.homeWidgets`, lu champ par champ). Il indique pour quelle app un widget est fait ;
  - un widget masqué n'a pas de carte et n'est jamais lu : aucun échange Link, rien au journal ;
  - les consentements ne changent pas : ce sont deux réglages distincts.
- **Durcissement** : un widget n'ouvre que son app. Un `deepLink` qui ne vise pas l'hôte du
  fournisseur (`nebula://news/…` pour `nebula.news`) est retiré de la carte. Le schéma `WidgetV1`
  reste vérifié par le serveur Link (longueurs, champs, pas de HTML interprété).
- **Catalogue** : nouvelles accroche et description de News, re-signé. L'entrée ne porte ni
  version (celle-ci vient de la release GitHub v0.4.0) ni manifeste (le Hub lit `nebula.app.json`
  dans l'app installée) : il n'y avait rien d'autre à recopier. Le manifeste réel de la 0.4.0 est
  une copie du banc d'essai (`tests/link-harness/apps/news/`), qui vérifie qu'il est accepté.

## ADR-032 — Mode Hub : remonter l'app sans droit de premier plan, et pleine largeur

- **Statut** : Accepté (retour de l'utilisateur du 2026-10-04 : « l'app affiche … s'affiche ici
  mais la page n'apparaît jamais ; quand je ferme le Hub de force, l'app s'ouvre et fonctionne »,
  avec tous les gestes ; « l'UI ne s'adapte pas à tout l'écran », dans le Hub comme dans les
  apps ; garder la barre latérale). Amende ADR-027 et docs/NEBULA_LINK.md § 17.
- **Diagnostic** : le journal Link du Hub installé montre que tous les messages
  `nebula.hub.dock` sont livrés (Finterest 269, Clock 29, News 24). La fenêtre ancrée existe, mais
  reste derrière le Hub : Windows refuse `moveTop` à un processus sans droit de premier plan,
  c'est-à-dire à l'app dès que le Hub est actif. Cela arrive notamment quand le Hub lance l'app,
  puis que l'app remplace sa fenêtre normale par la fenêtre ancrée et que Windows réactive le Hub.
- **Décision** :
  - côté app, chaque `raise`, et chaque passage de caché à visible, se fait en trois appels :
    `setAlwaysOnTop(true)`, `moveTop()`, `setAlwaysOnTop(false)`. Les apps l'adoptent avec
    `docs/PROMPT_DOCK_FIX.md` ;
  - côté Hub, `raise` est renvoyé 0,4 s, 1,5 s et 3,5 s après l'apparition de l'app, tant que le
    Hub garde le focus. Une perte de focus (`blur`) annule ces relances ;
  - la colonne de contenu du Hub n'a plus de largeur maximale : elle remplit l'espace à côté de
    la barre latérale, qui reste, et les grilles ajoutent des colonnes. ADR-026 prévoyait une
    colonne centrée ; elle est remplacée.

## ADR-033 — Apps visibles seulement une fois installées (Nebula Finance Enterprise)

- **Statut** : Accepté (demande de l'utilisateur du 2026-10-04 : « Nebula Finance Enterprise doit
  apparaître dans le Hub, mais seulement si elle est détectée sur le système »).
- **Décision** :
  - nouveau champ facultatif du catalogue : `"visibility": "installed-only"`. Une telle app
    n'apparaît nulle part dans le Hub (Découvrir, lanceur, accueil, Intégrations, premier
    lancement) tant qu'elle n'est pas détectée sur l'ordinateur. Une fois détectée, elle se
    comporte comme les autres : lancement, mode Hub et Nebula Link selon son manifeste ;
  - la détection elle-même ne change pas. Le processus principal connaît toujours l'app, sinon
    il ne pourrait pas la trouver ;
  - le filtre est appliqué une seule fois, dans le renderer (`visibleCatalog`).
- **Nebula Finance Enterprise** (`nebula.finance-enterprise`, bêta) :
  - son dépôt est privé : le Hub ne lit ni ses releases ni son installeur. Il ne l'installe pas
    et ne la met pas à jour ; elle se met à jour elle-même ;
  - `dataNotice` dit qu'une désinstallation supprime ses données
    (`deleteAppDataOnUninstall: true` dans son installeur). La confirmation de désinstallation
    (R04) l'affiche ;
  - `minHubVersion` 0.2.3 : un Hub plus ancien ignore le champ `visibility`. Il montrerait l'app
    avec la mention « demande une version plus récente du Hub », sans rien d'installable.

## ADR-034 — Nebula News, extension des autres apps

- **Statut** : Accepté (demande de l'utilisateur du 2026-10-04 : « lance Nebula News en
  arrière-plan systématiquement, rends-la ouvrable hors du Hub uniquement en standalone, fais
  apparaître les articles dans les apps où ils doivent être ; Nebula News doit être une extension
  des autres apps plus qu'une app à part entière »).
- **Constat** : les widgets de News n'existent que si News tourne. Dans le journal Link de
  l'utilisateur, la seule demande de Finterest est restée sans réponse (News fermée), et Clock
  n'avait jamais rien reçu.
- **Décision** :
  - nouveau champ de catalogue `extension: { backgroundArgument, minVersion }` (validé ;
    l'argument est un interrupteur `--…` et ne peut pas être `--delete…`). News le porte avec
    `--background` et 0.5.0 ;
  - le Hub garde les extensions en marche (`apps/extension-keeper.ts`, règle pure
    `shared/extensions.ts`) : il les démarre en arrière-plan quand il se lance, quand elles sont
    installées et si elles s'arrêtent (une app qui quitte Link déclenche une détection). Il ne
    le fait jamais pendant une opération sur l'app ni après « Quitter Nebula », au plus 3 fois
    en 10 minutes, et seulement à partir de `minVersion`, car une version plus ancienne
    ouvrirait sa fenêtre. Un réglage permet de couper ce maintien (« Garder Nebula News active
    en arrière-plan », activé par défaut) ;
  - une extension s'ouvre toujours dans le Hub : lanceur, tuiles, fiche, menu de la zone de
    notification. Le bouton « Détacher » est absent. Quand le mode Hub lance une extension,
    il la démarre en arrière-plan ;
  - nouvelle route du Hub `/docked?id=` (`nebula://hub/docked`), qu'une app ne peut demander
    que pour elle-même : News 0.5.0 l'utilise pour toute demande de fenêtre quand le Hub est
    connecté ;
  - côté News (0.5.0) : pas de fenêtre en arrière-plan. News quitte si le Hub disparaît alors
    qu'elle a été lancée en arrière-plan, et revient en arrière-plan quand le Hub la relâche.
    Sans le Hub, ou avec un Hub plus ancien qui refuse la route, c'est une app normale.
- **Conséquence** : les cartes d'articles de l'accueil, de Finterest et de Clock ont toujours une
  source tant que le Hub tourne. News consomme de la mémoire en permanence, comme l'utilisateur
  l'a accepté.

## ADR-035 — Packs d'apparence partagés par une app installée

- **Statut** : Accepté (demande de l'utilisateur du 2026-10-05).
- **Contexte** : une app de la famille doit pouvoir apporter ses propres thèmes, noms affichés et
  logos à toute la famille, seulement tant qu'elle est installée, en standalone comme avec le Hub.
- **Décision** :
  - un format de données strict, `AppearancePack` (`@nebula/link` 1.1.0, NEBULA_LINK.md § 18),
    déposé par l'app propriétaire dans `%LOCALAPPDATA%\Nebula Link\appearance\` et lu par les
    autres apps et le Hub ;
  - aucune logique ni aucun contenu propre à un pack dans le Hub ou dans les apps : seulement le
    mécanisme générique (lecture, validation, application par-dessus un thème intégré, noms et
    logos d'affichage) ;
  - dans le Hub : réglage `packTheme` séparé du thème intégré (repli automatique),
    `AppearancePacks` relit le dossier à chaque détection, les thèmes des packs apparaissent après
    les thèmes intégrés dans Réglages, et la diffusion I1 transmet l'identifiant du thème du pack.
- **Sécurité** : données seulement (jetons CSS filtrés, SVG affichés comme images), propriétaire
  vérifié, aucune lecture réseau. Le Hub ne lit toujours aucune donnée d'une autre app (R07) : le
  pack est un fichier que l'app publie elle-même pour les autres.

## ADR-036 — Un onglet « Nebula News » dans chaque app

- **Statut** : Accepté (demande de l'utilisateur du 2026-10-09 : « j'aimerais vraiment que l'app ait son intégration dans chaque app, un onglet "Nebula News" qui permet de voir les infos par app »). Prolonge ADR-034 (News, extension des autres apps).
- **Constat** : les widgets ne portent que trois articles (5 lignes au plus en `WidgetV1`), ce qui ne suffit pas pour lire l'actualité d'une app.
- **Décision** :
  - nouveau schéma `ArticlesV1` (SDK 1.2.0) : 20 articles au plus, titre, source, date, résumé facultatif et un lien `nebula://news/article?id=…` ; aucune URL, aucun HTML, aucune image ;
  - Nebula News 0.6.0 fournit une requête publique par thème : `news.finance.articles` (Finterest), `news.focus.articles` (Clock), `news.tech.articles` (Hub), et le lien profond `/article?id=` ;
  - chaque app a un onglet « Nebula News » qui affiche les articles de son thème ; un clic ouvre l'article dans Nebula News, donc dans le Hub (ADR-034) ;
  - dans le Hub, l'onglet n'apparaît que si Nebula News est installée ; il lit comme `nebula.hub`, comme les widgets, et ne garde que les liens vers Nebula News.
- **Ordre de publication** : le SDK 1.2.0 et le Hub 0.2.7 d'abord (le Hub doit connaître `ArticlesV1` pour accepter le manifeste de News 0.6.0), puis News 0.6.0, puis les apps.

## ADR-037 — Mise à jour automatique des extensions en arrière-plan

- **Statut** : Accepté (signalement de l'utilisateur du 2026-10-10 : l'onglet « Nebula News » restait vide).
- **Constat** : Nebula News était restée en 0.5.0 alors que la 0.6.0 était publiée et sa mise à jour automatique activée. La mise à jour automatique saute toute app ouverte (brief § 7.5), or depuis ADR-034 le Hub garde News ouverte en arrière-plan en permanence : elle n'était donc jamais mise à jour.
- **Décision** : une extension qui tourne **seulement en arrière-plan** (lancée par le Hub, sans fenêtre, pas affichée dans le Hub) compte comme fermée pour sa mise à jour automatique. Le Hub l'arrête (`taskkill /F /T`, elle n'a pas de fenêtre à qui demander poliment), attend qu'elle soit sortie (10 s au plus), installe, puis la relance en arrière-plan (`ExtensionKeeper`, bloqué pendant l'opération).
- **Limites** : jamais si l'utilisateur l'a ouverte dans le Hub ; jamais pour une app qui n'est pas une extension ; si elle ne s'arrête pas, l'essai échoue comme une app ouverte et sera repris. La mise à jour automatique reste un choix de l'utilisateur par app (R08 : ce choix vaut accord pour fermer l'instance d'arrière-plan qu'il ne voit pas).
