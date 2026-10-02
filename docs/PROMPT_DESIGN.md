# Prompt d'harmonisation visuelle des apps Nebula

Ce prompt aligne **le style, l'UX/UI et la personnalisation** de chaque app de la famille sur la
direction artistique Nebula. À la fin, Nebula Hub, Nebula Finterest, Nebula Clock et Nebula News
doivent avoir l'air de sortir du même atelier :
- même coquille et même barre latérale ;
- mêmes icônes ;
- mêmes réglages d'apparence, avec les mêmes noms ;
- mêmes composants et mêmes mouvements.

Il complète [`PROMPT_APPS.md`](PROMPT_APPS.md), qui traite de la mise à jour technique et de
Nebula Link.

## Références, par ordre d'autorité

1. **Palette, dégradé, halo, rayons, mouvement** : le dépôt `nebula-design-system`.
   - Fichiers : `tokens/theme.css` (il fait foi), `tokens/tokens.css`, `AGENTS.md` et
     `docs/direction-artistique.md`.
   - Il est rangé à côté des apps (`..\nebula-design-system`). Il est privé : en cas d'absence,
     la session demande où il se trouve.
2. **Personnalisation, thèmes, icônes, sons, arrière-plans** : le paquet `@nebula/design` du dépôt
   public Nebula Hub (`packages/nebula-design/src`).
   - Il est disponible en local dans `..\Nebula-Store` et sur GitHub dans `Memel-SQT/Nebula-Hub`.
   - Il est porté de Nebula Finterest, puis enrichi.
3. **Modèle d'interface** : le renderer de Nebula Hub. C'est la référence visuelle vivante :
   - la barre latérale (`src/renderer/components/Sidebar.tsx`, `src/renderer/styles/sidebar.css`) ;
   - la grammaire des tableaux de bord (`src/renderer/styles/dashboard.css`) ;
   - la page Réglages (`src/renderer/screens/SettingsScreen.tsx`) ;
   - les états d'écran (`src/renderer/components/ScreenState.tsx`).

## Mode d'emploi

1. **Une app à la fois**, dans l'ordre Finterest → Clock → News. Finterest est l'origine de la DA :
   c'est elle qui demande le moins d'écart.
2. Ouvre Claude Code dans le dossier de l'app. Colle le **prompt commun**, puis, à la suite, la
   **section propre à l'app**.
3. La session commence par un audit visuel et un plan. Relis-les, valide, puis relis les captures
   avant/après du rapport final. Rien n'est fusionné, poussé ni publié sans ton accord.
4. Quand les trois apps sont faites, compare-les côte à côte avec le Hub, dans le même thème et
   le même accent. Toute différence visible est un défaut à corriger.

---

## Prompt commun (à copier tel quel)

