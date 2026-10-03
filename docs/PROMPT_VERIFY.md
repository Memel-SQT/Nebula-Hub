# Prompt de vérification de la famille Nebula

Ce prompt sert à **vérifier qu'une app de la famille fonctionne de bout en bout**, après une
série de mises à jour : Nebula Hub, Nebula Finterest, Nebula Clock ou Nebula News. Il ne corrige
rien de lui-même : il teste, mesure, puis rend un rapport et propose un plan de correction.

Il s'appuie sur les autres prompts du dossier, qui décrivent ce qui doit être vrai :
[`PROMPT_APPS.md`](PROMPT_APPS.md) (mise à jour, Nebula Link, sauvegardes, publication),
[`PROMPT_DESIGN.md`](PROMPT_DESIGN.md) (harmonisation visuelle),
[`PROMPT_NEWS_THEMES.md`](PROMPT_NEWS_THEMES.md) (thèmes de Nebula News) et
[`NEBULA_LINK.md`](NEBULA_LINK.md) (spécification de Link).

## Mode d'emploi

1. Ouvre Claude Code dans le dépôt de l'app à vérifier.
2. Colle le **prompt commun**, puis la **section propre à l'app**.
3. Lis le rapport. Rien n'est modifié, poussé ni publié sans ton accord : si des défauts sont
   trouvés, la session propose un plan et attend ta réponse.
4. Fais les quatre dépôts, dans n'importe quel ordre. Commence par le Hub si tu veux d'abord
   valider le catalogue et le banc d'essai de Link, que les autres vérifications réutilisent.

---

## Prompt commun (à copier tel quel)

