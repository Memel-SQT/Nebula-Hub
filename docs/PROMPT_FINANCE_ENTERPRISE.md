# Prompt de création : Nebula Finance Enterprise

Ce prompt lance la création de **Nebula Finance Enterprise**, l'édition premium et orientée
entreprise de Nebula Finterest. Il reprend tout ce que Finterest fait déjà (budget, calendrier,
prêts, sauvegardes, personnalisation, Nebula Link), puis ajoute la gestion financière d'une
entreprise : plusieurs entités, plusieurs utilisateurs, budgets par service, trésorerie, factures,
notes de frais, validations, TVA et rapports.

Il complète [`PROMPT_APPS.md`](PROMPT_APPS.md) (mise à niveau technique, Nebula Link) et
[`PROMPT_DESIGN.md`](PROMPT_DESIGN.md) (harmonisation visuelle), qui restent les références pour
tout ce qui touche à la famille Nebula.

## Mode d'emploi

1. Crée un dépôt vide `Memel-SQT/Nebula-Finance-Enterprise` (privé), clone-le à côté des autres
   apps (`..\Nebula-Finance-Enterprise`), et ouvre Claude Code dedans.
2. Colle le **prompt** ci-dessous tel quel.
3. La session commence par une **étude** et un **dossier d'architecture**, puis s'arrête. Rien
   n'est codé avant ta validation, notamment le choix du mode de déploiement (question A).
4. Ensuite, on avance **un jalon à la fois** (M0 → M9) : chaque jalon se termine par une démo, des
   tests verts et un court rapport, et attend ton accord avant le suivant.
5. Rien n'est poussé, publié ni facturé sans ton accord explicite.

---

## Prompt (à copier tel quel)

