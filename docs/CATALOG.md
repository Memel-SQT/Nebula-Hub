# Le catalogue de Nebula Hub

Le catalogue décrit les apps de la famille Nebula : textes, visuels, dépôt GitHub, et tout ce
qu'il faut au Hub pour détecter, installer, mettre à jour et désinstaller chaque app. Il est
**signé** (Ed25519) : un catalogue dont la signature est invalide est refusé (règle R03).

## Fichiers

| Fichier | Rôle |
|---|---|
| `catalog/nebula-catalog.json` | le catalogue source |
| `catalog/nebula-catalog.json.sig` | sa signature : 64 octets Ed25519 en base64, sur une ligne |
| `catalog/icons/*.svg` | icônes des apps (copies des marques officielles de chaque dépôt) |
| `catalog/screenshots/*.png` | captures d'écran (1 280 px de large, PNG) |
| `src/electron/catalog-key.ts` | la clé **publique**, embarquée dans chaque build du Hub |

La signature couvre **les octets exacts** du fichier JSON. Git est configuré pour ne jamais
toucher aux fins de ligne de ces deux fichiers (`.gitattributes`) : modifier le JSON, même d'un
espace, impose de le re-signer.

## Format (schéma 1)

Validé champ par champ par `src/shared/catalog.ts` (tests : `src/shared/catalog.test.ts`). Toute
erreur rejette le catalogue entier.

```jsonc
{
  "schema": 1,
  "generatedAt": "2026-10-01T12:00:00Z",   // ISO ; le plus récent l'emporte (anti-retour arrière)
  "apps": [
    {
      "id": "nebula.finterest",            // nebula.<nom> : identifiant stable (Link, nebula://)
      "name": "Nebula Finterest",
      "role": "hub",                       // facultatif : seulement l'entrée du Hub lui-même
      "tagline": { "fr": "…", "en": "…" },  // en facultatif, repli sur fr
      "description": { "fr": "…", "en": "…" },
      "category": "finance",               // finance | info | productivity | system
      "status": "stable",                  // stable | beta | coming-soon | deprecated
      "icon": "icons/finterest.svg",       // icons/ ou screenshots/, sans « .. », svg/png/webp/jpg
      "screenshots": ["screenshots/finterest-dashboard.png"],   // 8 au plus
      "source": { "provider": "github", "owner": "Memel-SQT", "repo": "Nebula-Finterest" },
      "windows": {
        "productName": "Nebula Finterest", // détection : DisplayName = productName (+ " version")
        "appId": "com.finterest.desktop",  // appId electron-builder (GUID de désinstallation)
        "exeName": "Nebula Finterest.exe", // nom de fichier seul
        "installScope": "user",            // user | machine | either
        "updateFeed": "latest.yml",        // asset electron-builder de la release
        "silentArgs": ["/S"],              // /X ou --flag ; --delete-app-data interdit (ADR-004)
        "selfUpdates": true,               // l'app embarque electron-updater
        "preOperationBackup": {            // facultatif : sauvegarde avant mise à jour, réparation, désinstallation
          "argument": "--backup-before-uninstall=",
          "documentsFolder": "Nebula Finterest",
          "filePrefix": "finterest-store-backup",
          "format": "finterest-backup-v1",
          "importArgument": "--import-backup="   // facultatif (ADR-026) : ouvre l'import de l'app sur un fichier
        }
      },
      "dataNotice": { "fr": "…", "en": "…" },          // affiché avant désinstallation ou réparation
      "link": { "manifest": "nebula.app.json", "minProtocol": 1 },
      "visibility": "installed-only",   // facultatif (ADR-033) : visible seulement si l'app est détectée
      "releases": { "provider": "gitea", "host": "git.rodriguesnoa.fr", "owner": "noa", "repo": "…", "prereleases": true, "updateFeed": "beta.yml" },   // facultatif (ADR-038) : releases lues sur un serveur Gitea de la liste autorisée (R05), préversions suivies, fichier de mise à jour propre ; ignoré par les Hubs plus anciens
      "extension": { "backgroundArgument": "--background", "minVersion": "0.5.0" },  // facultatif (ADR-034) : gardée en arrière-plan, ouverte dans le Hub
      "minHubVersion": "0.1.0"
    }
  ]
}
```

