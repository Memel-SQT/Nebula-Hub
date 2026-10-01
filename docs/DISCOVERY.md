# Nebula Store — Découverte (M0)

> Jalon M0, lecture seule. Établi le 2026-10-01 en lisant le code des dépôts frères, leurs
> templates de build et l'état réel de la machine de développement (registre, dossiers de
> données, releases GitHub).
> **Le code fait foi** : chaque écart avec le brief est signalé par « ⚠ Écart ».
> Les dépôts de la famille sont **publics** : ce document ne contient aucun chemin
> personnel, aucun identifiant de compte, aucune donnée utilisateur.

---

## 1. Ce que j'ai trouvé dans le dossier de travail

| Dossier local | Dépôt | Ce que c'est |
|---|---|---|
| `Nebula-Finterest\` | `Memel-SQT/Nebula-Finterest` | Budget local, Electron |
| `Nebula-News\` | `Memel-SQT/Nebula-News` | Briefing d'actualité, Next.js + Electron |
| `nebula-clock\` | `Memel-SQT/nebula-clock` | **Le Pomodoro** ⚠ Écart : le brief l'appelle « Nebula Pomodoro », le produit s'appelle **Nebula Clock** |
| `nebula-design-system\` | `Memel-SQT/nebula-design-system` (**privé**) | **Le dépôt de référence de la DA** (tokens, logos, 16 composants React, portages, fiche de DA) |
| `Repo-Nebula-Context\` | `Memel-SQT/Repo-Nebula-Context` | Hub de documentation figée de la famille (architecture, ADR, anti-patterns de chaque dépôt), généré le 2026-09-03 |
| — | `Memel-SQT/Nebula` | ⚠ Écart : **n'existe plus**. Le dépôt Python a été supprimé volontairement ; son `theme.css` a été copié dans `nebula-design-system/tokens/theme.css` avant suppression. |
| — | `NEBULA_DESIGN.md` | ⚠ Écart : absent de `Nebula-Finterest\` (gitignoré, jamais présent sur cette machine). Son contenu vit désormais dans `nebula-design-system/docs/direction-artistique.md`. |

Les quatre dépôts ont le schéma de remotes attendu : `origin` (fetch GitHub, push GitHub +
`git.rodriguesnoa.fr/noa/<repo>.git`) et `gitea`.

---

## 2. Les applications, une par une

### 2.1 Nebula Finterest

| Champ | Valeur relevée | Source |
|---|---|---|
| Version du code | **0.1.36** | `package.json` |
| Version publiée | **v0.1.36**, publiée le 2026-10-01 09:12 UTC | API GitHub |
| Version installée sur la machine de dev | ⚠ **0.1.35** (la 0.1.36 n'y est pas encore) | registre |
| `name` (package) | `finterest` (**figé volontairement**) | `package.json` |
| `appId` | `com.finterest.desktop` | `build.appId` |
| `productName` | `Nebula Finterest` | `build.productName` |
| Exécutable | `Nebula Finterest.exe` | dérivé de `productName` |
| Installeur | NSIS **one-click** (défaut), par utilisateur, sans choix de dossier | `build.nsis` (pas de `oneClick`/`perMachine`) |
| Dossier d'installation | `%LOCALAPPDATA%\Programs\finterest` (nom de paquet assaini, car one-click) | registre + `targetUtil.getWindowsInstallationDirName` |
| `artifactName` | `Nebula-Finterest-Setup-${version}.${ext}` (sans espace, volontairement : session #37) | `build.artifactName` |
| Publication | GitHub Releases `Memel-SQT/Nebula-Finterest`, `latest.yml` + `.exe` + `.blockmap` | `build.publish`, release v0.1.36 |
| Auto-update intégré | `electron-updater` 6.8.9, `autoDownload = true`, `checkForUpdatesAndNotify()` au démarrage, `autoInstallOnAppQuit` par défaut (**true**) | `src/electron/main.ts` |
| Verrou d'instance unique | Oui. **Le mode `--backup-before-uninstall` en est exempté** | `main.ts` |
| Données | `%APPDATA%\Finterest\` (épinglé par `app.setPath`) : `accounts.json` + `finterest-<id>.sqlite` par compte, avatars | `main.ts`, `accounts.ts` |
| Suppression des données | `nsis.deleteAppDataOnUninstall: true` → supprime `%APPDATA%\finterest` (= `Finterest`, insensible à la casse) **sauf si `--updated`** | `uninstaller.nsh` |
| Sauvegarde avant désinstallation | `build/installer.nsh` → `customUnInit` lance `"$INSTDIR\Nebula Finterest.exe" --backup-before-uninstall="<Documents>\Nebula Finterest\finterest-uninstall-backup.json"` | `installer.nsh` |
| Stack | Electron 32, electron-builder 24.13, Vite 6, TS 5.7, React 18.3, sql.js 1.11, Jest 29, ESLint 9 | `package.json` |
| Tests | 41 tests, 5 suites (session #44) | `DEV_CHANGES.md` |
| CI | `build-installers.yml`, Windows seul, Node 20, `npm run dist:win` | `.github/workflows` |

**Ce qu'il faut savoir sur la sauvegarde `--backup-before-uninstall`** (lu dans `main.ts` et
`accounts.ts`) :

- Elle **avale toutes les erreurs** et quitte avec le code 0 (`runPreUninstallBackup`, « never block
  the uninstall »). **Le code de sortie ne prouve rien** : le Store doit vérifier le fichier.
- Le fichier a la forme `{ app: 'Finterest', version: 1, exportedAt, accounts: [{ name, snapshot }] }`.
  Il ne contient **ni les PIN, ni les avatars**.
- Sans aucun compte, elle écrit un fichier valide avec `accounts: []` : « non vide » ne suffit pas.
- À la réimportation, `extractBackupSnapshot` prend **le compte dont le nom correspond** au compte
  ouvert (ou le seul compte s'il n'y en a qu'un). Restaurer N comptes = recréer N profils de même
  nom puis importer N fois. Le test [CRITIQUE] (c) de la section 7.6 doit être formulé ainsi.
- La sauvegarde écrite par `installer.nsh` a un **nom fixe** : elle est écrasée à chaque mise à jour.

### 2.2 Nebula Clock (le « Pomodoro » du brief)

| Champ | Valeur relevée | Source |
|---|---|---|
| Version | ⚠ **1.1.3** (le brief dit 1.0.0) | `package.json`, release `v1.1.3` (2026-09-03) |
| Monorepo | pnpm 11.7.0 : `apps/web` (Vite 5, sert aussi de renderer), `apps/desktop` (Electron), `packages/core`, `packages/ui` | `pnpm-workspace.yaml` |
| `name` (package desktop) | `@nebula-clock/desktop` | `apps/desktop/package.json` |
| `appId` | `clock.nebula.desktop` | `build.appId` |
| `productName` | `Nebula Clock` | `build.productName` |
| Exécutable | `Nebula Clock.exe` | registre |
| Installeur | NSIS **assisté** (`oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`) → la page « pour moi / pour tous » existe : **une installation machine (HKLM) est possible** | `build.nsis` |
| Dossier d'installation | `%LOCALAPPDATA%\Programs\Nebula Clock` | registre |
| `artifactName` (Windows) | `NebulaClock-Setup-${version}-${arch}.${ext}` → `NebulaClock-Setup-1.1.3-x64.exe`. ⚠ Le nom a changé à la 1.1.2 (`Nebula.Clock-Setup-…` avant) | `build.win.artifactName`, releases |
| Publication | GitHub Releases, `releaseType: release`, `latest.yml` (+ mac/linux) ; versionnée par semantic-release | `build.publish` |
| Auto-update intégré | `electron-updater` 6.3.9, `autoDownload = true`, `autoInstallOnAppQuit = true`, vérification 10 s après le démarrage puis toutes les 4 h, `disableWebInstaller` | `apps/desktop/src/updater.ts` |
| Tray | Oui. **Fermer la fenêtre ne quitte pas l'app** (`window-all-closed` vide) : on quitte par le menu du tray | `main.ts` |
| Verrou d'instance unique | Oui | `main.ts` |
| Données | IndexedDB (Dexie) dans le renderer → `%APPDATA%\@nebula-clock\desktop\IndexedDB` | dossier observé |
| Suppression des données | Pas de `deleteAppDataOnUninstall` → **données conservées** à la désinstallation | `build.nsis` |
| Stack | Electron 33, electron-builder 25.1.8, Vite 5, React 18.3, zustand 5, Tailwind 3, i18next | manifestes |
| Particularités | Démarrage avec Windows (`openAsHidden`), raccourcis globaux, « bloqueur » qui modifie le fichier hosts, fenêtre mini | `apps/desktop/src` |
| Règle maison | « On ne tue jamais un processus tiers et on n'écrit jamais dans les préférences système à l'insu de l'utilisateur » | `Repo-Nebula-Context/repos/nebula-clock/CLAUDE.md` |

### 2.3 Nebula News

| Champ | Valeur relevée | Source |
|---|---|---|
| Version | 0.1.0, **figé** depuis le 2026-08-24 (2 commits) | `package.json`, git |
| `appId` / `productName` | `news.nebula.desktop` / `Nebula News` | `build` |
| Exécutable | `Nebula News.exe` | registre |
| Installeur | NSIS assisté (`oneClick: false`, choix du dossier ; `perMachine` par défaut → page « pour moi / pour tous ») | `build.nsis` |
| Nom d'installeur | `Nebula News Setup <v>.exe` (avec espaces : casse electron-updater, cf. session #37 de Finterest) | défaut electron-builder |
| Publication | Pas de `build.publish`. ⚠ Il existe pourtant **deux pre-releases** : `v0.1.0-alpha` (sans asset) et `v0.2.0-desktop` (asset `Nebula.News.Setup.0.1.0.exe`, **sans `latest.yml`**, tag incohérent avec la version 0.1.0) → **non installable par le Store** (R02 exige `latest.yml`). Statut `coming-soon` confirmé. | API GitHub |
| Auto-update | Aucun | `desktop/main.js` |
| Architecture desktop | `desktop/main.js` (CommonJS) lance le serveur Next standalone sur `127.0.0.1:<port libre>`, puis ouvre une fenêtre sur `http://127.0.0.1:<port>` | `desktop/main.js` |
| Preload / IPC | ⚠ **Aucun preload, aucun IPC** : le renderer est une page HTTP servie par Next. Le bouton « Apps Nebula » et la réception d'intents (M8) demanderont d'ajouter un preload minimal ou une route API locale. | `desktop/main.js` |
| Verrou d'instance unique | ⚠ **Aucun** : `second-instance` n'existe pas. Le routage `--nebula-intent` (8.4) devra l'ajouter en M8. | `desktop/main.js` |
| Données | `%APPDATA%\Nebula News\nebula-news.db` (copié depuis `template.db` au premier lancement) | `desktop/main.js` |
| Réseau | Ingestion RSS toutes les 3 h ; API Claude **optionnelle** | `desktop/main.js`, README |
| Stack | Electron 43, electron-builder 26.15.3, Next 14, Prisma 5, Tailwind 3 ; **aucun test, aucune CI, aucune config ESLint** | `package.json` |
| Divers | Un dossier `%LOCALAPPDATA%\nebula-news-updater` existe sur la machine (origine non élucidée, sans conséquence) | observé |

