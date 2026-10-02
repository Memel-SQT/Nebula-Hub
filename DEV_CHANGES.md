# DEV_CHANGES — Nebula Hub

Technical log, newest session first. Release notes live only in the GitHub release body.

## [2026-10-02] - Nebula Hub Session #12 — M8: the three apps adopt Nebula Link; 0.2.0

- **The user asked for the three apps to be updated with everything requested, then a release.** Done one repository at a time, each on `feat/nebula-link` following its own conventions, then merged and released:
  - **Nebula Finterest 0.1.37**:
    - the sync folder becomes a copy only, local profiles being the reference;
    - backups in `Documents\Nebula Finterest`, `--import-backup=` with confirmation, latest backup offered after a reinstall, uninstall asking instead of blocking;
    - Link: private widget, private charge notifications, appearance, deep links, updates by the Hub, Hub mode;
    - Electron 44.
  - **Nebula Clock 1.2.0** (semantic-release):
    - Link: focus widget, break start event, notifications to the activity center, appearance, deep links, updates by the Hub, Hub mode;
    - the main window runs sandboxed;
    - Electron 44.
  - **Nebula News 0.3.0**:
    - Next.js 14 → 15.5.27, fixing critical advisories including an unauthenticated RCE on Windows-hosted Next servers;
    - Link: headlines widget, "briefing ready", Nebula language, `news.open-briefing`, Hub mode;
    - desktop shell hardened (single instance, no navigation away, http(s)-only external links);
    - installer `Nebula-News-Setup-<v>.exe` with `latest.yml`, so it is installable from the Hub.
- **Every app checked end to end against the Hub's Link server in test mode** with the new driver `tests/link-harness/e2e-app.ts` (the app pointed at it with `NEBULA_LINK_SESSION_FILE`, throwaway data). Checked: admission with the real manifest, widgets with real data (null while Finterest is locked), notifications delivered once, Hub mode placing the window exactly at the bounds sent, release, in-app "Détacher", and the Hub disappearing while docked.
- **Hub**: an app unsubscribing from `nebula.hub.dock` ("Détacher" in the app) is forgotten at once (`onSubscribe` resync); spec § 17 amended accordingly.
- **Catalog** (re-signed): Finterest `importArgument: --import-backup=`, News `stable` with its Link manifest, the Hub `stable`.
- **CI fixes in the apps**:
  - Clock's Linux build failed with electron-builder 26 (executable name derived from the scoped package name): explicit `linux.executableName`;
  - Finterest's installer workflow failed on every tag since 0.1.36 (electron-builder publishing on its own in CI): `--publish never`.
- Version 0.2.0 (stable).

## [2026-10-02] - Nebula Hub Session #11 — Audit, SDK 1.0.0 and 0.2.0-beta.2

- **Audit** of everything since 0.2.0-beta.1 (M7, ADR-026, ADR-027). Fixed:
  - every launch (window, tray, Link intents, Hub mode, import) goes through one path that refuses while an install, update, repair or uninstall of that app runs (`LaunchResult` `busy`, `InstallManager.isBusy(appId)`); import refused then too;
  - clicking a Windows notification with an app link opened the Hub as well: an app link now opens only the app, a Hub link its screen, Home otherwise;
  - a backup copy folder equal to Documents made a failed "copy onto itself": no copy then;
  - a folder refused by the settings (network `\\server\share` path, too long) was silently ignored by both folder pickers: the Hub now says why;
  - the Hub mode counted an app whose `nebula.hub.dock` pair the user turned off as reachable (`subscribersOf` now applies the consent);
  - the docked area could be measured during the page animation (8 px off) and was not re-measured when a banner appeared above it: no animation on that screen, body observed too;
  - a late "installer download" progress event could leave the button in its busy state: progress only for downloads in flight;
  - the unused ESLint directive of the Link demo (the only lint warning).
- `npm audit`: no vulnerability in runtime dependencies; one low advisory on esbuild's own development server (`esbuild --serve`, unused here: Vite serves the renderer), whose fix needs esbuild 0.28, outside Vite 7's range: not forced.
- Checks: typecheck, lint (0 warning), 934 tests, build, `dist:win`, packaged build started on a throwaway profile, SDK archive installed in a bare project (CJS and ESM, DockV1).
- Version 0.2.0-beta.2 published as a GitHub pre-release (v0.1.0 stays latest); SDK `@nebula/link` 1.0.0 published (`link-v1.0.0`, not latest; the downloaded archive is byte-identical to the local build). The SDK workflow, run for the first time, cut the tag one character short (`v1.0.0`): fixed, tag recreated before any release existed.