```text
Tu travailles dans le dépôt d'une app de la famille Nebula (Nebula Hub, Nebula Finterest, Nebula
Clock ou Nebula News) : des apps Electron Windows, locales, sans compte ni télémétrie, reliées
par Nebula Hub et sa liaison locale Nebula Link. Identifie l'app d'après le dépôt. Ta mission :
VÉRIFIER que tout fonctionne de bout en bout, puis rendre un rapport. Tu ne corriges rien sans
mon accord.

RÈGLES (non négociables)
- Lis d'abord le CLAUDE.md du dépôt (s'il existe), le README et le DEV_CHANGES (ou CHANGELOG),
  puis, dans le dépôt Nebula Hub (dossier frère ..\Nebula-Store, sinon github.com/Memel-SQT/
  Nebula-Hub, branche main) : docs/NEBULA_LINK.md, docs/PROMPT_APPS.md, docs/PROMPT_DESIGN.md,
  docs/PROMPT_NEWS_THEMES.md et docs/CATALOG.md.
- Lecture et tests uniquement. Pas de commit, pas de push, pas de tag, pas de release, pas de
  modification du catalogue. Les fichiers temporaires (scripts, captures) vont dans un dossier
  temporaire hors dépôt, et le dépôt doit rester propre (`git status`) à la fin.
- JAMAIS les vraies données : chaque app se lance sur un dossier de données jetable (Finterest :
  FINTEREST_USER_DATA_DIR ; sinon le mécanisme du dépôt, ou --user-data-dir ; si tu n'en trouves
  pas, arrête-toi et demande). Ne touche ni au dossier %APPDATA% réel ni à Documents\Nebula …
  réel. Pour Nebula Link, utilise le Hub de test (NEBULA_LINK_SESSION_FILE), jamais le Hub
  réellement installé.
- Ne fais aucun appel réseau autre que la lecture des releases publiques sur GitHub
  (versions, latest.yml, empreintes).
- Chaque constat est PROUVÉ : commande et sortie, valeur mesurée dans l'app lancée, ou capture.
  « Devrait marcher » n'est pas un résultat. Ce que tu ne peux pas vérifier ici est listé comme
  « non vérifié », avec la raison.

PARTIE 1 — SANTÉ DU DÉPÔT
1. État git (branche, en retard ou en avance sur origin/main, fichiers non suivis), versions
   (package.json, dernier tag, dernière release GitHub et Gitea si le dépôt a un remote gitea).
2. Installation propre (npm ci, ou corepack pnpm install --frozen-lockfile), puis typecheck,
   lint, tests, build. Note les avertissements, pas seulement les erreurs.
3. Dépendances : versions d'Electron et d'electron-builder, `npm audit` (ou pnpm audit) : liste
   ce qui est critique ou élevé, sans rien mettre à jour.

PARTIE 2 — PUBLICATION ET MISES À JOUR
1. La dernière release GitHub contient l'installeur NSIS, son .blockmap et latest.yml ;
   artifactName de la forme Nebula-<App>-Setup-<version>.exe ; la taille et le SHA-512 de
   latest.yml correspondent à l'installeur publié (télécharge-le dans le dossier temporaire et
   calcule l'empreinte).
2. latest.yml de la release « latest » annonce bien la dernière version ; la release Gitea
   (si elle existe) a les mêmes fichiers et les mêmes tailles.
3. Le paquet construit localement (`dist` / `dist:win`) contient nebula.app.json dans resources\
   (sauf le Hub) et le manifeste est valide pour le SDK (`parseManifestBytes`).

PARTIE 3 — NEBULA LINK (contre le Hub de test du dépôt Nebula Hub)
Le Hub de test et les fausses apps sont dans ..\Nebula-Store\tests\link-harness\ (test-hub.ts,
fake-apps.ts, e2e-app.ts ; le faux News 0.4.0 sert les quatre widgets de News). Écris un petit
lanceur dans le dossier temporaire si besoin (ne modifie pas le dépôt du Hub).
1. Sans Hub : l'app démarre et fonctionne, sans erreur ni attente visible.
2. Avec le Hub de test : la poignée de main réussit ; chaque capacité de `provides` répond selon
   son schéma (WidgetV1, NotificationV1…) ; une capacité `private` ne répond que si un compte
   est déverrouillé, et `null` sinon ; rien de non déclaré n'est accepté.
3. `consumes` : chaque capacité consommée fonctionne (apparence I1 appliquée si « Suivre
   l'apparence Nebula » est actif, nebula.hub.present, widgets de News) et l'app reste correcte
   quand elle ne répond pas (Hub absent, fournisseur hors ligne, délai dépassé, consentement
   refusé, résultat null, charge invalide).
4. Liens profonds et intents : chaque chemin de `deepLinks` est routé, un paramètre non déclaré
   est refusé, `--nebula-intent` au démarrage et par `second-instance`.
5. Mode Hub (nebula.hub.dock) : bascule aller-retour, `released`, perte du Hub en plein mode
   Hub, bouton « Détacher » : la fenêtre normale revient toujours (cadre, taille, position).
6. Confidentialité : aucune donnée personnelle dans une capacité `public`, aucune requête
   sortante ne porte de données de l'app (par exemple, la requête des widgets de News est sans
   paramètre), le SDK ne journalise pas le contenu des échanges.

PARTIE 4 — DONNÉES (si l'app garde des données)
1. `--backup-before-uninstall=<chemin>` écrit la sauvegarde et quitte (code 0) en moins de
   2 minutes, même app ouverte ; le fichier respecte le format documenté (<app>-backup-v1).
2. `--import-backup=<chemin>` ouvre l'import avec confirmation obligatoire, rien n'est écrit
   avant le « oui » ; arrive aussi par `second-instance`.
3. Rétrocompatibilité : une base, un fichier de réglages et une sauvegarde au format de chaque
   version publiée s'ouvrent sans perte (tests du dépôt, plus un essai manuel sur une ancienne
   sauvegarde si le dépôt en contient une).
4. Désinstallation (installer.nsh) : la sauvegarde est faite avant la suppression des données,
   et une mise à jour (`--updated`) ne supprime jamais rien. Vérifie par lecture du script et
   des tests, sans désinstaller l'app réelle.

PARTIE 5 — INTERFACE ET DESIGN DE LA FAMILLE
Lance l'app sur des données jetables et mesure dans l'app lancée (CDP ou outils de test) :
1. Coquille : fenêtre sans cadre, bande de 36 px, contrôles Windows teintés ; barre latérale du
   Hub (entrées ≥ 44 px, ou 2.45rem sur fenêtre basse ; rail < 1100 px ; barre du haut < 720 px) ;
   colonne centrée jusqu'à 2280 px.
2. Apparence : les 4 thèmes + Système, les accents, les arrière-plans, les niveaux d'animation,
   les sons, « Réinitialiser l'apparence » ; les réglages existants sont relus sans perte.
3. Captures dans 3 tailles (1600×900, 1050×700, 700×700), thème sombre et clair : pas de
   défilement horizontal, pas de texte tronqué sans infobulle, un seul bouton en dégradé par
   écran, navigation complète au clavier avec focus visible, animations « Désactivées » sans
   rien d'invisible, contraste AA sur les textes.
   Piège connu : une fenêtre en arrière-plan ne peint pas d'image, donc une animation CSS ne
   démarre qu'à la première capture. Fais une capture jetable, attends ~1 s, puis la vraie.
4. Sécurité Electron : contextIsolation, sandbox, pas de nodeIntegration, CSP présente dans le
   HTML construit, un seul preload aux méthodes précises (pas d'invoke générique), navigation et
   window.open bloqués, chaque entrée IPC validée côté main.

RAPPORT FINAL (en français)
- Un tableau par partie : vérification, résultat (OK / DÉFAUT / NON VÉRIFIÉ), preuve (commande,
  mesure ou capture).
- Les défauts, du plus grave au moins grave, avec leur cause probable et le fichier concerné.
- Un PLAN de correction numéroté, puis ARRÊTE-TOI et attends mon accord.
- Ce qui n'a pas pu être vérifié, et pourquoi.
```