### 2.4 Synthèse pour le catalogue

| `id` proposé | `productName` | `appId` | `exeName` | Feed | Installeur | `selfUpdates` | Statut |
|---|---|---|---|---|---|---|---|
| `nebula.finterest` | Nebula Finterest | `com.finterest.desktop` | `Nebula Finterest.exe` | `latest.yml` | one-click, user | `true` | stable |
| `nebula.clock` ⚠ (brief : `nebula.pomodoro`) | Nebula Clock | `clock.nebula.desktop` | `Nebula Clock.exe` | `latest.yml` | assisté, user ou machine | `true` | stable |
| `nebula.news` | Nebula News | `news.nebula.desktop` | `Nebula News.exe` | — | assisté | `false` | coming-soon |
| `nebula.store` | Nebula Store | à valider (ADR-011) | `Nebula Store.exe` | `latest.yml` | one-click, user | `true` | — |

---

## 3. Ce que fait vraiment un installeur electron-builder (lu dans le code)

Lu dans `app-builder-lib` **24.13.3** (Finterest), et vérifié identique en **25.1.8** (Clock) et
**26.15.3** (News, et le Store) : `templates/nsis/*.nsh`, `out/targets/nsis/NsisTarget.js`,
`nsisScriptGenerator.js`, et `electron-updater` 6.8.9 `out/NsisUpdater.js`.

