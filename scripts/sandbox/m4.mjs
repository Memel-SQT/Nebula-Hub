// M4 recipe (docs/TEST_PLAN_WINDOWS.md, 4.1–4.10), driven over CDP inside Windows Sandbox.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.RESULTS_DIR;
const downloadsDir = path.join(process.env.LOCALAPPDATA, 'Nebula Hub', 'downloads');
const report = { steps: [] };
const save = () => fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(report, null, 2));
const step = (name, data) => {
  report.steps.push({ at: new Date().toISOString(), name, ...data });
  console.log(name, JSON.stringify(data));
  save();
};
const listDownloads = () => (fs.existsSync(downloadsDir) ? fs.readdirSync(downloadsDir).map((name) => `${name} ${fs.statSync(path.join(downloadsDir, name)).size}`) : []);
const network = (enable) => {
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-NetAdapter | ${enable ? 'Enable' : 'Disable'}-NetAdapter -Confirm:$false`], { stdio: 'pipe' });
    return 'ok';
  } catch (error) {
    return String(error.stderr ?? error.message).slice(0, 300);
  }
};

export default async function (page) {
  const click = (selector) => page.eval(`(() => { const el = ${selector}; if (!el) throw new Error('missing'); el.click(); return true; })()`);
  const nav = (label) => click(`[...document.querySelectorAll('nav button')].find((el) => el.textContent.includes(${JSON.stringify(label)}))`);
  const shot = (name) => page.screenshot(path.join(dir, `${name}.png`));
  const downloads = () => page.eval('window.nebulaHub.getDownloads()');
  const op = async (appId) => (await downloads()).operations.find((o) => o.appId === appId);

  /** Follows one operation until it rests, recording every phase. */
  async function follow(appId, { until = ['installed', 'failed', 'cancelled'], onTick, timeoutMs = 600_000 } = {}) {
    const phases = [];
    let maxSpeed = 0;
    let resumed = false;
    const start = Date.now();
    for (;;) {
      const current = await op(appId);
      if (current) {
        if (phases[phases.length - 1]?.phase !== current.phase) phases.push({ phase: current.phase, t: Date.now() - start, received: current.received });
        maxSpeed = Math.max(maxSpeed, current.bytesPerSecond ?? 0);
        resumed ||= current.resumed;
        if (onTick) await onTick(current);
        if (until.includes(current.phase)) return { phases, maxSpeed, resumed, final: current, ms: Date.now() - start };
      }
      if (Date.now() - start > timeoutMs) return { phases, maxSpeed, resumed, final: current, ms: Date.now() - start, timedOut: true };
      await page.sleep(200);
    }
  }

  await page.sleep(5000);
  // Wait for the network catalog (releases with installers).
  let catalog;
  for (let i = 0; i < 90; i += 1) {
    catalog = await page.eval('window.nebulaHub.getCatalog()');
    const ready = ['nebula.finterest', 'nebula.clock'].every((id) => catalog.entries.find((e) => e.app.id === id)?.release?.installer);
    if (ready && !catalog.refreshing) break;
    await page.sleep(1000);
  }
  step('catalog', { source: catalog.source, entries: catalog.entries.map((e) => ({ id: e.app.id, version: e.release?.version ?? null, installer: e.release?.installer?.fileName ?? null, size: e.release?.installer?.size ?? null, issue: e.releaseIssue })) });
  step('installed at start', { apps: (await page.eval('window.nebulaHub.getInstalled()')).apps });
  await nav('Mes apps');
  await page.sleep(800);
  await shot('01-myapps-empty');

  // 4.9: install folder chosen in the settings (set through the same IPC as the folder dialog result).
  step('set install folder', { settings: (await page.eval(`window.nebulaHub.updateSettings({ installDirectory: 'C:\\\\Apps' })`)).installDirectory });

  // 4.2 – 4.3: Finterest from its page, through the real button.
  await nav('Découvrir');
  await page.sleep(800);
  await click(`[...document.querySelectorAll('.app-tile')].find((el) => el.textContent.includes('Nebula Finterest'))?.querySelector('button')`);
  await page.sleep(1200);
  await shot('02-finterest-page');
  step('smartscreen line', { shown: await page.eval(`document.body.textContent.includes('SmartScreen')`) });
  await click(`[...document.querySelectorAll('button')].find((el) => el.textContent.includes('Installer Nebula Finterest'))`);
  let midShot = false;
  const finterest = await follow('nebula.finterest', {
    onTick: async (current) => {
      if (!midShot && current.phase === 'downloading' && current.received > current.total * 0.3) {
        midShot = true;
        await shot('03-finterest-downloading');
        await nav('Téléchargements');
        await page.sleep(300);
        await shot('04-downloads-live');
        await page.eval('history.length');
      }
    },
  });
  step('finterest install', finterest);
  await shot('05-after-finterest');
  step('downloads folder after success', { files: listDownloads() });

  // 4.4: detected, with version, scope and location; then launched by the Hub.
  const installed = await page.eval('window.nebulaHub.refreshInstalled()');
  step('detected after install', { apps: installed.apps });
  await nav('Mes apps');
  await page.sleep(800);
  await shot('06-myapps-finterest');
  step('launch finterest', { result: await page.eval(`window.nebulaHub.launchApp('nebula.finterest')`) });
  await page.sleep(8000);
  step('running after launch', { apps: (await page.eval('window.nebulaHub.refreshInstalled()')).apps.map((a) => ({ appId: a.appId, running: a.running })) });

  // Back to each installer's default folder for Clock.
  await page.eval('window.nebulaHub.updateSettings({ installDirectory: null })');

  // 4.8: cancel during the download.
  step('enqueue clock (cancel test)', { result: await page.eval(`window.nebulaHub.installApp('nebula.clock')`) });
  const cancelled = await follow('nebula.clock', {
    until: ['cancelled', 'installed', 'failed'],
    onTick: async (current) => {
      if (current.phase === 'downloading' && current.received > current.total * 0.15) await page.eval(`window.nebulaHub.cancelOperation('${current.id}')`);
    },
  });
  await page.sleep(500);
  step('clock cancelled', { ...cancelled, downloads: listDownloads() });

  // 4.6 – 4.7: network cut at ~40 %, then retry: the download resumes.
  step('enqueue clock (network cut)', { result: await page.eval(`window.nebulaHub.installApp('nebula.clock')`) });
  let cut = null;
  const failed = await follow('nebula.clock', {
    until: ['failed', 'installed', 'cancelled'],
    onTick: async (current) => {
      if (!cut && current.phase === 'downloading' && current.received > current.total * 0.4) {
        cut = { at: current.received, result: network(false) };
      }
    },
    timeoutMs: 180_000,
  });
  step('clock after network cut', { cut, ...failed, downloads: listDownloads() });
  await nav('Téléchargements');
  await page.sleep(500);
  await shot('07-downloads-offline');
  step('network back', { result: network(true) });
  // Wait until GitHub answers again.
  for (let i = 0; i < 30; i += 1) {
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', "Invoke-WebRequest -UseBasicParsing -Method Head https://github.com -TimeoutSec 5 | Out-Null"], { stdio: 'pipe' });
      break;
    } catch {
      await page.sleep(2000);
    }
  }
  step('retry clock', { result: await page.eval(`window.nebulaHub.installApp('nebula.clock')`) });
  const resumed = await follow('nebula.clock');
  step('clock after retry', resumed);
  await nav('Téléchargements');
  await page.sleep(600);
  await shot('08-downloads-final');
  await page.eval(`document.querySelector('.history-panel')?.scrollIntoView({ block: 'center' })`);
  await page.sleep(400);
  await shot('09-history');
  step('final', { installed: (await page.eval('window.nebulaHub.refreshInstalled()')).apps, history: (await downloads()).history, downloads: listDownloads() });
  step('console problems', { problems: page.problems() });
}