```text
Tu travailles dans le dépôt d'une app de la famille Nebula (Nebula Finterest, Nebula Clock ou
Nebula News) : des apps Electron Windows, locales, sans compte ni télémétrie, reliées par Nebula Hub.
Ta mission : rendre cette app VISUELLEMENT IDENTIQUE au reste de la famille (Nebula Hub est la
référence vivante) : même coquille, même barre latérale, mêmes icônes, mêmes réglages
d'apparence, mêmes composants, mêmes mouvements. Tu ne changes PAS ce que l'app fait.

RÈGLES (non négociables)
- Lis d'abord le CLAUDE.md du dépôt (s'il existe), le README et le DEV_CHANGES, et suis leurs
  conventions (langue des commits, gestionnaire de paquets, format des commits, hooks).
  Travaille sur une branche `feat/nebula-design` créée depuis la branche principale.
- Présente-moi un PLAN numéroté après l'audit (partie 1) et attends mon accord avant de
  modifier quoi que ce soit. Arrête-toi et demande dès qu'une décision touche aux données, à
  la sécurité ou à une fonctionnalité.
- Aucune régression : la logique métier, les données, la sauvegarde, la synchronisation, Nebula
  Link et les mises à jour ne changent pas. Seuls la présentation, la mise en page et le modèle
  d'apparence évoluent. Les réglages d'apparence existants de l'utilisateur sont MIGRÉS (lecture
  champ par champ : une valeur inconnue retombe sur la valeur par défaut sans casser les autres),
  jamais perdus.
- Références, par ordre d'autorité :
  1. nebula-design-system (dossier frère ..\nebula-design-system) : tokens/theme.css fait foi pour
     les couleurs, puis tokens/tokens.css, AGENTS.md, docs/direction-artistique.md ;
  2. le paquet @nebula/design du dépôt Nebula Hub (..\Nebula-Store\packages\nebula-design\src,
     sinon github.com/Memel-SQT/Nebula-Hub, branche main) : thèmes, modèle d'apparence,
     préréglages d'accent, arrière-plans, sons, effets, icônes ;
  3. le renderer de Nebula Hub (..\Nebula-Store\src\renderer) : Sidebar.tsx + styles/sidebar.css,
     styles/dashboard.css, styles/app.css, screens/SettingsScreen.tsx, components/ScreenState.tsx.
  Copie les fichiers dont tu as besoin (en-tête « Ported from Nebula Hub <commit> » ou « from
  nebula-design-system »), ne retape jamais une valeur hexadécimale à la main et ne prends jamais
  de tokens dans une autre app de la famille.
- Aucune couleur codée en dur hors d'un bloc de définition de tokens. Aucun texte visible codé
  en dur : i18n, fr et en ensemble.
- Mouvement : seules `opacity` et `transform` sont animées ; une seule animation infinie à l'écran
  (l'arrière-plan) ; entrées 150/220/420 ms ; cascades de 40 ms plafonnées à ~6 éléments.
  Respecte `data-motion` (full | reduced | off) ET `prefers-reduced-motion`.
- Icônes : uniquement le jeu d'icônes Nebula (composant Icon), jamais d'emoji ni de glyphe
  Unicode dans l'interface, et pas de bibliothèque d'icônes tierce (remplace-la si l'app en a une).
- Pas de nouvelle dépendance sans me le demander. Ne pousse rien, ne publie rien sans mon accord
  explicite. Ajoute une section datée en tête de DEV_CHANGES.md (ou équivalent) en fin de session.

PARTIE 1 — AUDIT VISUEL (avant toute modification)
1. Lance l'app sur des données JETABLES (dossier de profil temporaire : FINTEREST_USER_DATA_DIR,
   --user-data-dir…, jamais les données réelles) et fais des captures de chaque écran à
   1600×900, 1280×800 et 700×700, en thème sombre et en thème clair.
2. Dresse un tableau des écarts avec la référence : palette, rayons, typographie, coquille et
   barre latérale, icônes, boutons (un seul bouton primaire en dégradé par écran), cartes,
   champs, contrôles segmentés, interrupteurs, dialogues, états vides / chargement / erreur /
   hors ligne, mouvement, contraste, navigation au clavier, responsive (jusqu'à 3440 px).
3. Liste les réglages d'apparence actuels de l'app et leur correspondance avec le modèle cible
   (partie 2). Puis propose le PLAN et attends mon accord.

PARTIE 2 — PERSONNALISATION IDENTIQUE DANS TOUTES LES APPS
Le modèle est celui de @nebula/design (appearance.ts, theme.ts) ; c'est aussi exactement l'objet
diffusé par Nebula Link (`nebula.appearance.changed`, type NebulaAppearance). Mêmes valeurs, mêmes
valeurs par défaut, mêmes libellés, même ordre :
- Thème : nebula-dark « Nebula sombre », nebula-light « Nebula clair », glass-dark « Verre sombre »,
  glass-light « Verre clair », system « Système » (par défaut). Appliqué par
  `data-theme` sur <html> (valeur résolue, jamais « system »), avant le premier affichage
  (pas de flash), et répercuté sur les contrôles natifs de la fenêtre (titleBarOverlay).
- Langue : fr (par défaut) | en.
- Couleurs d'accent : nebula, aurora « Aurore », ocean « Océan », sunset « Couchant », sakura,
  ember « Braise », custom « Personnalisée » (deux couleurs : principale + secondaire). Appliquées
  par les variables de `accentVariables` ; le dégradé garde l'angle 100deg.
- Arrière-plan animé : glow « Halo nébuleuse » (par défaut), aurora « Aurore boréale »,
  stars « Champ d'étoiles », particles « Constellation », waves « Vagues », none « Aucun »
  (composant BackgroundFx, une seule couche fixe derrière tout, `data-background`).
- Animations de l'interface : full « Complètes » (par défaut), reduced « Réduites »,
  off « Désactivées » (`data-motion`).
- Sons : activés (par défaut) + volume 0–100 (45 par défaut) + bouton « Tester » (sound.ts).
- Bouton « Réinitialiser l'apparence ».
- « Suivre l'apparence de Nebula Hub » (déjà branché par Nebula Link) : la correspondance devient
  1 pour 1, sans approximation, puisque le modèle est le même. Hors du Hub, l'app garde ses
  propres réglages (R09).
La section « Apparence » des réglages reprend la mise en page de SettingsScreen.tsx du Hub :
sur-titres en capitales, contrôles segmentés pour thème / langue / animations, pastilles pour
les accents, vignettes pour les arrière-plans.

PARTIE 3 — COQUILLE, BARRE LATÉRALE ET COMPOSANTS IDENTIQUES
Fenêtre et coquille :
- Fenêtre sans cadre natif, bande de déplacement de 36 px en haut, contrôles Windows dessinés par
  titleBarOverlay et teintés selon le thème.
- Grille : barre latérale + colonne de contenu centrée. Largeur maximale du contenu : 1480 px,
  puis 1680 px à partir de 1900 px, 1960 px à partir de 2400 px et 2280 px à partir de 3000 px.
  La police de base passe à 17 px à partir de 2400 px et à 18 px à partir de 3000 px.
- En-tête de page : sur-titre (11–12 px, capitales, letter-spacing 0.12em, couleur d'accent),
  titre h1 (clamp(1.8rem, 3.3vw, 3.2rem), 700, letter-spacing négatif), actions à droite qui
  ne rétrécissent pas.

Barre latérale (copie fidèle de Sidebar.tsx + sidebar.css du Hub, adaptée aux sections de l'app) :
- Panneau flottant de 284 px :
  - décalé de 12 px des bords de la fenêtre, rayon --radius-lg, bordure 1 px --line ;
  - fond --sidebar à 82 %, flou en arrière-plan ;
  - dégradé verre dans les thèmes glass-*.
- En haut, le bloc marque : logo de l'app (40 px), nom, accroche, puis un filet.
- Les sections sont rangées en groupes, chacun sous un sur-titre en capitales (0.66rem,
  letter-spacing 0.12em). Exemples de groupes : « Votre espace », « Gestion ».
- Entrées :
  - hauteur 44 px, écart de 0.2rem entre elles et de 1.15rem entre groupes ;
  - icône de 18 px dans une tuile de 34 px (fond --surface-raised à 55 %) ;
  - libellé en 0.86rem / 600, couleur --muted.
- Survol : fond --surface-raised à 70 %, texte --ink, décalage translateX(2px), icône
  scale(1.06).
- Entrée active, selon la recette de la DA :
  - fond --surface-raised et anneau intérieur de 1 px en accent à 40 % ;
  - tuile d'icône en --accent-soft, icône en --accent-hover, duotone à 0.34 ;
  - barre d'accent de 3 px à gauche, qui apparaît en scaleY.
- Pastille de compteur (téléchargements, notifications…) : en forme de pilule, fond
  --accent-soft.
- En bas, dans l'ordre :
  - Réglages, sous un filet ;
  - une carte d'état : icône « orbit » + point de statut + titre + ligne d'état. Exemple :
    « Nebula Hub · Connecté » ou « Nebula Hub · Absent ». Elle mène à la section Nebula des
    réglages, ou ouvre le Hub ;
  - le pied « Local, sans compte · Version x.y.z ».
- Fenêtre basse (hauteur ≤ 860 px) : entrées de 2.45rem. La barre défile, sans ascenseur
  visible.
- Moins de 1100 px de large : rail d'icônes de 88 px. Les libellés restent présents pour les
  lecteurs d'écran et en infobulle (title). Les sur-titres deviennent de courts séparateurs, et
  la pastille se pose sur l'icône.
- Moins de 720 px : la navigation devient une barre en haut.
- PIÈGE CONNU (vécu sur le Hub) : une règle de réinitialisation des boutons, comme
  `button.plain { padding: 0 }`, plus spécifique que la classe de l'entrée, aplatissait toutes
  les entrées à 20 px. Préfixe tous les sélecteurs de la barre latérale par `.sidebar`, et
  VÉRIFIE la hauteur calculée de chaque entrée (≥ 44 px) dans l'app lancée.

Composants (grammaire dashboard.css du Hub, recettes de la DA) :
- Rayons : 8 px pour les contrôles, 12–14 px pour les cartes, 18 px pour les panneaux et les
  dialogues, 999 px pour les pilules.
- Cartes de résumé (KPI) : grille en auto-fit avec minmax(180px, 1fr), filet d'accent en haut,
  icône dans une tuile.
- Panneaux : sur-titre, titre, puis une pilule de compteur à droite.
- Grilles de tuiles en auto-fit : une rangée courte remplit la largeur au lieu de laisser des
  colonnes vides.
- Un seul bouton primaire en dégradé par écran. Les autres sont secondaires ou « ghost »
  (fond --card-alt ou transparent, bordure qui passe à l'accent au survol).
- Contrôles segmentés, interrupteurs et curseurs repris du Hub.
- Dialogues avec piège de focus, fond assombri et entrée dialog-in.
- Chaque écran gère ses états chargement / vide / hors ligne / erreur comme ScreenState.tsx :
  squelettes, icône dans une tuile d'accent, texte d'aide, action.
- Le halo ambiant est unique, fixe et derrière tout, jamais dans une carte.

Icônes :
- Copie Icon.tsx de @nebula/design :
  - grille de 24 px, trait de 1.8 px aux extrémités arrondies ;
  - une forme duotone par glyphe (`.icon-duo`, fill-opacity 0.16) ;
  - tout en currentColor.
- Navigation : navHome (accueil), compass (découvrir/explorer), apps (bibliothèque), downloadTray
  (téléchargements), orbit (Nebula Link/intégrations), gear (réglages), bell (activité),
  calendar, history, palette, shield…
- Pour un concept propre à l'app (minuteur, budget, article…), dessine une icône dans le même
  style : 24 px, 1.8 px, coins ronds, une seule forme duotone qui porte le sens, lisible à
  18 px. Ajoute-la au même composant et à son test.
- Le logo de l'app suit les règles de la DA :
  - plaque à rx = 30/128 ;
  - dégradé #4C6EF5 → #A855F7 ;
  - marge intérieure ≥ 18/128 ;
  - une seule teinte pleine hors dégradé.

PARTIE 4 — VÉRIFICATION ET RAPPORT
- Typecheck, lint, tests et build doivent passer. Mets à jour les tests qui visent l'ancienne
  interface sans affaiblir leurs assertions, et ajoute des tests pour l'analyse des réglages
  d'apparence et leur migration.
- Captures après modification, sur données jetables :
  - tailles 3440×1440, 2560×1080, 1600×900, 1280×800, 1050×700 et 700×700 ;
  - dans les 4 thèmes, avec 2 accents ;
  - aucune barre de défilement horizontale ;
  - aucun texte tronqué sans infobulle ;
  - contraste AA ;
  - navigation complète au clavier, avec focus visible ;
  - animations « Désactivées » qui ne laissent rien d'invisible.
- Compare côte à côte avec Nebula Hub (même thème, même accent) et corrige toute différence de
  barre latérale, de rayon, d'espacement ou de couleur.
- Rapport final en français : ce qui a changé, écran par écran (captures avant/après), migration
  des réglages, écarts restants assumés et pourquoi, commandes de validation et résultat.
```