### 3.1 Registre

- La clé de désinstallation est `Software\Microsoft\Windows\CurrentVersion\Uninstall\<GUID>`, où
  `GUID = UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3)` (`NsisTarget.js`). **Vérifié** sur les
  trois apps installées : `com.finterest.desktop → a0d0bf64-…`, `news.nebula.desktop → ac8066bb-…`,
  `clock.nebula.desktop → d73baec4-…`.
- Valeurs écrites : `DisplayName` = **`<productName> <version>`** (ex. `Nebula Finterest 0.1.35`),
  `DisplayVersion`, `UninstallString` = `"<dir>\Uninstall <productName>.exe" /currentuser`,
  `QuietUninstallString` = idem + ` /S`, `DisplayIcon`, `Publisher`, `EstimatedSize`.
- ⚠ Écart avec le brief (7.1) : **`InstallLocation` n'est PAS dans la clé Uninstall.** Il est dans
  une seconde clé, `Software\<GUID>` (`INSTALL_REGISTRY_KEY`), avec `KeepShortcuts` et `ShortcutName`.
  On peut aussi le déduire du chemin entre guillemets de `UninstallString`.
- Installation par utilisateur → `HKCU` ; par machine → `HKLM` (même structure).

### 3.2 Drapeaux de ligne de commande

