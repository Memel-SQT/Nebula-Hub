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

## Mode d'emploi

1. **Le Hub d'abord** : tant que le catalogue signé ne contient pas le nouveau manifeste de
   News, le Hub refuse les widgets qu'il ne connaît pas (« ce qui n'est pas déclaré est
   refusé »). Ensuite Clock, puis Finterest, dans l'ordre que tu veux.
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
APP : Nebula Hub (dépôt Memel-SQT/Nebula-Hub, dossier local Nebula-Store). Deux parties.

1. CATALOGUE SIGNÉ
- Dans `catalog/nebula-catalog.json`, entrée `nebula.news` : passe la version publiée à 0.4.0
  et remplace son manifeste Link (`link`) par le `nebula.app.json` de News 0.4.0, à
  l'identique (5 capacités : `news.headlines.today`, `news.focus.today`,
  `news.finance.today`, `news.tech.today`, `news.open-briefing` ; 5 deepLinks : `/`,
  `/briefing`, `/theme/focus`, `/theme/finance`, `/theme/tech`). Mets à jour la description et
  l'accroche de News : « Développement personnel, finance et tech, chaque jour » (fr) /
  « Personal growth, finance and tech, every day » (en). La catégorie reste `info`.
- Re-signe le catalogue (docs/CATALOG.md : la signature couvre les octets exacts), et vérifie
  avec les tests du catalogue. Ne touche pas aux autres apps.

2. ACCUEIL DU HUB
- Ajoute la carte « Tech du jour » (widget `news.tech.today`) sur l'accueil, dans la grille de
  widgets existante, à côté de `news.headlines.today` (garde les deux, ou propose-moi de
  remplacer « À la une » par « Tech du jour » : c'est à moi de choisir).
- Le Hub consomme les widgets publics par défaut (consentement « autorisé, visible et
  désactivable » dans Intégrations) : vérifie que les trois nouveaux widgets apparaissent dans la
  matrice d'Intégrations avec leur titre et leur description, désactivables.
- Le `deepLink` de la carte ouvre News sur `/theme/tech` (intent vers `nebula.news`).
- Banc d'essai : tests/link-harness/ (faux News qui fournit les trois widgets, puis `null`,
  puis hors ligne).

3. DOCUMENTATION
- docs/NEBULA_LINK.md § 10 (I3) : ajoute les trois widgets et l'app qui les consomme.
- docs/PROMPT_APPS.md : section News à jour (thèmes, widgets).
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
