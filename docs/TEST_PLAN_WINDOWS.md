# Recette manuelle sous Windows

Ces recettes complètent les tests automatiques (`npm test`). Elles se font dans **Windows
Sandbox**, une machine Windows jetable : l'installation réelle des apps sur l'ordinateur de
développement n'est jamais touchée.

## Préparer Windows Sandbox (une seule fois)

1. Ouvrir PowerShell **en administrateur** et lancer :

   ```powershell
   Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All
   ```

2. Redémarrer Windows.

Windows Sandbox demande Windows Pro, Entreprise ou Éducation, et la virtualisation activée.

## Lancer une session

```bash
npm run dist:win
powershell -ExecutionPolicy Bypass -File scripts/sandbox.ps1
```

Le script ouvre Windows Sandbox avec le dossier `install\windows` en **lecture seule** sur le
bureau (« Nebula Hub »). Tout ce qui se passe dans la sandbox disparaît à sa fermeture.

**Mode automatique** : `scripts/sandbox.ps1 -Recipe m4` ou `-Recipe m5`. La sandbox installe le
Hub et le lance. L'exécutable du Hub, en mode Node, pilote ensuite la recette par le protocole
DevTools : aucun outil n'est à installer dans la sandbox. Les résultats (JSON, captures,
journaux) arrivent dans `.sandbox\results` (ignoré par git) ; `done.flag` marque la fin. Les
scripts sont dans `scripts/sandbox/`.

## M4 — Téléchargement et installation

| # | Étapes | Résultat attendu | Résultat |
|---|---|---|---|
| 4.1 | Installer le Hub depuis le bureau de la sandbox (`Nebula-Hub-Setup-x.y.z.exe`), puis le lancer. | SmartScreen peut avertir (installeur non signé). Le Hub démarre ; « Mes apps » affiche « Aucune app installée détectée ». | |
| 4.2 | Découvrir → Nebula Finterest. | Bouton « Installer Nebula Finterest » et la ligne sur SmartScreen. | |
| 4.3 | Cliquer sur « Installer ». | Phases visibles dans l'ordre : En attente, Téléchargement (octets, vitesse, temps restant), Vérification de l'intégrité, Prête, Installation, Vérification de l'installation, Installée. Badge sur « Téléchargements » pendant l'opération. | |
| 4.4 | Mes apps. | Finterest apparaît avec sa version (celle de la release), « Pour cet utilisateur » et son emplacement. « Ouvrir » la lance. | |
| 4.5 | Téléchargements. | La file affiche « Installée » ; l'historique contient la ligne « Réussie ». Le dossier `%LOCALAPPDATA%\Nebula Hub\downloads` ne contient plus l'installeur. | |
| 4.6 | Lancer l'installation de Nebula Clock, puis couper le réseau de la sandbox pendant le téléchargement (PowerShell admin : `Get-NetAdapter \| Disable-NetAdapter -Confirm:$false`). | Échec « La connexion a été interrompue… » ; le fichier `.part` reste dans `downloads`. | |
| 4.7 | Rétablir le réseau (`Get-NetAdapter \| Enable-NetAdapter -Confirm:$false`), puis « Réessayer ». | « Reprise du téléchargement » s'affiche ; l'installation se termine. | |
| 4.8 | Pendant un téléchargement, cliquer sur « Annuler ». | « Annulée » ; plus de fichier `.part` ; ligne « Annulée » dans l'historique ; rien n'est installé. | |
| 4.9 | Réglages → Dossier d'installation → choisir `C:\Apps`, puis installer une app. | L'app s'installe dans `C:\Apps\<nom du produit>` ; « Mes apps » affiche ce dossier. | |
| 4.10 | Téléchargements → « Exporter le journal ». | Un fichier JSON lisible avec les opérations (sans donnée personnelle des apps). | |
| 4.11 | Fermer puis relancer le Hub. | Le dossier `downloads` est vidé au démarrage ; l'historique est conservé. | |