`NsisTarget.js` génère une macro par drapeau : `updated`, `force-run`, `keep-shortcuts`,
`no-desktop-shortcut`, `delete-app-data`, `allusers`, `currentuser` (testés par
`StdUtils.TestParameter`, donc `--updated` ou `/updated`). Plus `/S` (silencieux) et `/D=<dir>`.

### 3.3 Ce qui protège les données lors d'une mise à jour [CRITIQUE]

1. `electron-updater` (`NsisUpdater.doInstall`) lance : `installer.exe --updated [/S] [--force-run] [/D=<dir>]`
   (`/D` seulement si `installDirectory` est fixé, ce qui n'est pas le cas par défaut).
2. Le **nouvel installeur**, s'il trouve une installation existante, copie l'ancien désinstalleur
   dans `$PLUGINSDIR` et l'exécute avec `/S /KEEP_APP_DATA <mode> --updated _?=<dir>`
   (`installUtil.nsh`, `uninstallOldVersion`). Le commentaire du template est explicite :
   *« always pass --updated flag - to ensure that if DELETE_APP_DATA_ON_UNINSTALL is defined, user
   data will be not removed »*. **Seule exception : si l'installeur lui-même a reçu `--delete-app-data`.**
3. L'ancien désinstalleur ne supprime `%APPDATA%\…` que si `${ifNot} ${isUpdated}`
   (`uninstaller.nsh`).

Conséquence : relancer l'installeur par-dessus une installation existante conserve les données,
**à condition de ne jamais passer `--delete-app-data`**. Le Store reproduira exactement les
arguments d'`electron-updater` (ADR-004).

### 3.4 Ce qui est dangereux

- **Un installeur silencieux tue l'app en cours d'exécution.** `_CHECK_APP_RUNNING` affiche
  « l'app est ouverte » avec `/SD IDOK` : en mode `/S`, la réponse par défaut est « OK » et
  l'installeur exécute `taskkill /im "<exe>"` sur les processus de l'utilisateur. Pour respecter
  R08, le Store doit obtenir la fermeture de l'app **avant** de lancer l'installeur.
- **Un seul installeur à la fois par app** (mutex nommé par le GUID). Un second installeur
  s'arrête (`Abort`). Risque réel : Finterest et Clock ont `autoInstallOnAppQuit` ; si leur updater
  a déjà téléchargé la mise à jour, **fermer l'app déclenche leur propre installeur**, en même
  temps que celui du Store. Le Store doit donc relire la version installée après la fermeture et
  après tout échec, avant de conclure.
- **Un désinstalleur NSIS se recopie dans `%TEMP%` et rend la main immédiatement** (sauf `_?=`).
  Le code de sortie de `QuietUninstallString` ne dit donc pas que la désinstallation est finie :
  le Store doit attendre la disparition de la clé de registre (avec délai maximal).
- La désinstallation réelle de Finterest **supprime `%APPDATA%\Finterest`** : c'est attendu, d'où
  la sauvegarde préalable (7.6).

### 3.5 Arguments d'installation retenus (détail dans ADR-004)

| Opération | Commande |
|---|---|
| Installation neuve | `installer.exe /S` (+ `/D=<dir>` en **dernier**, sans guillemets, si l'utilisateur a choisi un dossier) |
| Mise à jour | `installer.exe --updated /S` — **jamais** `/D`, **jamais** `--delete-app-data` |
| Réparation (même version) | `installer.exe --updated /S` |
| Désinstallation | `QuietUninstallString` découpé (exe entre guillemets + arguments), puis attente de la disparition de la clé |

---

## 4. Direction artistique : où sont les vraies sources

⚠ Écart important avec la section 10 du brief.

- **La source canonique n'est plus `Nebula/…/theme.css` ni `NEBULA_DESIGN.md` : c'est le dépôt
  `nebula-design-system`.** Son `AGENTS.md` et le hub de contexte posent deux règles de famille :
  *« take values from `tokens/`, never from a sibling project »* et *« le sens du flux est design
  system → produits, jamais l'inverse »*. Le brief, lui, demande de **porter** les modules v0.1.36
  de Finterest (section 10.2) et de faire de `packages/nebula-design` « la source partagée de toute
  la famille » (10.7). Les deux se contredisent : **question 1**.
- Le design system **ne contient rien** du lot v0.1.36 de Finterest (verre liquide, préréglages
  d'accent, fonds animés, niveaux d'animation, sons, `effects.ts`, `Icon.tsx`) : ce lot est plus
  récent que lui. Pour ces modules, **Finterest est la seule source qui existe**.
- `tokens/theme.css` (l'original) est incomplet ; `tokens/tokens.css` (issu de Clock) est la
  référence pour un nouveau projet.

### 4.1 Valeurs : design system contre Finterest (et donc contre la table 10.1 du brief)

| Point | `nebula-design-system` | Finterest (= brief 10.1) | Commentaire |
|---|---|---|---|
| Noms des variables | `--bg-base`, `--bg-surface`, `--card`, `--card-alt`, `--border`, `--text`, `--text-secondary`, `--blue`, `--violet` | `--page`, `--sidebar`, `--surface`, `--surface-raised`, `--line`, `--ink`, `--muted`, `--gold`, `--accent` | Les modules à porter (`appearance.ts`, `BackgroundFx`, CSS) utilisent les noms Finterest |
| Palette sombre et claire | identique | identique | ✅ |
| `--line-strong` | absent | `#3B3B63` / `#C7C0E6` | ajout Finterest |
| `--danger` sombre / clair | `#F43F5E` / `#E11D48` (tokens.css) ; `#FB7185` / `#BE123C` (prose) | `#FB7185` / `#BE123C` | Incohérence connue (question ouverte n° 1 du hub). Le brief retient `#FB7185` / `#BE123C` |
| `--focus-ring` | ombre double `0 0 0 2px bg, 0 0 0 4px violet` | couleur `rgba(168,85,247,.6)` | formes différentes |
| Halo clair | `.10` / `.10` | `.10` / `.09` | dérive mineure |
| Rayons | 8 / 12 / 14 / 18 / 999 | 12 / 18 (16 / 24 en verre), champs 8 | |
| Réduction de mouvement | `prefers-reduced-motion` **et** `:root[data-reduce-motion='true']` (règle n° 5 de la famille) | `prefers-reduced-motion` **et** `data-motion = full / reduced / off` | Le brief verrouille `data-motion` ; il couvre le besoin de `data-reduce-motion` (`off`) mais pas sous ce nom |
| Police | Inter si police web possible, sinon `'Segoe UI Variable Text', 'Segoe UI', system-ui` | `'Aptos', 'Segoe UI Variable Text', 'Segoe UI', system-ui` | Le brief retient la pile Finterest (ADR-006) |
| Contraste élevé, échelle de texte | `data-contrast='high'`, `--font-scale` | absents | non demandés par le brief |

### 4.2 Logos

- Grammaire confirmée dans `nebula-design-system/logo/nebula-finterest-mark.svg` (= `Finterest/assets/nebula-logo.svg`) :
  `viewBox 0 0 128 128`, plaque `rx 30` en `#12121F`, halo radial `#8B5CF6` à 42 %, dégradé
  `#4C6EF5 → #A855F7`, une seule teinte pleine (le point/étoile `#A855F7`), marge ≥ 18/128.
- Le monogramme d'origine (`logo/nebula.svg`, `viewBox 0 0 100 100`, plaque `#1A1A2E`) suit une
  grammaire plus ancienne ; News l'utilise tel quel.
- Piège connu : les éléments animés du splash exigent `transform-box: view-box` et un
  `transform-origin` en coordonnées du viewBox.

---

## 5. Collisions de dossiers de données

État constaté sur la machine de développement :

| Dossier | Propriétaire |
|---|---|
| `%APPDATA%\Finterest` | Nebula Finterest |
| `%APPDATA%\Nebula News` | Nebula News |
| `%APPDATA%\@nebula-clock\desktop` | Nebula Clock |
| `%LOCALAPPDATA%\Programs\{finterest, Nebula News, Nebula Clock}` | installations |
| `%LOCALAPPDATA%\nebula-news-updater` | inconnu (voir 2.3) |

- **Aucun dossier `%APPDATA%\Nebula*` ne correspond à `Nebula Store`.** L'ancienne app Python
  (`nebula.db`) n'a laissé aucune trace ici ; son dépôt étant supprimé, son emplacement exact ne
  peut plus être lu, mais il s'appelait `Nebula`, pas `Nebula Store` : pas de collision possible
  avec un dossier nommé exactement `Nebula Store`.
- `%LOCALAPPDATA%\Nebula Store\` (téléchargements) et `%LOCALAPPDATA%\Nebula Link\` (jeton de
  session) n'existent pas.
- Attention au mécanisme de `deleteAppDataOnUninstall` : il supprime `%APPDATA%\<APP_FILENAME>`,
  `%APPDATA%\<productFilename>` **et** `%APPDATA%\<package name>`. Le Store ne l'activera pas
  (ADR-007), et le nom de paquet `nebula-store` ne recoupe aucun dossier existant.

---

## 6. Réseau et sources

| Point | Constat |
|---|---|
| API GitHub sans authentification | Répond, `ETag` présent (requêtes conditionnelles possibles), 60 requêtes/h |
| Téléchargement d'un asset | `github.com/.../releases/download/...` → **302** vers `release-assets.githubusercontent.com` (dans la liste blanche R05) |
| `raw.githubusercontent.com` | Répond (200) pour un dépôt public |
| Dépôt `Memel-SQT/Nebula-Store` | N'existe pas encore (404), comme prévu |
| `git.rodriguesnoa.fr` | ⚠ Le DNS **public** (vérifié via 1.1.1.1) résout vers une adresse **Tailscale** (`100.64.0.0/10`). Injoignable hors du tailnet, et injoignable depuis cette machine au moment du test. **Inutilisable comme miroir public** (ADR-010) |
| `latest.yml` | Format confirmé : `version`, `files[].url/sha512/size`, `path`, `sha512` (base64), `releaseDate` |

---

## 7. Environnement de développement

| Point | Constat | Conséquence |
|---|---|---|
| Node / npm | 24.19 / 11.17 | OK |
| Electron le plus récent | **44.5.1** (44.0.0 le 2026-08-25) ; le paquet npm exige **Node ≥ 22.12** | ⚠ Écart : le brief dit « Node 20 minimum » ; la CI devra passer en Node 22 (ADR-001) |
| TypeScript le plus récent | 7.0 (compilateur natif) ; **`ts-jest` 29.4 n'accepte que TS < 7** | TS 5.9 (ADR-001) |
| Windows Sandbox | ⚠ **Non activé** (`WindowsSandbox.exe` absent) | Les recettes [CRITIQUE] de 7.6 exigent de l'activer (fonctionnalité Windows, droits admin, redémarrage) : **question** |
| Encodage de `reg.exe` | Page de code OEM 850 (fr-FR) quand la sortie est redirigée ; les caractères non ASCII arrivent mal décodés | Lecture du registre par `reg export` (UTF-16) plutôt que `reg query` (ADR-003) |
| Finterest installée | 0.1.35, avec des données réelles | Ne pas mettre à jour cette installation pour les tests : passer par la Sandbox |

---

## 8. Points d'attention pour la suite (au-delà des questions)

1. **Nebula Link et les pipes Windows** : les pipes créés par Node ont la DACL par défaut (lecture
   pour « Tout le monde »), et un autre utilisateur peut créer le pipe avant le hub (*squatting*).
   La spécification M6 prévoira une authentification **mutuelle** par défi-réponse (le jeton ne
   circule jamais en clair) et la règle « rien n'est envoyé avant l'authentification ».
2. **News n'a ni preload, ni verrou d'instance** : son adoption de Link (M8) sera la plus lourde.
3. **Clock vit dans le tray** : `tasklist` le verra toujours ouvert. Avant M8 (pas de fermeture
   propre via Link), le Store devra demander à l'utilisateur de le quitter depuis son tray.
4. **Les apps ont déjà leur updater** (Finterest, Clock) : risque de course décrit en 3.4.
5. **Les données de Clock sont dans IndexedDB, côté renderer** : le widget « Focus du jour » (I3)
   devra remonter du renderer vers le main de Clock par son preload, puis vers Link.
6. **i18n** : Finterest utilise un dictionnaire maison plat (`translate(lang, key, params)`), Clock
   i18next avec un test de parité des clés. Le Store reprendra l'API de Finterest, avec des fichiers
   par domaine et le test de parité de Clock.
