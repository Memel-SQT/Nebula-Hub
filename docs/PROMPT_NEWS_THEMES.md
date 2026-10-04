# Prompts : brancher les thèmes de Nebula News dans les autres apps

Nebula News 0.4.0 ne suit plus l'actualité générale mais **trois thèmes**, chacun lié à une app
de la famille. Elle publie un widget Nebula Link par thème. Ces prompts font le travail de
l'autre côté : le Hub (catalogue et accueil), Nebula Clock et Nebula Finterest.

| Thème | Widget News (public, `WidgetV1`) | Ouvre | App qui l'affiche |
|---|---|---|---|
| Développement personnel et organisation de vie | `news.focus.today` | `nebula://news/theme/focus` | Nebula Clock |
| Finance et éducation financière | `news.finance.today` | `nebula://news/theme/finance` | Nebula Finterest |
| Tech et informatique | `news.tech.today` | `nebula://news/theme/tech` | Nebula Hub (accueil) |

`news.headlines.today` reste en place (un sujet par thème) : rien ne casse pour un Hub qui ne
connaît pas encore les nouveaux widgets.

## État (2026-10-04)

| App | État |
|---|---|
| Nebula Hub | Fait en 0.2.2 (commit `9664e65`, ADR-031) |
| Nebula Clock | Fait en 1.5.0 |
| Nebula Finterest | Fait en 0.1.39 |

Les prompts ci-dessous servent désormais à vérifier ou à refaire.

## Mode d'emploi

1. **Pas d'ordre imposé** : le catalogue ne contient pas le manifeste Link des apps, seulement
   le nom du fichier (`"link": { "manifest": "nebula.app.json", "minProtocol": 1 }`). Le Hub lit
   et valide `nebula.app.json` dans le **dossier d'installation** de chaque app. Les widgets de
   News sont donc acceptés dès que News 0.4.0 est installée, sans toucher au catalogue. Une app
   qui affiche un thème doit seulement le déclarer dans son propre `consumes`, et sa carte
   n'apparaît que si News est ouverte (sinon le Hub répond `provider-offline`).
2. Ouvre Claude Code dans le dossier de l'app, colle le **prompt commun**, puis, à la suite, la
   **section propre à l'app**.
3. Chaque session présente d'abord son plan et attend ton accord. Rien n'est fusionné, poussé ni
   publié sans ton accord.

Prérequis : Nebula News 0.4.0 publiée (release `v0.4.0` de Memel-SQT/Nebula-News, avec
`nebula.app.json` dans `resources\` de l'installeur).

---

## Prompt commun (à copier tel quel)

```text
Tu travailles dans le dépôt d'une app de la famille Nebula (Nebula Hub, Nebula Clock ou Nebula
Finterest) : des apps Electron Windows, locales, sans compte ni télémétrie, reliées par Nebula
Link (IPC local, named pipe, opt-in ; spécification : docs/NEBULA_LINK.md du dépôt
Memel-SQT/Nebula-Hub).

CONTEXTE
Nebula News 0.4.0 (dépôt Memel-SQT/Nebula-News) suit désormais trois thèmes, un par app :
- développement personnel et organisation de vie → Nebula Clock → widget `news.focus.today`,
  écran `nebula://news/theme/focus` ;
- finance et éducation financière → Nebula Finterest → widget `news.finance.today`, écran
  `nebula://news/theme/finance` ;
- tech et informatique → Nebula Hub (accueil) → widget `news.tech.today`, écran
  `nebula://news/theme/tech`.
Les trois widgets sont `public`, de type `widget`, `resultSchema: "WidgetV1"`,
`refreshSeconds: 900`. Charge utile : `{ title, caption, items: [{ label, value }] (3 au plus :
titre de l'article, source), deepLink, updatedAt }`, textes de 80 caractères au plus, jamais de
HTML. News répond `null` quand le thème n'a pas encore d'article. Le manifeste de référence est
`nebula.app.json` à la racine du dépôt Nebula News (branche main) : lis-le avant de commencer.

RÈGLES (non négociables)
- Lis d'abord le CLAUDE.md du dépôt (s'il existe), le README et le DEV_CHANGES, et suis leurs
  conventions (langue et format des commits, gestionnaire de paquets, hooks). Travaille sur une
  branche `feat/news-themes` créée depuis la branche principale.