Le champ `minStoreVersion` du brief s'appelle `minHubVersion` (ADR-013). Les versions, notes,
tailles et empreintes des installeurs ne sont **pas** dans le catalogue : elles viennent de la
release GitHub de chaque app et de son `latest.yml`, lus à chaque synchronisation.

Une icône ou une capture modifiée doit changer de nom de fichier : le Hub sert en priorité la
copie incluse dans l'app, et ne télécharge que les fichiers qu'il n'a pas.

## Où le Hub lit le catalogue (ADR-010, ADR-019)

1. `https://raw.githubusercontent.com/Memel-SQT/Nebula-Hub/main/catalog/nebula-catalog.json` (+ `.sig`)
2. les assets `nebula-catalog.json` et `nebula-catalog.json.sig` de la **dernière release** du Hub
3. la dernière copie vérifiée, en cache dans `%APPDATA%\Nebula Hub\store.sqlite`
4. le catalogue signé **inclus dans l'app** (`resources\catalog\`)

Chaque copie est vérifiée (signature puis schéma), y compris le cache et la copie incluse. Parmi
les copies valides, celle dont le `generatedAt` est le plus récent l'emporte : rejouer un ancien
catalogue signé ne fait pas revenir le Hub en arrière. Si une source répond avec un catalogue
invalide, le Hub l'ignore et affiche un avertissement.

## Clé de signature

### Générer la paire (une seule fois)

```bash
npx ts-node --transpile-only -O "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" scripts/generate-catalog-key.ts "%USERPROFILE%\.nebula-hub\catalog-signing-ed25519.pem"
```

Le script refuse d'écrire dans le dépôt et n'écrase jamais une clé existante. Il affiche la clé
publique : la coller dans `src/electron/catalog-key.ts`.

**La clé privée ne doit jamais entrer dans le dépôt** (`.gitignore` exclut `*.pem` et `*.key` par
sécurité). Sauvegardez-la hors ligne (clé USB chiffrée, gestionnaire de mots de passe). La
perdre empêche de signer un nouveau catalogue jusqu'à la sortie d'un Hub portant une nouvelle clé
publique. La clé actuelle a pour empreinte (SHA-256 de la clé publique, affichée aussi dans les
réglages du Hub) :

```
E1D7 EF95 2C9E 268D 9CF2 F112 7C6D 013C FBE4 9362 CA21 406F 6C6B 4C06 2C54 6980
```

### Signer

```bash
set NEBULA_CATALOG_KEY=%USERPROFILE%\.nebula-hub\catalog-signing-ed25519.pem
npm run catalog:sign
```

Le script valide le catalogue (schéma et présence de chaque icône et capture), signe les octets
exacts, puis **re-vérifie** la signature avec la clé publique embarquée dans le Hub : une clé qui
ne correspond pas est détectée ici, pas chez les utilisateurs.

### Changer de clé

1. Générer une nouvelle paire.
2. Publier une version du Hub qui embarque la nouvelle clé publique.
3. Attendre que cette version soit installée, puis signer avec la nouvelle clé privée.

## Publier une modification du catalogue

1. Modifier `catalog/nebula-catalog.json` (et `generatedAt`, toujours plus récent).
2. `npm run catalog:sign`, puis `npm test` (le test vérifie que le catalogue du dépôt est valide
   et que tous ses visuels existent).
3. Commit des deux fichiers : dès qu'ils sont sur `main`, tous les Hub les voient à leur
   prochaine synchronisation (au plus 6 h, ou tout de suite avec « Actualiser »).
4. À chaque release du Hub, joindre `nebula-catalog.json` et `nebula-catalog.json.sig` en assets
   (source de secours n° 2).
