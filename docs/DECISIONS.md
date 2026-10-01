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