Les cas d'erreur réseau et d'intégrité (taille fausse, empreinte fausse, redirection hors liste
blanche, coupure et reprise, serveur qui n'accepte pas la reprise) sont couverts par
`tests/electron/download.test.ts` ; ceux de l'installeur (code de sortie, délai dépassé, version
inattendue, app ouverte, annulation) par `tests/electron/install-manager.test.ts`. Le cas « app
ouverte » (« En attente de fermeture », le Hub ne ferme jamais l'app) concerne surtout les mises
à jour : sa recette réelle est en M5.

## M5 — Mises à jour, réparation, désinstallation [CRITIQUE]

Recette automatisée : `scripts/sandbox.ps1 -Recipe m5`, résultats dans
`.sandbox\results\m5-results.json` (verdicts `a`, `b`, `c`). Préparation faite par le script :

1. Le Hub est installé à blanc.
2. Finterest **0.1.35** est téléchargée depuis sa release, son SHA-512 est comparé à son
   `latest.yml`, puis elle est installée.
3. Le réseau de Finterest est bloqué par une règle de pare-feu de la sandbox. Sans cela, son
   updater intégré installerait la 0.1.36 tout seul en quittant, et la mise à jour testée ne
   serait plus celle du Hub.
4. Deux comptes sont créés par l'interface de Finterest : « Noé », avec un revenu, deux charges
   fixes, une dépense et un prêt, et « Démo », avec un revenu, une charge et une dépense. Les
   données attendues sont relues par Finterest elle-même.

| # | Étapes | Résultat attendu | Résultat |
|---|---|---|---|
| 5.1 (a) | Mise à jour de Finterest 0.1.35 vers la 0.1.36 par le Hub, confirmée. | Phases : téléchargement, vérification, **sauvegarde** (fichier horodaté dans `Documents\Nebula Finterest`, 2 comptes), installation `--updated /S`, version 0.1.36 relue dans le registre. Finterest rouverte : les deux comptes et **toutes** leurs données sont identiques. | |
| 5.2 (b) | Réparation de Finterest 0.1.36 par le Hub, confirmée. | Sauvegarde vérifiée, réinstallation `--updated /S`, données identiques. | |
| 5.3 (c) | Désinstallation de Finterest par le Hub, confirmée ; puis installation neuve par le Hub ; dans Finterest, recréer « Noé » puis importer la sauvegarde, recréer « Démo » puis importer la même sauvegarde. | La sauvegarde existe et contient les 2 comptes ; `%APPDATA%\Finterest` est supprimé par le désinstallateur de Finterest (annoncé dans la confirmation) ; après import, chaque compte retrouve exactement ses données (PIN et avatars ne sont pas sauvegardés par Finterest). | |
| 5.4 | Mettre à jour une app pendant qu'elle est ouverte. | « En attente de fermeture » ; rien ne se ferme seul. « Fermer <app> » envoie une demande de fermeture polie ; l'opération reprend dès que l'app est fermée. | |
| 5.5 | Sauvegarde impossible (par exemple, renommer l'exécutable de Finterest puis demander une réparation). | « Sauvegarde impossible » ; rien n'est modifié ; « Continuer sans sauvegarde » demande une seconde confirmation. | |
| 5.6 | Activer « Mise à jour automatique » pour Finterest. | Confirmation (sauvegarde avant chaque mise à jour) ; à la publication suivante, mise à jour quand Finterest est fermée. | |

**État au 2026-10-01** : recettes prêtes mais **non exécutées**. Windows Sandbox démarre puis perd
sa connexion avec la machine virtuelle (« La connexion à l'environnement Bac à sable Windows a
été perdue »). C'est le cas même pour une sandbox vide, sans dossier partagé ni commande ; la
machine de développement est elle-même utilisée en Bureau à distance. Les comportements sont
couverts par `tests/electron/install-manager.test.ts`, y compris un vrai processus qui reçoit
l'argument de sauvegarde avec des espaces et des accents dans le chemin.