---

## Section Nebula Hub (à coller après le prompt commun)

```text
APP : Nebula Hub (dépôt Memel-SQT/Nebula-Hub, dossier local Nebula-Store). En plus du prompt
commun :
- Catalogue (docs/CATALOG.md) : catalog/nebula-catalog.json est valide, sa signature
  (nebula-catalog.json.sig) se vérifie avec la clé publique embarquée (src/electron/
  catalog-key.ts), generatedAt est plus récent que celui de la copie incluse dans la dernière
  release, chaque icône et capture référencée existe (PNG de 1 280 px de large). Ne re-signe rien.
- Pour chaque app du catalogue (Finterest, Clock, News) : la release « latest » existe, son
  latest.yml est cohérent avec l'installeur, le productName et l'exeName correspondent au paquet,
  et le nebula.app.json du paquet publié (téléchargé dans le dossier temporaire, puis extrait) est
  accepté par le serveur Link (parseManifestBytes) avec ses `consumes` : Finterest consomme
  news.finance.today, Clock news.focus.today.
- Accueil : les widgets (« Tech du jour », Focus de Clock, reste à vivre de Finterest masqué par
  défaut, widgets masqués non lus), le centre Intégrations (consentements, révocation immédiate,
  journal sans contenu), le centre d'activité (historique 30 jours, effacement).
- Opérations : installation, mise à jour, réparation et désinstallation d'une app sont vérifiées
  sur le banc d'essai ou par les tests, pas sur les apps réellement installées ; la sauvegarde
  avant opération et son échec (deux choix) sont couverts.
- La mise à jour du Hub par lui-même (ADR-029) : la release « latest » est installable depuis la
  précédente.
```

## Section Nebula Finterest (à coller après le prompt commun)