```text
Tu crées « Nebula Finance Enterprise » (appId `nebula.finance-enterprise`, exécutable
`Nebula Finance Enterprise.exe`, dépôt Memel-SQT/Nebula-Finance-Enterprise) : l'édition
premium, orientée entreprise, de Nebula Finterest. Elle reprend TOUT ce que fait Finterest et y
ajoute la gestion financière d'une PME (1 à 500 personnes) : plusieurs sociétés, plusieurs
utilisateurs avec des rôles, budgets par service, trésorerie, factures, notes de frais,
validations, TVA, rapports et exports comptables. Elle fait partie de la famille Nebula (Nebula
Hub, Finterest, Clock, News) et en garde l'identité visuelle et les intégrations.

SOURCES À LIRE D'ABORD (dans cet ordre)
1. ..\Nebula-Finterest : CLAUDE.md, README.md, DEV_CHANGES.md, puis le code (src/shared/budget.ts,
   src/electron/{store,accounts,backups,sync,nebula}.ts, src/renderer). C'est la base fonctionnelle
   et technique : calculs de budget, calendrier, prêts, calculatrice d'intérêts composés,
   sauvegardes versionnées, import confirmé, dossier de copie, Nebula Link, mode Hub, sécurité
   Electron (sandbox, CSP, preload précis), rétrocompatibilité des données.
2. ..\Nebula-Store\docs\PROMPT_APPS.md et PROMPT_DESIGN.md : règles de la famille (Link,
   sauvegardes, import, publication, coquille, barre latérale, icônes, apparence).
3. ..\nebula-design-system (tokens/theme.css fait foi) et ..\Nebula-Store\packages\nebula-design
   (thèmes, apparence, icônes, sons, arrière-plans). Copie ces fichiers avec un en-tête
   « Ported from … <commit> » ; ne retape jamais une couleur à la main.

RÈGLES (non négociables)
- Présente un PLAN et attends mon accord avant chaque jalon. Arrête-toi et demande dès qu'une
  décision touche aux données, à la sécurité, au droit (fiscalité, facturation, RGPD), au modèle
  économique ou au mode de déploiement.
- Données d'entreprise = données sensibles. Chiffrement au repos OBLIGATOIRE dès le premier
  jalon (pas « plus tard » comme dans Finterest) ; aucune donnée en clair dans les sauvegardes,
  les copies, les journaux ou les messages d'erreur.
- Aucune télémétrie, aucune publicité, aucun appel réseau non déclaré. Tout appel réseau (serveur
  de l'entreprise, vérification de mise à jour, plateforme de facturation) est explicite,
  désactivable quand c'est possible, listé dans le README et dans l'écran « Confidentialité ».
- Aucune connexion bancaire directe par agrégateur ni stockage d'identifiants bancaires : les
  relevés s'importent par fichier (CSV, OFX, CAMT.053). Aucun conseil en investissement : les
  projections et simulations sont présentées comme indicatives.
- Le droit change : ne cite jamais une règle fiscale ou comptable de mémoire. Pour la TVA, le FEC,
  la facturation électronique (réforme française, Factur-X / UBL / CII, plateformes agréées),
  l'archivage et le RGPD, vérifie la source officielle à jour (impots.gouv.fr, legifrance.gouv.fr,
  economie.gouv.fr, cnil.fr), note la date de vérification dans docs/compliance.md, et écris
  noir sur blanc ce que l'app ne fait PAS (ce n'est pas un logiciel comptable certifié, pas un
  logiciel de caisse, pas une plateforme agréée de facturation électronique, sauf décision
  contraire validée par moi).
- Ne perds jamais de données : migrations additives et versionnées, sauvegarde automatique avant
  chaque migration, formats de sauvegarde versionnés et documentés, tests de non-régression sur
  des jeux de données réalistes et anonymisés.
- Sécurité Electron : contextIsolation, sandbox, pas de nodeIntegration, CSP stricte, un seul
  preload aux méthodes précises (jamais d'invoke générique), validation de CHAQUE entrée IPC côté
  main (schémas), navigation et window.open bloqués, pas de shell (execFile/spawn avec tableaux).
- Le renderer n'applique jamais une permission : chaque contrôle de droit est fait côté main (ou
  côté serveur), et chaque action sensible est inscrite au journal d'audit.
- Accessibilité AA, navigation complète au clavier, i18n fr + en dès le départ (aucun texte en
  dur), montants en Decimal (jamais de flottants pour l'argent : centimes entiers ou bibliothèque
  décimale validée par moi), devises ISO 4217, dates en ISO 8601 et fuseau explicite.
- Code, commentaires et commits en anglais ; README et documentation utilisateur en français.
  Une branche par jalon, un commit par sujet.

PARTIE 1 — ÉTUDE ET DOSSIER D'ARCHITECTURE (aucun code)
1. Inventaire de ce qui se réutilise depuis Finterest (code copié, adapté ou réécrit, et pourquoi).
2. Réponds à ces questions par des options comparées et une recommandation, dans docs/adr/ :
   A. Déploiement : (1) poste seul, local ; (2) poste + base partagée sur le réseau de
      l'entreprise ; (3) serveur auto-hébergé par l'entreprise (API + base) avec clients de
      bureau, et mode hors ligne avec resynchronisation. Pour chacune : multi-utilisateur,
      conflits, sauvegarde, sécurité, coût d'exploitation. Je tranche avant M1.
   B. Stockage : sql.js (Finterest) ne suffit pas (écriture du fichier entier, pas de concurrence,
      pas de chiffrement). Compare SQLite natif chiffré (SQLCipher / better-sqlite3-multiple-
      ciphers) et PostgreSQL (si serveur), avec la gestion des clés (DPAPI Windows, mot de passe
      maître, séquestre de clé de l'entreprise).
   C. Identité : comptes locaux avec mot de passe fort (Argon2id) + TOTP en option ; et, en mode
      serveur, SSO OIDC (Entra ID / Google Workspace) en option. Les codes PIN de Finterest ne
      suffisent pas pour l'édition entreprise.
   D. Licence premium : fichier de licence signé (Ed25519), vérifié hors ligne avec la clé
      publique embarquée, par société et par nombre de sièges, avec période de grâce ; aucune
      activation en ligne obligatoire. Comportement à l'expiration : lecture et export toujours
      possibles, jamais de blocage des données.
   E. Montants et devises : représentation, arrondis (règles par devise), taux de change saisis
      ou importés par fichier, historisés.
3. Modèle de données (schéma, relations, index) et diagramme des modules.
4. Plan des jalons ci-dessous, avec estimation et risques. Puis ARRÊTE-TOI.

PARTIE 2 — FONCTIONNALITÉS (par jalons, chacun livrable et testé)

M0 — Fondations
- Projet Electron + React + Vite + TypeScript strict, structure électron/shared/renderer comme
  Finterest, tests (Jest/Vitest + Playwright pour l'e2e Electron), lint, CI Windows.
- Coquille et apparence identiques à la famille (PROMPT_DESIGN.md) : barre latérale en groupes,
  fenêtre sans cadre, thèmes, accents, arrière-plans, sons, icônes Nebula (+ icônes métier
  dessinées dans le même style).
- Stockage chiffré, migrations versionnées, journal d'audit append-only (qui, quoi, quand, avant/
  après, chaîné par hash pour détecter une altération).

M1 — Sociétés, utilisateurs, rôles
- Plusieurs sociétés (entités) dans une même installation, chacune avec sa devise de référence,
  son exercice comptable, son numéro SIREN/SIRET et TVA intracommunautaire (vérification de
  format et de clé, sans appel réseau par défaut).
- Utilisateurs, invitations (en mode serveur), rôles prédéfinis : Administrateur, Direction
  financière, Comptable, Responsable de budget, Validateur, Collaborateur (notes de frais),
  Lecture seule / Auditeur ; permissions fines par société et par centre de coût.
- Verrouillage de session, délai d'inactivité, historique des connexions, réinitialisation
  sécurisée par un administrateur.

M2 — Reprise de Finterest, version entreprise
- Budget mensuel et annuel, calendrier des échéances (récurrentes et ponctuelles), prêts et
  emprunts avec tableau d'amortissement, calculatrice d'intérêts : repris de Finterest, rattachés
  à une société et à des centres de coût.
- Import d'une sauvegarde Finterest (finterest-backup-v1) dans une société, avec aperçu et
  confirmation.

M3 — Plan analytique et budgets
- Plan de comptes (modèle PCG français fourni, personnalisable), centres de coût / services /
  projets / étiquettes analytiques.
- Budgets par service et par projet, versions (initial, révisé, prévisionnel), workflow de
  validation des budgets, verrouillage d'une version validée.
- Suivi réel vs budget, écarts en valeur et en %, seuils d'alerte, commentaires sur les écarts.

M4 — Trésorerie
- Comptes bancaires (sans connexion), import de relevés CSV / OFX / CAMT.053 avec mappage de
  colonnes mémorisé, détection des doublons, règles de catégorisation automatiques.
- Rapprochement bancaire (opérations ↔ factures / dépenses), suggestions, rapprochement partiel.
- Prévision de trésorerie à 13 semaines et sur 12 mois, scénarios (prudent, central, optimiste),
  alerte de solde bas.

M5 — Ventes et achats
- Clients et fournisseurs (fiches, conditions de paiement, coordonnées bancaires stockées
  chiffrées et masquées).
- Devis → factures → avoirs, numérotation chronologique continue et sans trou par société,
  mentions légales obligatoires (à vérifier), TVA multi-taux, multi-devises, PDF propres.
- Factures fournisseurs : saisie, pièce jointe, échéancier, statut de paiement.
- Relances, balance âgée clients et fournisseurs, DSO / DPO.
- Facturation électronique : produire et lire Factur-X ; l'émission/réception via une
  plateforme agréée est une INTÉGRATION OPTIONNELLE à étudier (ADR) et à valider avec moi, pas
  une fonction par défaut.

M6 — Dépenses et validations
- Notes de frais : saisie, photo ou PDF du justificatif, catégories, indemnités kilométriques
  (barème à vérifier et à dater), refacturation.
- Demandes d'achat et bons de commande, rapprochement commande ↔ facture.
- Moteur de validation configurable : circuits par montant, par service, par société, délégation
  pendant les absences, relances, historique complet dans le journal d'audit.
- Suivi des abonnements SaaS de l'entreprise (le calendrier de Finterest, version entreprise) :
  renouvellements, préavis de résiliation, coût par siège.

M7 — TVA, clôture et exports
- Écritures générées depuis les factures, dépenses et relevés (journal de ventes, d'achats, de
  banque), lettrage.
- Préparation des montants de TVA collectée / déductible par période (aide à la déclaration, pas
  de télédéclaration).
- Export FEC (format à vérifier sur la source officielle, contrôle de conformité intégré),
  exports CSV/XLSX pour l'expert-comptable, import d'écritures.
- Clôture de période : verrouillage, contrôles avant clôture, réouverture tracée.

M8 — Pilotage
- Tableaux de bord par rôle : direction (CA, marge, trésorerie, burn rate, runway), finance
  (écarts budgétaires, encours), responsable de service (son budget).
- Rapports : compte de résultat de gestion, budget vs réel, trésorerie, par période, société,
  service ou projet ; consolidation multi-sociétés (avec élimination des flux intra-groupe à
  étudier) ; exports PDF et XLSX ; rapports planifiés (générés localement).
- Widgets Nebula Link (sensibilité `private`, uniquement session déverrouillée et droits
  suffisants) : trésorerie du jour, validations en attente ; notifications privées : échéance
  fournisseur, validation demandée, solde bas.

M9 — Exploitation et publication
- Sauvegardes chiffrées planifiées dans `Documents\Nebula Finance Enterprise\` (format
  `finance-enterprise-backup-v1`), copie vers un second dossier, restauration testée,
  `--backup-before-uninstall=` et `--import-backup=` comme dans PROMPT_APPS.md.
- RGPD : registre des traitements de l'app, export et effacement des données d'une personne
  (collaborateur, contact), durées de conservation configurables, en respectant les obligations
  de conservation comptable (à vérifier).
- Administration : paramètres de société, sauvegarde/restauration, licences et sièges, journal
  d'audit consultable et exportable, état de santé (taille de base, dernière sauvegarde, intégrité
  du journal).
- Installeur NSIS signé si un certificat est fourni, `latest.yml`, artifactName
  `Nebula-Finance-Enterprise-Setup-${version}.${ext}`, mises à jour sans perte, manifeste
  `nebula.app.json` pour Nebula Hub (catalogue, Link, mode Hub).
- Documentation : guide utilisateur par rôle, guide administrateur, guide de déploiement (selon
  le choix A), docs/compliance.md, docs/security.md (modèle de menace).

PARTIE 3 — QUALITÉ ET SÉCURITÉ (à chaque jalon)
- Tests unitaires sur tous les calculs d'argent (arrondis, TVA, devises, amortissements,
  prévisions), tests de propriétés sur la numérotation des factures et les soldes, tests e2e des
  parcours critiques, tests de migration depuis chaque version publiée.
- Revue de sécurité : modèle de menace (STRIDE) mis à jour, contrôle d'accès testé rôle par rôle
  (un test par permission refusée), dépendances auditées, aucun secret dans le dépôt.
- Performance : 100 000 écritures et 10 000 factures sans ralentissement visible (budget de
  temps défini et mesuré).
- Captures avant/après et démo de chaque jalon, sur des données JETABLES (dossier de données
  temporaire, jamais de vraies données d'entreprise).

RAPPORT DE FIN DE JALON
Ce qui est fait (5 lignes), commandes de validation et résultats, décisions et écarts, points de
sécurité, de données et de conformité touchés, questions ouvertes. Mets à jour README et
DEV_CHANGES. Ne pousse rien, ne publie rien sans mon accord explicite.
```

---

## Points à trancher avant de lancer

- **Déploiement (question A)** : c'est la décision qui change le plus le projet. Un poste seul
  reste dans l'esprit de la famille (local, sans compte). Un serveur auto-hébergé ouvre le vrai
  multi-utilisateur, mais ajoute un composant à installer, sauvegarder et maintenir.
- **Périmètre réglementaire** : l'app aide à préparer la TVA, le FEC et les factures. Devenir un
  logiciel comptable certifié ou une plateforme agréée de facturation électronique est un autre
  métier (agrément, audits) ; le prompt l'exclut par défaut.
- **Modèle premium** : licence hors ligne par société et par siège ; prix, durée et période de
  grâce restent à fixer.
