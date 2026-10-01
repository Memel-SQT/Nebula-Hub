// 4.11: after a restart, the downloads folder is empty and the history is kept.
import fs from 'node:fs';
import path from 'node:path';

export default async function (page) {
  const dir = process.env.RESULTS_DIR;
  const downloadsDir = path.join(process.env.LOCALAPPDATA, 'Nebula Hub', 'downloads');
  await page.sleep(6000);
  const view = await page.eval('window.nebulaHub.getDownloads()');
  const result = {
    history: view.history.map((h) => `${h.appId} ${h.version} ${h.outcome} ${h.failure ?? ''}`),
    downloadsDirExists: fs.existsSync(downloadsDir),
    files: fs.existsSync(downloadsDir) ? fs.readdirSync(downloadsDir) : [],
    installed: (await page.eval('window.nebulaHub.refreshInstalled()')).apps,
    problems: page.problems(),
  };
  fs.writeFileSync(path.join(dir, 'restart.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
