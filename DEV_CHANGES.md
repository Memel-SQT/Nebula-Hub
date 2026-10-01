# DEV_CHANGES — Nebula Hub

Technical log, newest session first. Release notes live only in the GitHub release body.

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