---

## Nebula Finterest (à coller après le prompt commun)

```text
APP : Nebula Finterest (Electron + React + Vite, npm). C'est l'origine de la DA : @nebula/design
a été porté depuis ses fichiers (src/renderer/appearance.ts, theme.ts, sound.ts, effects.ts,
components/Icon.tsx, BackgroundFx.tsx, styles.css). L'écart porte donc surtout sur la coquille.
- Aligne la barre latérale sur celle du Hub. Groupes proposés :
  - « Mon budget » : vue d'ensemble, calendrier, prélèvements, achats ;
  - « Outils » : prêts, calculatrice ;
  - en bas : Réglages + carte d'état Nebula Hub + pied local.
  Garde la puce de profil (compte actif + verrouillage) sous le bloc marque, dans le style de
  la carte d'état.
- Reprends les icônes de navigation du Hub (navHome, calendar, repeat, bag, bank, calculator,
  gear…) depuis @nebula/design, qui contient aussi les icônes d'origine de Finterest.
- Écrans à ne pas oublier : l'écran de code (AccountGate), la création de profil, l'écran de
  démarrage (Splash), la bande « Détacher » du mode Hub, les dialogues de sauvegarde, d'import
  et de restauration.
- N'ajoute la valeur « system » au thème que si l'app ne l'a pas déjà. Le flou des montants
  privés reste en place.
- NE TOUCHE PAS au chiffrement, au code PIN, à la sauvegarde avant désinstallation
  (--backup-before-uninstall=), à l'import (--import-backup=), au dossier de copie ni à
  installer.nsh.
- Données jetables : FINTEREST_USER_DATA_DIR=<dossier temporaire> (isole aussi les sauvegardes).
```

