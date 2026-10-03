# Prompt : réparer le mode Hub et remplir tout l'écran dans les apps Nebula

**Symptôme constaté le 2026-10-04.** Une app ouverte dans le Hub affiche « … s'affiche ici », mais
la page n'apparaît jamais. Il suffit de forcer la fermeture du Hub pour que l'app se montre et
fonctionne.

**Diagnostic.** Le journal Link du Hub montre que tous les messages `nebula.hub.dock` sont bien
livrés aux apps. L'app reçoit donc sa place, mais sa fenêtre reste derrière celle du Hub.
Windows refuse en effet de faire passer devant (`moveTop`) la fenêtre d'un processus qui n'a
pas le droit de premier plan, ce qui est le cas de l'app dès que le Hub est actif.

**Les deux cas qui déclenchent le problème :**
- le Hub lance l'app : sa fenêtre normale prend le focus, puis elle la remplace par la fenêtre
  ancrée. Windows réactive alors le Hub, qui repasse par-dessus ;
- la fenêtre ancrée réapparaît après avoir été cachée : retour sur l'écran de l'app, changement
  d'app, restauration du Hub.

**Côté Hub, depuis la 0.2.3 (ADR-032).** Le Hub renvoie `raise` 0,4 s, 1,5 s et 3,5 s après
l'apparition de l'app, tant qu'il garde le focus. Il occupe aussi désormais toute la largeur de
l'écran, en gardant sa barre latérale. La correction de fond reste dans chaque app, avec ce
prompt.

## Mode d'emploi

Ouvre Claude Code dans le dossier de l'app (Nebula Finterest, Nebula Clock ou Nebula News), colle
le prompt ci-dessous, puis la ligne propre à l'app. Une app à la fois. La session présente son plan
et attend ton accord ; rien n'est poussé ni publié sans toi.

```text
Tu travailles dans le dépôt d'une app Nebula (Nebula Finterest, Nebula Clock ou Nebula News), une
app Electron Windows qui sait s'afficher « dans Nebula Hub » (mode Hub : événement Link
`nebula.hub.dock`, spécification docs/NEBULA_LINK.md § 17 du dépôt Memel-SQT/Nebula-Hub, à lire
avec son amendement du 2026-10-04 / ADR-032).

PROBLÈME À CORRIGER
En mode Hub, la fenêtre de l'app reste cachée derrière le Hub (« … s'affiche ici » sans page) ;
elle réapparaît seulement quand le Hub est fermé. Les messages du Hub arrivent bien. C'est
`moveTop()` qui échoue, parce que l'app n'a pas le droit de premier plan au moment de l'appel.

RÈGLES
- Lis CLAUDE.md, README et DEV_CHANGES, et suis les conventions du dépôt (format des commits,
  gestionnaire de paquets ; pour Clock : pnpm via corepack, commits conventionnels, et un push
  sur main publie une version, donc NE POUSSE PAS). Branche `fix/hub-mode-raise`.
- PLAN numéroté d'abord, puis attends mon accord. Ne touche ni aux données, ni au chiffrement,
  ni aux sauvegardes, ni à l'import, ni à installer.nsh.
- L'app reste 100 % utilisable sans le Hub.

À FAIRE
1. Une seule fonction `raiseDockedWindow(win)` dans le processus principal :
   `win.setAlwaysOnTop(true); win.moveTop(); win.setAlwaysOnTop(false);`
   (sans `focus()` : le focus reste là où l'utilisateur l'a mis).
2. Dans le traitement de `nebula.hub.dock` (`applyDock`) :
   - après la création de la fenêtre ancrée (premier passage en mode Hub), une fois la fenêtre
     affichée (`ready-to-show` → `showInactive()`), appelle `raiseDockedWindow` ;
   - à chaque `visible: true` : `setBounds(bounds)`, puis `showInactive()` si elle était cachée,
     puis `raiseDockedWindow` si elle était cachée OU si `raise` est vrai ;
   - à `visible: false` : `hide()` (inchangé) ;
   - `released` et perte du Hub : retour à la fenêtre normale (inchangé, toujours).
   Vérifie que la file d'attente des messages (`dock.busy`) ne peut jamais rester bloquée : un
   chargement de page qui échoue ne doit pas empêcher les messages suivants (try/finally).
3. La fenêtre ancrée ne doit jamais rester invisible : si elle est créée alors que l'app est
   encore en train de démarrer, elle doit tout de même s'afficher et être remontée.
4. Remplir tout l'écran :
   - en mode Hub (`?mode=docked`), et aussi sur les grands écrans en fenêtre normale, la page
     utilise toute la largeur disponible : pas de colonne centrée à largeur maximale. Les grilles
     ajoutent des colonnes (`repeat(auto-fit, minmax(…, 1fr))`) au lieu de laisser des marges ;
   - seuls les longs textes gardent une largeur de lecture ;
   - garde la barre latérale de l'app.
   Vérifie aussi les petites largeurs : la zone du Hub peut faire moins de 900 px. La page doit
   alors passer en mise en page compacte sans déborder ; la largeur minimale de la fenêtre ancrée
   reste celle déjà définie.
5. Tests : la fonction pure qui décide « remonter ou non » (caché → visible, `raise`), et le cas
   d'un chargement de page qui échoue. Typecheck, lint, tests, build.
6. Vérification réelle avec le Hub de test (dépôt Nebula-Hub) et des données JETABLES, sans
   jamais toucher à l'app installée de l'utilisateur. Lance le Hub de développement avec
   `NEBULA_HUB_USER_DATA_DIR`, puis l'app avec `NEBULA_LINK_SESSION_FILE` pointé sur le
   `link\session.json` de ce profil. Ensuite :
   a. ouvre l'app dans le Hub ;
   b. Retour à l'accueil, puis rouvre l'app ;
   c. passe à une autre app du Hub, puis reviens ;
   d. Alt+Tab vers une autre fenêtre, puis retour au Hub ;
   e. redimensionne, agrandis, réduis et restaure le Hub.
   À chaque étape, l'app doit être visible à sa place. Fais une capture d'écran à chaque étape.

RAPPORT FINAL en français : ce qui est fait, captures, commandes et résultats, écarts. Mets à
jour DEV_CHANGES (ou CHANGELOG) et le README si le comportement visible change.
```

**Ligne propre à chaque app (à coller après le prompt) :**
- **Nebula Finterest** : `APP : Nebula Finterest — applyDock et createWindow dans src/electron/main.ts ; données jetables : FINTEREST_USER_DATA_DIR.`
- **Nebula Clock** : `APP : Nebula Clock — applyDock et replaceMainWindow dans apps/desktop/src/windows.ts ; données jetables : --user-data-dir ; le mode compact (MiniApp) n'est jamais ancré.`
- **Nebula News** : `APP : Nebula News — applyDock, openWindow et replaceWindow dans desktop/main.js (CommonJS) ; replaceWindow n'est pas attendu (await) aujourd'hui, à vérifier ; données jetables : --user-data-dir.`
