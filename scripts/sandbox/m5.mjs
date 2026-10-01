// M5 [CRITIQUE] recipe (brief §7.6, docs/TEST_PLAN_WINDOWS.md 5.1–5.3), inside Windows Sandbox:
// Finterest 0.1.35 with real data, then through the Hub (a) update to 0.1.36, (b) repair,
// (c) uninstall — after each, the data is read back through Finterest's own interface.
// The default export receives the Hub page; Finterest is driven on its own CDP port.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { connect, sleep } from './cdp.mjs';

const RESULTS = process.env.RESULTS_DIR;
const FINTEREST_EXE = path.join(process.env.LOCALAPPDATA, 'Programs', 'finterest', 'Nebula Finterest.exe');
const FINTEREST_DATA = path.join(process.env.APPDATA, 'Finterest');
const ACCOUNTS = [
  {
    name: 'Noé',
    pin: '2468',
    income: 2400,
    fixed: [
      { name: 'Loyer', amount: 750, category: 'Logement', dayOfMonth: 5, active: true, kind: 'directDebit' },
      { name: 'Musique', amount: 10.99, category: 'Loisirs', dayOfMonth: 12, active: true, kind: 'subscription' },
    ],
    variable: [{ name: 'Courses', amount: 84.2, category: 'Alimentation', date: '2026-10-01', monthKey: '2026-10' }],
    loans: [{ name: 'Voiture', principal: 8000, monthlyPayment: 210, interestRate: 3.2, remainingMonths: 36, active: true }],
  },
  {
    name: 'Démo',
    pin: '1357',
    income: 1500,
    fixed: [{ name: 'Internet', amount: 29.99, category: 'Maison', dayOfMonth: 2, active: true, kind: 'subscription' }],
    variable: [{ name: 'Cinéma', amount: 12.5, category: 'Sorties', date: '2026-10-03', monthKey: '2026-10' }],
    loans: [],
  },
];

const report = { steps: [], verdicts: {} };
const save = () => fs.writeFileSync(path.join(RESULTS, 'm5-results.json'), JSON.stringify(report, null, 2));
function step(name, data = {}) {
  report.steps.push({ at: new Date().toISOString(), name, ...data });
  console.log(name, JSON.stringify(data).slice(0, 400));
  save();
}