- Présente-moi un PLAN numéroté avant de modifier quoi que ce soit, et attends mon accord.
  Arrête-toi avant toute publication (push, tag, release) et dès qu'une décision touche aux
  données ou à la sécurité.
- L'app reste 100 % utilisable sans Nebula News et sans le Hub : la carte n'apparaît que si le
  widget répond ; une erreur Link (`provider-offline`, `timeout`, `consent-denied`,
  `unknown-capability`) la masque sans message d'erreur ni blocage. Aucun appel réseau
  nouveau : on passe par Link, jamais par une URL d'article chargée dans l'app.
- Valide la charge utile reçue côté processus principal (schéma WidgetV1, longueurs, deepLink
  qui commence par `nebula://news/`) avant de la transmettre au renderer, par une méthode
  précise du preload existant (jamais d'`invoke(channel)` générique).
- Le renderer affiche du texte brut (pas de `dangerouslySetInnerHTML`). Un clic ouvre le
  `deepLink` par le mécanisme `nebula://` déjà en place (le Hub lance News), jamais un
  navigateur intégré.
- Rafraîchissement : au plus toutes les 15 minutes, et seulement quand la fenêtre est visible.
  Aucune donnée de l'app n'est envoyée à News (la requête n'a pas de paramètre).
- Interface : composants, icônes et tokens de la famille (@nebula/design, voir
  docs/PROMPT_DESIGN.md du Hub), textes en fr et en, états vide / chargement / indisponible.
- Tests : la validation de la charge utile, l'absence de News ou du Hub, un résultat `null`.
  Typecheck, lint, tests et build doivent passer.

RAPPORT FINAL (en français) : ce qui est fait, captures avant / après, commandes de validation
et résultats, écarts et questions. Mets à jour README et DEV_CHANGES (ou CHANGELOG).
```

---

## Section Nebula Hub (à coller après le prompt commun)

```text
APP : Nebula Hub (dépôt Memel-SQT/Nebula-Hub, dossier local Nebula-Store). Fait en 0.2.2
(commit 9664e65, ADR-031) : vérifie chaque point et ne corrige que ce qui manque.

1. CATALOGUE SIGNÉ
- Le catalogue ne contient ni le manifeste Link des apps ni leur version (docs/CATALOG.md) :
  l'entrée `nebula.news` garde `"link": { "manifest": "nebula.app.json", "minProtocol": 1 }`,
  et le Hub lit le manifeste dans le dossier d'installation de News. Les versions viennent de
  la release GitHub et de son `latest.yml`. Ne recopie donc aucun manifeste, n'ajoute aucun
  champ de version, et ne change pas `link`.
- Seuls changent, dans l'entrée `nebula.news` : l'accroche (`tagline`) « Développement
  personnel, finance et tech, chaque jour » (fr) / « Personal growth, finance and tech, every
  day » (en), et la description (les trois thèmes et l'app qui affiche chacun). La catégorie
  reste `info`.
- Re-signe le catalogue (`npm run catalog:sign`, docs/CATALOG.md : la signature couvre les
  octets exacts), puis `npm test`. Ne touche pas aux autres apps.

2. ACCUEIL DU HUB
- Rien à déclarer côté Hub : il lit les widgets publics déclarés dans le manifeste installé de
  News, donc les quatre widgets de News 0.4.0 sont disponibles dès son installation.
- « Tech du jour » (`news.tech.today`) remplace « À la une » sur l'accueil (choix fait,
  ADR-031). `news.headlines.today`, `news.focus.today` et `news.finance.today` sont masqués par
  défaut sur l'accueil (`HOME_HIDDEN_BY_DEFAULT`, src/shared/widgets.ts) : les deux derniers
  sont faits pour Clock et Finterest.
- Intégrations → « Widgets de l'accueil » : chaque widget s'affiche ou se masque, et un
  widget masqué n'est jamais lu.
- Vérifie aussi que les paires « Nebula Clock ↔ news.focus.today » et « Nebula Finterest ↔
  news.finance.today » apparaissent dans la matrice d'Intégrations, avec titre et
  description, et qu'elles sont désactivables : c'est ce qui coupe la carte côté app.
- Le `deepLink` de la carte ouvre News sur `/theme/tech`. Un `deepLink` vers un autre hôte que
  l'app qui fournit le widget est retiré.
- Banc d'essai : tests/link-harness/news-themes.test.ts (faux News avec le vrai manifeste
  0.4.0 : les widgets, puis `null`, puis hors ligne).

3. DOCUMENTATION
- docs/NEBULA_LINK.md § 10 (I3) et docs/PROMPT_APPS.md (section News) : déjà à jour ;
  vérifie-les.
```

## Section Nebula Clock (à coller après le prompt commun)

```text
APP : Nebula Clock (appId `nebula.clock`, minuteur Pomodoro, dépôt Memel-SQT/nebula-clock,
monorepo pnpm : packages/core = logique, apps/web = interface React + Tailwind,
apps/desktop = Electron). Utilise pnpm via `corepack pnpm`. Commits conventionnels : un push
sur main déclenche semantic-release, donc NE POUSSE PAS sans mon accord.

- Manifeste `nebula.app.json` : ajoute `{ "id": "news.focus.today", "kind": "widget" }` dans
  `consumes` (sans rien retirer).
- Processus principal (apps/desktop) : `link.query('news.focus.today')`, validation WidgetV1,
  exposé au renderer par une méthode précise du preload (ex. `nebula.readingSuggestions()`).
- Interface : une carte « À lire pendant la pause » (fr) / « Read during your break » (en)
  pendant les PAUSES uniquement (courtes et longues), jamais pendant une session de focus :
  le minuteur reste prioritaire, aucune distraction pendant le travail. 3 titres au plus avec
  leur source ; un clic ouvre le thème dans News (`nebula://news/theme/focus`) et ne met pas le
  minuteur en pause.
- Réglage « Suggestions de lecture pendant les pauses » (activé par défaut quand News est
  installée), dans la section Nebula des réglages.
- Le mode compact (MiniApp) n'affiche pas la carte.
- Hors navigateur (version web d'apps/web) : la carte n'existe pas.
- Pas de nouvelle donnée stockée, pas de changement dans packages/core (hors une fonction pure
  testée si besoin, par exemple « afficher la carte selon l'état du minuteur »).
- Les tests e2e Playwright (apps/web/e2e) restent verts.
```

## Section Nebula Finterest (à coller après le prompt commun)

```text
APP : Nebula Finterest (appId `nebula.finterest`, budget personnel, dépôt
Memel-SQT/Nebula-Finterest, Electron + React + Vite, npm). Elle manipule des données
financières PRIVÉES : sois strict.

- Manifeste `nebula.app.json` : ajoute `{ "id": "news.finance.today", "kind": "widget" }` dans
  `consumes` (sans rien retirer).
- Processus principal : `link.query('news.finance.today')` SANS paramètre. Aucune donnée d'un
  compte (montants, catégories, nom, solde) ne part vers Link ni vers News, même pour
  « personnaliser » : la carte est la même pour tout le monde.
- Interface : une carte « Apprendre » (fr) / « Learn » (en) sur la vue d'ensemble, sous les
  indicateurs, jamais au-dessus des montants : 3 articles de finance et d'éducation
  financière avec leur source ; un clic ouvre le thème dans News
  (`nebula://news/theme/finance`).
- La carte n'apparaît que lorsqu'un compte est déverrouillé (comme le reste de l'écran), jamais
  sur l'écran de code (AccountGate) ni sur la création de profil.
- Réglage « Articles de finance de Nebula News » (activé par défaut quand News est installée),
  dans la section Nebula des réglages.
- NE TOUCHE PAS au chiffrement, au code PIN, à la sauvegarde avant désinstallation, à l'import,
  au dossier de copie ni à installer.nsh. Aucune migration de données.
```

---

## Ce qui est déjà fait côté News (0.4.0)

- Les trois widgets et leurs liens profonds, déclarés dans `nebula.app.json` (validé par le SDK
  dans les tests de News).
- Les écrans `/theme/focus`, `/theme/finance` et `/theme/tech`, ouverts par les liens profonds.
- Les articles de l'ancienne actualité générale sont masqués, jamais supprimés.