## [2026-10-02] - Nebula Hub Session #10 — Apps inside the Hub (docked windows)

- **Decision** (ADR-027, validated by the user): an app opened "inside the Hub" keeps its process, window and data; its frameless window lies over the Hub's content area and follows it. Spec amended (`docs/NEBULA_LINK.md` § 17, schema `DockV1`).
- **Protocol**: Hub capability `nebula.hub.dock` (event, public, DockV1: `docked` with `visible`, `raise` and integer DIP `bounds`, or `released`), never broadcast: `LinkServer.sendTo` delivers to one connected, subscribed, allowed app; `subscribersOf`; a (re)subscription triggers a resync.
- **Hub**: `shared/dock.ts` (bounds from the content-relative area, payload, `supportsDock` from the installed manifest), `link/dock.ts` (`DockController`: show launches the app if needed, one visible app at a time, follows move / resize / minimize / restore / focus with `raise`, nothing re-sent when nothing moved, forgets an app the user quit, releases everything when the Hub quits), window geometry listeners and content bounds, IPC get / show / area / release.
- **UI**: `docked` screen (slim bar with Detach and Back to Home, measured area reported on every layout change and cleared when left; starting / too slow / closed states), per-app "Open inside the Hub" switch and button on the app page (or a note when the app is not compatible yet), the launcher follows the choice; setting `openInHub`.
- **Prompts**: Hub mode section for the apps (frameless window, `showInactive`, `moveTop` on raise, always back to the normal window on `released` or lost connection, Detach button).
- Tests: geometry and DockV1 schema, controller (launch then place, follow, tabs, release, quit, refusals), two bench scenarios over real pipes (targeted delivery and window following; pair turned off), App (switch only for compatible apps, launch inside the Hub, own window when off, detach).

## [2026-10-02] - Nebula Hub Session #9 — User feedback: app data, installers, wide layout

- **Backup choice** (ADR-026, amends ADR-022): the confirmation of an update / repair / uninstall of an app that backs up has a "back up first" box, ticked; unticked, it states what happens to the data, renames the button and turns the dialog to danger. `enqueue(..., { skipBackup })` only with the confirmation, never for automatic updates; backup state `declined`.
- **Root folder + copy**: backups stay in `Documents\<app>`; setting `backupCopyDirectory` (Settings → Backups) receives a byte copy in `<folder>\<app>\<same file>`; a failed copy is reported, never blocking (`copyPath`, `copyState`, plan `backupCopyPath`).
- **Export / import** on the app page: `InstallManager.exportData` (backup now, checked, copied; refused during an operation); import picks a file from the root folder, checks its shape, then opens the app on it when the catalog declares `importArgument` (new optional field of `preOperationBackup`), else opens the app, shows the file and the steps.
- **Download the installer** (`install/save-installer.ts`): same download and SHA-512 check as an install, then a copy in Downloads without overwriting (`name (2).exe`), progress pushed to the page; nothing run. `shell:reveal-file` only shows files the Hub wrote or checked in the session.
- **Install in one click** from Discover and launcher tiles.
- **Layout**: every screen's content is a centered column (1480 → 2280 px as the screen grows), text base 17–18 px above 2400 px, fluid KPI grid, wider launcher tiles; no overflow from 760 to 3440 px (CDP viewport emulation).
- **`docs/PROMPT_APPS.md`**: prompt to paste in each app's repository (update and audit, Nebula Link, root backup folder with copy-only sync folder, headless backup, `--import-backup=`, publication), with Finterest, Clock and News sections.
- **Proposal** (to validate): apps "inside the Hub" as docked windows driven by Link (ADR-026).
- Tests: manager (declined backup, never without confirmation or for auto updates, copy, failed copy, export), save-installer, catalog import switch, App (unticked backup, tile install, export / import / reveal, installer download, copy folder).

## [2026-10-02] - Nebula Hub Session #8 — M7: the Hub

