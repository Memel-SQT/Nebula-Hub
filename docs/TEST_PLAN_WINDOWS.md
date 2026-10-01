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

À compléter en M5 : les trois recettes de la section 7.6 du brief, avec un vrai compte Finterest
contenant des données.

- (a) Mise à jour de Finterest 0.1.35 vers la 0.1.36 par le Hub → données intactes.
- (b) Réparation → données intactes.
- (c) Désinstallation → la sauvegarde existe et s'importe dans une installation neuve : chaque
  profil est recréé avec le même nom, puis la sauvegarde est importée compte par compte (les PIN
  et les avatars ne sont pas sauvegardés par Finterest).
