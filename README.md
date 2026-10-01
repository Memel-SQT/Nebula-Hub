# Nebula Hub

**Toutes vos apps Nebula, au même endroit.** Nebula Hub lance, installe, met à jour et relie
les applications de la famille Nebula — Nebula Finterest, Nebula Clock, Nebula News — sur
Windows, sans compte et sans télémétrie.

> Projet en cours de développement (jalon M1 : squelette, direction artistique et
> personnalisation). Les fonctions d'installation, de mise à jour et d'intégration arrivent
> dans les jalons suivants.

## Ce que fait Nebula Hub

- **Un lanceur** : vos apps Nebula en un clic, depuis l'accueil, la barre latérale ou la zone
  de notification.
- **Un store** : le catalogue des apps Nebula, leurs versions et notes de version, avec
  installation, mise à jour, réparation et désinstallation vérifiées (SHA-512 contre la release
  officielle).
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
- Les notes de version sont publiées uniquement dans les releases GitHub.