- **Widgets (I3)**: `WidgetBoard` (`src/electron/link/widgets.ts`) reads every `widget` capability of the admitted apps as `nebula.hub` through the Link server, at connection then at the declared interval (min 30 s, 5 min default, 30 s retry while a connected app is not ready); undecided or refused private widgets are not polled again until their consent changes; nothing is read while the window is hidden, and private values are dropped then. Values only in memory; the order is a setting (`widgetOrder`). Pure rules in `shared/widgets.ts`.
- **Activity center (I5)**: `LinkHub.addActivity` stores app notifications and the Hub's own finished operations (from the install history, under `nebula.hub`, deep link to Downloads); unread = newer than `activitySeenAt`; erasable all / per app. `shared/activity.ts`: unread count, relay rule, toast content.
- **Windows notifications** (`notifier.ts`): relayed when the Hub is not focused, global switch and per-app mute; private notifications show only the app name and a neutral sentence; consent requests while hidden are announced; a click routes the deep link or opens Home / Integrations. Main-process strings take parameters.
- **Main**: window visibility listeners (widgets pause and forget private values when hidden), IPC for widgets, activity and deep links, tray entry for unread activity.
- **UI**: Home rebuilt (KPI row with connected apps, updates, launcher and widgets in the main column, activity center as a sticky side panel, stacked under 1100 px); widget cards (WidgetV1 templates, masked private values with blur reveal, consent buttons, offline → launch the app, refresh, deep link, drag and drop, keyboard move buttons with a live announcement); activity panel; first-launch dialog (3 steps, skippable, Escape, focus on each title, yes/no radio groups); Settings: start with Windows, notifications (global, per app), Advanced (erase history with confirmation, show the welcome again). Icons eye, eyeOff, grip, rocket.
- **Tests**: shared rules (widgets, activity, settings, main strings), two bench scenarios over real pipes (private widget: consent asked, granted, read, forgotten when hidden; widget offline when its app leaves), App tests for keyboard and screen-reader paths (widget move with announcement, masked value, consent, offline launch, activity, erase with confirmation, mute, start with Windows, first launch by keyboard and Escape).
- **Live check** (dev Hub, throwaway folder): first launch with the real detected apps; injected widgets and activity rendered at 1280, 1050 and 1900 px without horizontal overflow.
- Validation: typecheck, lint, tests, build.

## [2026-10-01] - Nebula Hub Session #7 — M6: Nebula Link

- **Specification** `docs/NEBULA_LINK.md` written, validated with the user's decisions (ADR-023: renames to `clock.*` / `nebula.hub.present`, non-blocking consent, private notifications kept 30 days and erasable, no global pause, sandbox recipes set aside), then completed with implementation notes (§ 16, ADR-024).
- **`@nebula/link`** (`packages/nebula-link`, zero dependency): NDJSON framing with a 256 KiB limit that drops oversized lines without desynchronizing, JSON-RPC classification, mutual HMAC-SHA256 handshake (the token never travels; the client checks the Hub too), session file parser, manifest parser (`nebula.app.json`, app-prefixed ids, typed deep link params), schema registry (AppearanceV1, WidgetV1, NotificationV1, HeadlinesV1, FocusTodayV1, BreakStartedV1, PresenceV1, EmptyV1), `nebula://` parser (`.`/`..` refused), `--nebula-intent` encoding, and the client (`connect` never throws, offline with exponential backoff, provide/on/emit/notify/query/intent/onIntent, schema checks on both sides). Built by tsup to CJS + ESM + types; `npm run link:pack`; `link-release.yml` for `link-v*` tags (not marked latest).
- **Hub server** (`src/electron/link/`): named pipe per user (SHA-256 of the SID), session file with a fresh token, admission = catalog + installed + installed manifest hash; routing of queries (consent, provider readiness, 5 s timeout, result schema), events (fan-out per consent, notification events to the activity center), intents (connected → Link, else launch with `--nebula-intent`, else app page), notifications, `hub.open`; limits (3 invalid messages, 100 msg/s, 60 s idle); journal without content. Consents in `store.sqlite` (migration 3), archived on uninstall and restored on reinstall; notifications stored 30 days.
- **Main**: Link started with the Hub (dev runs get their own pipe), appearance broadcast on every change (I1), presence (I6), `nebula://` protocol registered when packaged and routed from the command line and `second-instance`; launcher accepts the intent argument.
- **UI**: Integrations screen (pending requests, matrix app × capability with a switch per pair, default, refuse all for an app, last exchange), real Link indicator in the sidebar and on Home; shared `Route` type for navigation requests from the main process.
- **Test bench** `tests/link-harness/`: test-mode Hub, fake apps Alpha (provider) and Beta (consumer) on the real SDK, raw client; 29 scenarios over real pipes (each capability kind, consent ask/grant/deny/revoke, absent Hub then reconnection, fake Hub, fake clients, invalid / oversized / flooding messages, deep links); `npm run link:demo` narrates them.
- **Live check** (dev Hub, throwaway folder): session file and pipe created, Link listening, sidebar "Link prêt", a client posing as Finterest refused (no installed manifest yet) and offline without error, `nebula://hub/downloads` from a second instance opens Downloads, matrix rendering checked with an injected view; no console error.
- Validation: typecheck, lint, tests, build, dist:win, SDK built and installed from its archive in a bare CommonJS project.
- **Layout** (user feedback): the splash was a relative block stuck to the top (shared app.css rule since M1) and is centered again; compact mode under 1100 px (icon rail sidebar, labels kept for screen readers), shorter cards and paddings on low windows, window sized to the screen it opens on (min 720 x 520), sidebar items spaced out. No horizontal overflow measured at 1280, 1050, 820 and 720 px on every screen.
- **Fixes**: the M6 commit lacked the new workspace in package-lock.json (CI red); fixed.
- **v0.2.0-beta.1** published as a GitHub pre-release (installer, blockmap, latest.yml, signed catalog); v0.1.0 stays the latest stable release.