```text
APP : Nebula Finterest (dépôt Memel-SQT/Nebula-Finterest, npm). En plus du prompt commun :
- Données jetables : FINTEREST_USER_DATA_DIR=<dossier temporaire> (isole aussi le dossier de
  sauvegardes) ; Hub de test : NEBULA_LINK_SESSION_FILE=<fichier de session du Hub de test>.
- Budget : création de profil, code PIN (blocage 30 s après 5 erreurs), revenus, abonnements,
  achats prévus, prêts, calendrier (achat ponctuel depuis un jour, prélèvement du 31 sur un mois
  plus court), calculatrice, montants saisis « 12,50 ».
- Link : finterest.budget.remaining répond seulement avec un profil réel déverrouillé (null
  verrouillé et en invité) ; notification privée « Prélèvement prévu demain », une seule fois
  par prélèvement et par jour ; /month?date=AAAA-MM ouvre le bon mois.
- Carte « Apprendre » (news.finance.today) : requête SANS paramètre, profil réel déverrouillé,
  fenêtre visible, au plus toutes les 15 min ; absente sur l'écran de code, à la création de
  profil, en invité, Hub ou News absents, réglage coupé ; texte brut, lien nebula://news/
  uniquement, ouvert par le protocole nebula://.
- Sauvegarde, dossier de copie (sens unique : les profils locaux restent la référence) et
  import : à vérifier sur données jetables seulement. Ne touche ni au PIN ni au chiffrement.
```

## Section Nebula Clock (à coller après le prompt commun)

```text
APP : Nebula Clock (dépôt Memel-SQT/nebula-clock, monorepo pnpm via corepack ; un push sur main
déclenche semantic-release : NE POUSSE RIEN). En plus du prompt commun :
- Commandes : corepack pnpm install --frozen-lockfile, puis typecheck, lint, tests de
  packages/core, e2e Playwright d'apps/web, build Electron d'apps/desktop.
- Minuteur : sessions, pauses courtes et longues, objectif du jour et série, mode compact
  (MiniApp) toujours visible ; une seule animation infinie à l'écran (si l'anneau tourne,
  l'arrière-plan se fige).
- Link : clock.focus.today (FocusTodayV1 dans un WidgetV1), clock.break.started (BreakStartedV1)
  à chaque début de pause, notification « Session terminée », liens / et /start?preset=… ;
  carte « À lire pendant la pause » (news.focus.today) pendant les pauses uniquement, jamais
  pendant le focus, ni dans la MiniApp ni en version web, sans toucher au minuteur.
- Données : si l'app a une sauvegarde (clock-backup-v1), parties 4 du prompt commun.
```

## Section Nebula News (à coller après le prompt commun)

```text
APP : Nebula News (dépôt Memel-SQT/Nebula-News, Next.js 15 + Prisma, emballé dans Electron par
desktop/main.js en CommonJS). En plus du prompt commun :
- La version web et la version de bureau sont vérifiées toutes les deux (npm run build et npm
  run build:desktop).
- Réseau : News lit des flux RSS, c'est attendu ; vérifie qu'aucun autre appel ne part
  (télémétrie, analytics) et que la navigation de desktop/main.js est protégée (will-navigate,
  liens externes dans le navigateur).
- Thèmes 0.4.0 : les quatre widgets (news.headlines.today, news.focus.today, news.finance.today,
  news.tech.today) répondent en WidgetV1 (3 articles au plus, textes ≤ 80 caractères, sans HTML,
  deepLink nebula://news/…), `null` quand le thème est vide ; les liens /briefing,
  /theme/focus, /theme/finance et /theme/tech ouvrent le bon écran ; l'intent news.open-briefing.
- Le nebula.app.json de la branche main est bien celui de la version publiée (0.4.0 ou plus) :
  sinon, signale-le (la branche de la version n'a peut-être pas été fusionnée).
- Données : si l'app a une sauvegarde (news-backup-v1), parties 4 du prompt commun.
```
