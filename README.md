# Nebula Hub

**Toutes vos apps Nebula, au même endroit.** Nebula Hub lance, installe, met à jour et relie
les applications de la famille Nebula — Nebula Finterest, Nebula Clock, Nebula News — sur
Windows, sans compte et sans télémétrie.

> Projet en cours de développement : le catalogue signé, les fiches des apps, la
> personnalisation, le lanceur, l’installation, les mises à jour, la réparation et la
> désinstallation sont en place, ainsi que le cœur de Nebula Link et son centre de
> consentements ; les widgets, le centre d’activité et l’adoption de Link par chaque app arrivent
> dans les jalons suivants.

## Ce que fait Nebula Hub

- **Un lanceur** : vos apps Nebula en un clic, depuis l'accueil, la barre latérale ou la zone
  de notification.
- **Un store** : le catalogue des apps Nebula, leurs versions et notes de version, avec
  installation, mise à jour, réparation et désinstallation vérifiées (SHA-512 contre la release
  officielle). Le Hub se met aussi à jour lui-même : un bouton dans la barre latérale quand une
  version est disponible, et à tout moment dans Réglages.
- **Nebula Link** : les apps se partagent l'apparence, des liens profonds, des widgets et des
  notifications — uniquement ce que vous autorisez, et rien ne quitte votre ordinateur.
- **Vos apps restent autonomes** : chacune s'installe, fonctionne et se met à jour seule. Le Hub
  est un plus, jamais une obligation, et vous pouvez passer de l'un à l'autre sans perdre vos
  données.

## Personnalisation

La même que Nebula Finterest, partagée avec toute la famille :

- 4 thèmes : Nebula sombre, Nebula clair, Verre sombre, Verre clair (ou « Système ») ;
- 6 couleurs d'accent (Nebula, Aurore, Océan, Couchant, Sakura, Braise) ou deux couleurs libres ;
- 6 arrière-plans animés : halo nébuleuse, aurore boréale, champ d'étoiles, constellation,
  vagues, aucun ;
- 3 niveaux d'animation (complètes, réduites, désactivées), en plus du réglage du système ;
- des sons d'interface synthétisés, réglables ou désactivables.

Les fonds animés s'arrêtent dès que la fenêtre est cachée dans la zone de notification.

## Installation

Téléchargez `Nebula-Hub-Setup-<version>.exe` depuis la page
[Releases](../../releases) et lancez-le : l'installation se fait pour votre utilisateur, sans
droits administrateur.

L'installeur n'est pas signé par un certificat de développeur : Windows SmartScreen peut
afficher « Windows a protégé votre ordinateur ». Cliquez sur **Informations complémentaires**,
puis **Exécuter quand même**.

## Vos données et votre vie privée

- Aucun compte, aucune télémétrie, aucune statistique d'usage.
- Les réglages du Hub sont dans `%APPDATA%\Nebula Hub\`.
- Le Hub ne lit jamais les données des autres apps : une information ne lui parvient que si
  l'app la propose via Nebula Link et que vous l'avez autorisée.
- Le réseau ne sert qu'à lire le catalogue signé et à télécharger les installeurs, sur une liste
  fermée d'adresses GitHub.
- Chaque installeur est vérifié (taille et empreinte SHA-512 publiées avec la release) avant
  d'être lancé. Il est téléchargé dans `%LOCALAPPDATA%\Nebula Hub\downloads\`, puis supprimé
  après l'installation ; ce dossier est vidé à chaque démarrage du Hub.
- Le Hub ne ferme jamais une app à votre place : si elle est ouverte, il attend que vous la
  fermiez (ou lui envoie une simple demande de fermeture, si vous le demandez).
- Une mise à jour, une réparation ou une désinstallation qui touche à vos données demande votre
  confirmation, avec ce qui va se passer. Avant, l'app sauvegarde elle-même vos données (Nebula
  Finterest : dans `Documents\Nebula Finterest`), et le Hub vérifie cette sauvegarde ; si elle
  échoue, rien n'est modifié sans votre second accord.
- Les mises à jour automatiques sont désactivées par défaut, et se règlent app par app.

## Développeurs

Electron 44, React 18, TypeScript, Vite, tsup, Jest. Node 22.12 ou plus récent.

```bash
npm install
npm run dev        # développement
npm run typecheck && npm run lint && npm test && npm run build
npm run dist:win   # installeur Windows dans install/windows/
```

- Architecture et règles pour les agents : [`CLAUDE.md`](CLAUDE.md)
- Décisions techniques : [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Journal des changements techniques : [`DEV_CHANGES.md`](DEV_CHANGES.md)
- Le catalogue des apps et sa signature : [`docs/CATALOG.md`](docs/CATALOG.md)
- Recette manuelle dans Windows Sandbox : [`docs/TEST_PLAN_WINDOWS.md`](docs/TEST_PLAN_WINDOWS.md)
  (`scripts/sandbox.ps1` ouvre une sandbox avec l’installeur fraîchement construit ;
  `-Recipe m4` ou `-Recipe m5` y déroule la recette automatiquement)
- Les notes de version sont publiées uniquement dans les releases GitHub.

### Publier une version

La CI (GitHub Actions) vérifie chaque push. Pour publier, il suffit d’un tag annoté dont le
message contient les notes de version :

```bash
npm version 0.2.0 --no-git-tag-version   # puis commit
git tag -a v0.2.0 -F notes.md
git push origin main v0.2.0
```

Le workflow `release.yml` construit l’installeur et publie la release avec `latest.yml` (mises à
jour automatiques du Hub) et le catalogue signé. Une version `-beta.N` part en pré-version.

### Nebula Link et son SDK

La spécification du protocole est dans [`docs/NEBULA_LINK.md`](docs/NEBULA_LINK.md), le SDK des
apps dans [`packages/nebula-link`](packages/nebula-link) (voir son README). Le banc d’essai se
lance avec `npm run link:demo`. Le SDK se publie par un tag `link-vX.Y.Z` (workflow
`link-release.yml`), en release non marquée « latest » pour ne pas gêner les mises à jour du Hub.