/** What must survive: every user-entered field, ids excluded (an import may renumber). */
function normalize(snapshot) {
  const by = (list, keys) => list.map((item) => Object.fromEntries(keys.map((key) => [key, item[key]]))).sort((a, b) => a.name.localeCompare(b.name));
  return {
    income: snapshot.settings.income,
    fixed: by(snapshot.fixedExpenses, ['name', 'amount', 'category', 'dayOfMonth', 'active', 'kind']),
    variable: by(snapshot.variableExpenses, ['name', 'amount', 'category', 'date', 'monthKey']),
    loans: by(snapshot.loans, ['name', 'principal', 'monthlyPayment', 'interestRate', 'remainingMonths', 'active']),
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function running() {
  try {
    return execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq Nebula Finterest.exe', '/FO', 'CSV', '/NH'], { encoding: 'latin1' }).includes('Nebula Finterest.exe');
  } catch {
    return false;
  }
}

async function openFinterest() {
  spawn(FINTEREST_EXE, ['--remote-debugging-port=9333'], { detached: true, stdio: 'ignore' }).unref();
  const page = await connect(9333);
  for (let i = 0; i < 60 && !(await page.eval('Boolean(window.finterest)')); i += 1) await sleep(250);
  return page;
}

/** Closes Finterest the way a user would (close message), and waits for the process to end. */
async function closeFinterest(page) {
  page.close();
  try {
    execFileSync('taskkill.exe', ['/IM', 'Nebula Finterest.exe'], { stdio: 'ignore' });
  } catch {
    // Already closed.
  }
  for (let i = 0; i < 60 && running(); i += 1) await sleep(500);
  if (running()) {
    step('finterest did not close politely: forced (test environment only)');
    execFileSync('taskkill.exe', ['/IM', 'Nebula Finterest.exe', '/F'], { stdio: 'ignore' });
    await sleep(2000);
  }
}

/** Reads every test account back through Finterest's own bridge. */
async function readAccounts(page) {
  const result = {};
  const accounts = await page.eval('window.finterest.listAccounts()');
  for (const account of ACCOUNTS) {
    const found = accounts.find((candidate) => candidate.name === account.name);
    if (!found) {
      result[account.name] = null;
      continue;
    }
    result[account.name] = normalize(await page.eval(`window.finterest.unlockAccount(${JSON.stringify(found.id)}, ${JSON.stringify(account.pin)})`));
    await page.eval('window.finterest.lockAccount()');
  }
  return result;
}

/** Runs one Hub operation (already confirmed by the recipe) and follows it to its end. */
async function hubOperation(hub, appId, kind) {
  await hub.eval('window.nebulaHub.refreshInstalled()');
  const plan = await hub.eval(`window.nebulaHub.planOperation(${JSON.stringify(appId)}, ${JSON.stringify(kind)})`);
  const started = await hub.eval(`window.nebulaHub.startOperation(${JSON.stringify(appId)}, ${JSON.stringify(kind)}, true)`);
  const phases = [];
  let operation = null;
  const begin = Date.now();
  for (;;) {
    operation = (await hub.eval('window.nebulaHub.getDownloads()')).operations.find((candidate) => candidate.appId === appId);
    if (operation && phases[phases.length - 1] !== operation.phase) {
      phases.push(operation.phase);
      if (operation.phase === 'backing-up') await hub.screenshot(path.join(RESULTS, `m5-${kind}-backup.png`));
    }
    if (operation && ['installed', 'absent', 'failed', 'cancelled', 'backup-failed'].includes(operation.phase)) break;
    if (Date.now() - begin > 15 * 60_000) break;
    await sleep(300);
  }
  step(`hub ${kind}`, { plan, started, phases, final: operation, seconds: Math.round((Date.now() - begin) / 1000) });
  return { plan, operation };
}

export default async function (hub) {
  await sleep(5000);
  for (let i = 0; i < 90; i += 1) {
    const catalog = await hub.eval('window.nebulaHub.getCatalog()');
    if (!catalog.refreshing && catalog.entries.find((entry) => entry.app.id === 'nebula.finterest')?.release?.installer) break;
    await sleep(1000);
  }

  // ---- Real data in Finterest 0.1.35.
  let finterest = await openFinterest();
  step('finterest started', { accounts: await finterest.eval('window.finterest.listAccounts()') });
  for (const account of ACCOUNTS) {
    await finterest.eval(`window.finterest.createAccount(${JSON.stringify(account.name)}, ${JSON.stringify(account.pin)})`);
    await finterest.eval(`window.finterest.saveIncome(${account.income})`);
    for (const expense of account.fixed) await finterest.eval(`window.finterest.addFixedExpense(${JSON.stringify(expense)})`);
    for (const expense of account.variable) await finterest.eval(`window.finterest.addVariableExpense(${JSON.stringify(expense)})`);
    for (const loan of account.loans) await finterest.eval(`window.finterest.addLoan(${JSON.stringify(loan)})`);
    await finterest.eval('window.finterest.lockAccount()');
  }
  const expected = await readAccounts(finterest);
  step('data created in 0.1.35', { expected });
  await closeFinterest(finterest);
  await sleep(2000);

  // ---- (a) Update 0.1.35 -> 0.1.36 through the Hub.
  const update = await hubOperation(hub, 'nebula.finterest', 'update');
  finterest = await openFinterest();
  const afterUpdate = await readAccounts(finterest);
  await closeFinterest(finterest);
  report.verdicts.a = update.operation?.phase === 'installed' && update.operation.fromVersion === '0.1.35' && update.operation.version === '0.1.36' && update.operation.backup?.state === 'ok' && same(afterUpdate, expected) ? 'PASS' : 'FAIL';
  step('(a) update: data after', { afterUpdate, verdict: report.verdicts.a });

  // ---- (b) Repair (same version, update mode).
  const repair = await hubOperation(hub, 'nebula.finterest', 'repair');
  finterest = await openFinterest();
  const afterRepair = await readAccounts(finterest);
  await closeFinterest(finterest);
  report.verdicts.b = repair.operation?.phase === 'installed' && repair.operation.backup?.state === 'ok' && same(afterRepair, expected) ? 'PASS' : 'FAIL';
  step('(b) repair: data after', { afterRepair, verdict: report.verdicts.b });

  // ---- (c) Uninstall: backup exists, data folder removed, backup imported into a fresh install.
  const uninstall = await hubOperation(hub, 'nebula.finterest', 'uninstall');
  const backupFile = uninstall.operation?.backup?.path ?? null;
  const backup = backupFile && fs.existsSync(backupFile) ? JSON.parse(fs.readFileSync(backupFile, 'utf8')) : null;
  step('(c) after uninstall', {
    phase: uninstall.operation?.phase,
    backupFile,
    backupAccounts: backup?.accounts?.map((account) => account.name) ?? null,
    dataFolderLeft: fs.existsSync(FINTEREST_DATA),
    exeLeft: fs.existsSync(FINTEREST_EXE),
  });
  const install = await hubOperation(hub, 'nebula.finterest', 'install');
  finterest = await openFinterest();
  const imported = {};
  for (const account of ACCOUNTS) {
    // DISCOVERY.md: the import takes the backup account whose name matches the open account.
    await finterest.eval(`window.finterest.createAccount(${JSON.stringify(account.name)}, ${JSON.stringify(account.pin)})`);
    imported[account.name] = backup ? normalize(await finterest.eval(`window.finterest.importBackup(${JSON.stringify(backup)})`)) : null;
    await finterest.eval('window.finterest.lockAccount()');
  }
  const afterImport = await readAccounts(finterest);
  await closeFinterest(finterest);
  report.verdicts.c = uninstall.operation?.phase === 'absent' && Boolean(backup) && install.operation?.phase === 'installed' && same(afterImport, expected) ? 'PASS' : 'FAIL';
  step('(c) imported into a fresh install', { imported, afterImport, verdict: report.verdicts.c });
  step('hub console problems', { problems: hub.problems() });
}