## Nebula Clock (à coller après le prompt commun)

```text
APP : Nebula Clock (monorepo pnpm : packages/core = logique, apps/web = interface React + Tailwind,
apps/desktop = Electron). Utilise pnpm via `corepack pnpm`. Les commits suivent Conventional
Commits : un push sur main déclenche semantic-release, donc NE POUSSE PAS sans mon accord.
- Tailwind : prends le preset du design system (tokens/tailwind-preset.ts) et
  ports/nebula-clock/. Importe les tokens CSS AVANT les directives @tailwind (piège connu).
  Pas de couleur Tailwind nommée `base`.
- Remplace le thème clair/sombre actuel (apps/web/src/hooks/useTheme.ts) par le modèle complet de
  la partie 2 (4 thèmes + system, accents, arrière-plans, animations, sons), avec une migration
  depuis l'ancien réglage. clockAppearanceFromHub (packages/core/src/nebula) devient une
  correspondance 1 pour 1.
- Barre latérale du Hub pour la fenêtre principale :
  - groupes « Focus » (minuteur, tâches) et « Progrès » (statistiques, séries, badges) ;
  - « Ambiances » si c'est une section ;
  - en bas : Réglages + carte d'état Nebula Hub + pied.
- Le mode compact toujours visible (MiniApp) garde sa mise en page minimale, mais avec les mêmes
  tokens, rayons et icônes.
- L'anneau du minuteur utilise le dégradé d'accent (100deg) et n'anime que `transform` et
  `opacity` (stroke-dashoffset seulement si la DA le permet pour ce tracé, sinon
  `transform: rotate`/`scale`). Il ne faut qu'une animation infinie à l'écran : pendant une
  session, si l'anneau tourne en continu, l'arrière-plan doit se figer.
- packages/core ne change pas (à part la fonction de correspondance d'apparence et ses tests).
  Les tests e2e Playwright (apps/web/e2e) doivent rester verts.
- Rendu Electron : build VITE_TARGET=electron copié dans apps/desktop/renderer, comme d'habitude.
```

