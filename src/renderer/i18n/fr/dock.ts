// Apps inside the Hub (ADR-027).
export const dock = {
  'dock.eyebrow': 'Dans le Hub',
  'dock.openInHub': 'Ouvrir dans le Hub',
  'dock.openInHubNamed': 'Ouvrir {name} dans le Hub',
  'dock.mode': 'Ouvrir {name} dans le Hub plutôt que dans sa propre fenêtre',
  'dock.modeHint': '{name} s’affiche dans la zone de contenu du Hub et le suit ; la barre latérale reste là pour passer d’une app à l’autre. L’app reste la même, ses données aussi.',
  'dock.unsupported': 'Le mode Hub arrivera avec une prochaine version de {name} : pour l’instant, elle s’ouvre dans sa propre fenêtre.',
  'dock.starting': 'Ouverture de {name} dans le Hub…',
  'dock.slow': '{name} ne s’est pas placée dans le Hub : elle reste dans sa propre fenêtre. Vérifiez qu’elle est à jour, ou détachez-la.',
  'dock.shown': '{name} s’affiche ici.',
  'dock.closed': '{name} a été fermée.',
  'dock.reopen': 'Rouvrir {name}',
  'dock.release': 'Détacher dans sa propre fenêtre',
  'dock.back': 'Retour à l’accueil',
  'dock.failed': '{name} n’a pas pu s’ouvrir dans le Hub.',
  'dock.areaLabel': 'Zone de {name}',
} as const;