## [2026-10-01] - Nebula Hub Session #6 — M5: updates, repair, uninstall, data protection

- **State machine** (ADR-022): new phases `backing-up`, `backup-failed`, `removing`; repair enters through `repairing`, uninstall through `uninstalling`; no cancel while an installer or uninstaller runs; every pair of the 17 phases tested. `needsConfirmation` (repair, uninstall, update of an app with `preOperationBackup`), `OperationPlan` for the confirmation screen.
- **Pure modules**: `shared/backup.ts` (timestamped backup path, single `--flag=<path>` argument, shape-only validation of `finterest-backup-v1`, R07), `shared/uninstall-command.ts` (registry command line to an execFile array: absolute `.exe` inside the app folder, plain switches only, `/S` added, `--delete-app-data` refused).
- **InstallManager**: update and repair with `--updated /S` (never `/D`), version re-read after the app is closed (self-updated apps finish without an installer), registry re-read up to 5 times after an update; app backup after closing, file checked, `backup-failed` waits for cancel or a second confirmation; uninstall with the quiet command then waits for the registry key to go; one polite close request on user demand (`taskkill /IM` without `/F`, R08); plans keep the exact backup path shown on screen; automatic updates (opted-in, closed apps, never waiting, a failed version is not retried in the session). The main process refuses unconfirmed destructive operations.
- **Settings**: `autoUpdate` per app (off by default, field-by-field parsing).
- **Main / tray**: IPC plan / start / request close / continue without backup / navigate; debounced automatic updates after catalog and detection settle; tray tooltip with the update count, "Updates available (n)" opening My apps, "Check for updates".
- **UI**: accessible confirmation dialog (focus on Cancel, focus trap, Escape) with data notice, exact backup path and open-app warning; second confirmation before continuing without backup; confirmation once when turning automatic updates on for an app that backs up; "Updates available" panel on Home and My apps with "Update all" (one combined confirmation); update / repair / uninstall actions on My apps and the app page; automatic update switch per app; operation status for backup, failed backup, close request, removal and each kind of end.
- **Sandbox kit** moved to `scripts/sandbox/` (versioned): `scripts/sandbox.ps1 -Recipe m4|m5` maps the installer and kit read-only and `.sandbox\results` writable; the Hub executable runs the recipes as Node over CDP. `m5.mjs` automates the three [CRITIQUE] tests (Finterest 0.1.35 checked against its latest.yml, its self-updater blocked by a sandbox firewall rule, two accounts with data, update, repair, uninstall + import account by account, data read back through Finterest's own bridge).
- **Blocked**: Windows Sandbox (now enabled) loses its connection to the VM about 45 s after start, even bare (no mapping, no command); the development machine is used over Remote Desktop. The M4 recipe and the three [CRITIQUE] tests are therefore not run yet.
- **Live check** on the development machine, read-only: plans (backup path under the real Documents, repair unavailable for Finterest 0.1.35, uninstall plan for Clock), unconfirmed uninstall refused by the main process, dialogs opened and cancelled, injected queue for the backup-failed and waiting states; no operation started, no console error.
- Validation: typecheck, lint, 768 tests, build, dist:win.

## [2026-10-01] - Nebula Hub Session #5 — v0.1.0 published, M4: download and install

- **v0.1.0** published on GitHub by an annotated tag (release workflow green: installer, blockmap, latest.yml, signed catalog). The workflow now fetches the tag object explicitly before reading its message (actions/checkout may leave a tag without its annotation).
- **State machine** (`src/shared/install-state.ts`, ADR-021): brief §7.2 table, `transition` throws on illegal moves, tested on every pair of phases; operation, history and downloads view types; `restingPhase` from the detection.
- **Installer arguments** (`src/shared/installer-args.ts`): ADR-004 arrays, `/D=` last and only for a safe user-chosen folder, `--delete-app-data` refused; `progress.ts` (speed over a sliding window, time left).
- **Downloader** (`src/electron/net/download.ts`): streaming to `.part`, allowlist on every redirect hop, size cap from latest.yml, HTTP Range resume (restart from zero when the server ignores or misanswers it), stall timeout, cancel; `verifyFile` checks size + SHA-512 and deletes a bad file. `http.ts` exports its user agent and offline codes.
- **InstallManager** (`src/electron/install/`): one operation at a time; download → verify → rename → wait for the app to be closed by the user (never closed by the Hub) → silent install → detection decides; failures mapped to plain-language reasons; cancel until the installer starts; history in `install_history` (migration 2); downloads folder emptied at startup, installer deleted after success. `spawnInstallerRunner`: spawn without shell, stops waiting after 10 min without killing.
- **Settings**: `installDirectory` (null = each installer's default), picked with the Windows folder dialog, validated field by field.
- **UI**: Install button on the app page with the SmartScreen line until the first success; live operation status (phase, progress bar animated with `transform` only, bytes, speed, time left, resumed, waiting for the app, verified, failure reason, retry, cancel, dismiss); state chip and tiles show the operation; Downloads screen rewritten (counts, queue, history, JSON journal export); sidebar badge on Downloads; Settings install folder.
- **Sandbox kit**: `scripts/sandbox.ps1` (generates the .wsb in %TEMP%, installers mapped read-only) and `docs/TEST_PLAN_WINDOWS.md` (M4 recipe, M5 placeholders). Windows Sandbox is not enabled on the development machine.
- **Live checks**: real Finterest 0.1.36 installer downloaded from GitHub, cut at 40 %, resumed with Range in 2.5 s, SHA-512 equal to the release latest.yml, tampered copy refused and deleted (nothing executed). In the dev Hub: install refusals (already installed, Hub, no installer, unknown app) from the real manager; queue, progress, failure, history, settings and app page rendered with a view injected through the main-process inspector; no console error.
- Validation: typecheck, lint, 600 tests, build, dist:win.

## [2026-10-01] - Nebula Hub Session #4 — M3: detection and launch

- **Detection** (ADR-003, ADR-020): `reg.exe export` (UTF-16LE) of the Uninstall keys, HKCU then HKLM then HKLM WOW6432Node, parsed by the pure `src/shared/reg-file.ts` (escaped strings, dword, hex(2) expand strings) and matched by `src/shared/detection.ts` (`DisplayName` = productName or productName + space; location from `Software\<key>\InstallLocation`, else the UninstallString folder; version from `DisplayVersion`). Fixtures are anonymized real exports plus a synthetic HKLM 32-bit one.
- **InstalledAppsService** (`src/electron/apps/`): Windows access behind a `SystemProbe` interface (reg export, tasklist, file exists, detached spawn), so the service is tested without Windows. Detections are serialized and debounced; triggers: startup, catalog change, window focus, 2.5 s after a launch, manual refresh. Launch path rebuilt in main from the detected location and the signed catalog's exeName, checked absolute, inside the location and existing; no arguments, no shell. Uninstall commands never leave the main process.
- **UI**: My apps rewritten (version → available update, scope, location, broken install warning, Open / Show folder / See page, redetect, available apps); Home and sidebar act as a launcher (one click opens an installed app, running dot); app page shows the installed version and Open / Show folder; tray menu gets "Launch <app>" entries; failed launches explained in plain language.
- **Live check** (dev build, throwaway data folder): Finterest 0.1.35, Clock 1.1.3 and News 0.1.0 detected with version, scope and location in about 0.8 s; Finterest launched through the Hub and seen running afterwards; unknown app and the Hub itself refused; no uninstall string reaches the renderer; no console error.
- Validation: typecheck, lint, catalog:verify, 305 tests, build, dist:win (116 MB installer). CI green on GitHub.

## [2026-10-01] - Nebula Hub Session #3 — M2: signed catalog

- **Catalog format** (`src/shared/catalog.ts`, schema 1, documented in `docs/CATALOG.md`): strict field-by-field validation; every remote string that can reach a path or a command line is checked (asset paths limited to `icons/`|`screenshots/` without traversal, bare `.exe` names, installer switches allow-listed and `--delete-app-data` refused, backup folder a single safe name). `minHubVersion` replaces `minStoreVersion`; `role: "hub"` marks the Hub entry; `windows.preOperationBackup` is structured (Finterest first).
- **Signature (R03)**: Ed25519 over the exact file bytes with node:crypto; public key embedded (`src/electron/catalog-key.ts`), private key generated outside the repo (`scripts/generate-catalog-key.ts`), `npm run catalog:sign` validates, signs and re-verifies with the embedded key. `.gitattributes` keeps the signed bytes untouched.
- **Network (R05)**: `src/electron/net/http.ts`, node:https with manual redirects checked hop by hop against `src/shared/net-policy.ts` (HTTPS only, exact hosts, no credentials, no custom port), size and time caps, ETag, distinct error codes (blocked, offline, timeout, too large, status, rate-limited). Tested against a local server.
- **CatalogService** (ADR-019): sources raw → latest Hub release → verified cache → signed catalog bundled in the app (extraResources); newest `generatedAt` wins (no rollback); rejected remote copies raise a visible warning. Per app: GitHub releases API with conditional requests, channel-aware pick (highest semver; beta includes pre-releases), `latest.yml` parsed strictly (`src/shared/latest-yml.ts`) and cross-checked with the release (version, asset name, size, SHA-512). 6 h cache in `store.sqlite` (sql.js, additive migrations, Finterest persistence pattern), full display offline.
- **Renderer**: Home, Discover and the app page now come from the catalog (the bundled `family.ts` of M1 is gone). App page: version, date and size, screenshot carousel (lazy, declared paths only), release notes rendered from `marked` tokens to React — no HTML from the network, https links only through the main process, images reduced to alt text, duplicated leading title dropped (ADR-005) — data notice, self-update note, source link, plain-language release issues. Settings: channel (stable/beta), last sync, source shown, ordered sources, key fingerprint, refresh.
- **Live check** (packaged app, throwaway data folder, real GitHub): Finterest 0.1.36 and Clock 1.1.3 read with their installers (name, size, SHA-512 from latest.yml); News has no stable release (expected); the Hub repo does not exist yet, so the bundled signed catalog is shown; no console error.
- Validation: typecheck, lint (now including scripts/), 275 tests, build, dist:win.
## [2026-10-01] - Nebula Hub Session #2 — logo choice (end of M1)

- Mark **B — Orbit** chosen (ADR-018): `CURRENT_MARK = 'b'`, with an optical small variant (thicker outlined tiles and star, no orbit or dust) used up to 32 px, including the 16–32 px frames of `build/icon.ico`.
- Tray: monochrome glyphs without plate, `assets/tray-dark.png` (white) / `tray-light.png` (dark) + @2x, picked from `SystemUsesLightTheme` (system mode, read with `reg.exe query` through execFile, pure parser `src/shared/registry-dword.ts` + tests) and refreshed on theme changes.
- Observed on the development machine: Windows reports `prefers-reduced-motion: reduce` (laptop power saving or animation effects off). As the brief requires, the Hub then shortens the splash to 250 ms and freezes the backgrounds whatever the in-app level; the M1 checks emulated the preference where needed.
- Validation: typecheck, lint, 149 tests, build, dist:win.

## [2026-10-01] - Nebula Hub Session #1 — M0 discovery, M1 skeleton and design

- **M0 (read-only discovery)**: `docs/DISCOVERY.md` and ADR-001…011. Key findings: the
  "Pomodoro" is Nebula Clock (`nebula-clock`, v1.1.3); the DA source of truth is the
  `nebula-design-system` repo (the old `Nebula/` repo and `NEBULA_DESIGN.md` are gone);
  `InstallLocation` lives in `HKCU\Software\<GUID>`, not in the Uninstall key, and the GUID is
  `UUIDv5(appId, 50e065bc-…)`; `reg query` output is OEM-encoded (hence `reg export`, ADR-003); the
  exact NSIS update arguments and their dangers are documented in ADR-004 (a silent installer
  kills the running app; NSIS uninstallers return before finishing). Gitea is Tailscale-only.
- **Decisions taken with the user** (ADR-012…016): product renamed **Nebula Hub**
  (`hub.nebula.desktop`, `%APPDATA%\Nebula Hub`) and positioned as the family launcher; full
  personalization in every app via `@nebula/design` (M8); standalone ↔ Hub migration
  (reinstall with `--updated`, data kept); backups exported by each app through the Hub
  (complete or per-app).
- **Tooling** (ADR-001): Electron 44.5.1, electron-builder 26.15.3, TypeScript 5.9 (ts-jest refuses
  7), Vite 7, Jest 29, ESLint 9 with typescript-eslint + react-hooks (stricter than Finterest's
  parser-only config) and a rule forbidding `exec`/`execSync` (R11). npm 11's install-script gate
  requires `allowScripts` for electron and esbuild.
- **Hardening (R10)**: sandbox everywhere (`app.enableSandbox`), contextIsolation, no
  nodeIntegration, webSecurity, build-time CSP with `connect-src 'none'`, every permission
  denied, no webview / navigation / new window in any web contents, no application menu,
  single-instance lock, IPC answered only for the app's own document (`isTrustedSender`), one
  typed preload bridge `window.nebulaHub`, external links only `https:` without credentials.
- **`packages/nebula-design`**: Finterest v0.1.36 lot ported (theme, appearance, sound, effects,
  BackgroundFx, Icon, splash, CSS), each file stating its origin and adaptations: no `old-*`
  themes (kept as a `frozenTheme` parameter), storage left to the host app, glass surfaces opt
  in with `.nebula-surface`, `data-no-ripple` instead of Finterest's class exclusion,
  `setSoundsSuppressed` and a `paused` prop on `BackgroundFx` for an app that lives in the tray,
  a frame counter for diagnostics. `NebulaAppearance` (+ `parseNebulaAppearance`) is the I1
  broadcast object. Deliberate deviation: a `null` volume falls back to 45 % instead of
  muting (Finterest's `Number(null)` gave 0). 12 new icons drawn in the same style.
- **App**: settings in `settings.json` (atomic, serialized, parsed field by field), splash skipped
  when started hidden (`--hidden`), close-to-tray, minimal tray, launch at login wiring,
  frameless window with themed `titleBarOverlay` updated on every theme change, themed
  scrollbars. Screens laid out in Finterest's dashboard grammar (KPI cards with colored top
  border, panels with eyebrow and pill, snapshot rows, app tiles), each with loading / empty /
  offline / error states; Discover with category filter and accent-insensitive search; the
  family list is bundled until the signed catalog (M2). Sidebar without a hard edge: a masked,
  blurred veil lets the theme run under it.
- **Logo**: three proposals (`docs/logo/`, `proposals.html`), built for the splash choreography,
  with star glow and star dust; app icons generated from proposal A until the user's choice.
- **Bug found while testing**: a `window.close()` from the page destroyed the window and the tray
  could not bring it back; "open" now recreates the window when needed.
- **Validation**: typecheck, lint, 146 tests, build, `dist:win` (107.5 MB installer, icon
  embedded without Finterest's rcedit workaround). The **packaged** app was driven over the
  DevTools protocol on a throwaway `NEBULA_HUB_USER_DATA_DIR`: every theme, accent (dark and
  light), background, motion level, sound control, glass highlight, language and reset — no
  console error, no CSP violation. Canvas background: 481 frames in 2 s visible, **0 in 3 s
  hidden in the tray** (closed with a real `WM_CLOSE`), 484 in 2 s after reopening through a
  second launch. Not verifiable here: real sound output, Windows Sandbox (not enabled).