## Nebula News (à coller après le prompt commun)

```text
APP : Nebula News (Next.js 15 + Tailwind + Prisma, emballé dans Electron par desktop/main.js).
L'app a aussi une version web : la nouvelle interface doit fonctionner dans les deux.
- Tailwind : preset du design system + ports/nebula-news/globals.css comme point de départ,
  tokens importés avant @tailwind.
- L'app n'a pas encore de personnalisation :
  - ajoute une page Réglages > Apparence avec le modèle complet de la partie 2 ;
  - mémorise ces réglages dans un cookie, lu côté serveur pour poser data-theme, data-motion et
    les variables d'accent dès le rendu HTML (aucun flash) ;
  - en version de bureau, l'apparence suivie depuis Nebula Hub passe par le même cookie, comme la
    langue aujourd'hui.
- Remplace la barre de navigation du haut par la barre latérale du Hub à partir de 720 px :
  - groupes « Briefing » (à la une, par thème, favoris) et « Sources » ;
  - en bas : Réglages + carte d'état Nebula Hub (bureau seulement) + pied.
  Sous 720 px, la barre du haut reste. Le lien « Apps Nebula » reste réservé au bureau.
- Les cartes d'article suivent la grammaire Card/Panel (rayon 12–14 px, bordure 1 px, pas
  d'ombre en sombre). Les images ont des proportions fixes, sans décalage de mise en page.
- Ne change ni les flux RSS ni le classement, et garde la protection de navigation de
  desktop/main.js (will-navigate, liens externes ouverts dans le navigateur).
- Tests : `npm test` (règles Nebula du bureau) plus les éventuels tests de l'interface ;
  `npm run build` et `npm run build:desktop` doivent passer.
```

---

## Ce que le Hub a déjà (référence au 2026-10-02)

- Barre latérale flottante en groupes, entrées de 44 px, icônes de navigation dédiées (navHome,
  compass, apps, downloadTray, orbit, gear), carte d'état Nebula Link et rail compact. Le défaut
  qui aplatissait les entrées (règle `button.plain`) est corrigé.
- Modèle d'apparence complet de la partie 2, diffusé aux apps par Nebula Link.
- Colonne de contenu centrée jusqu'aux écrans ultra-larges, grilles en auto-fit.
