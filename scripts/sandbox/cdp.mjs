// Minimal Chrome DevTools Protocol client for the Windows Sandbox recipes (docs/TEST_PLAN_WINDOWS.md).
// Runs with the packaged Hub itself as Node (ELECTRON_RUN_AS_NODE=1), so the sandbox needs no
// extra runtime. Usage: "Nebula Hub.exe" cdp.mjs <port> <recipe.mjs>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Connects to the first page target listening on `port` (Electron's --remote-debugging-port). */
export async function connect(port, { timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let target = null;
  while (!target) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = targets.find((candidate) => candidate.type === 'page' && !candidate.url.startsWith('devtools://')) ?? null;
    } catch {
      // Not listening yet.
    }
    if (!target) {
      if (Date.now() > deadline) throw new Error(`no page target on port ${port}`);
      await sleep(300);
    }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    } else if (data.method) {
      events.push(data);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const page = {
    send,
    sleep,
    close: () => ws.close(),
    async eval(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
      return result.result.value;
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    },
    problems() {
      return events
        .filter((e) => (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || e.method === 'Runtime.exceptionThrown')
        .map((e) => (e.method === 'Runtime.consoleAPICalled' ? `console.error: ${e.params.args.map((a) => a.value ?? a.description).join(' ')}` : `exception: ${e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text}`));
    },
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return page;
}

const [port, recipe] = process.argv.slice(2);
if (port && recipe) {
  const page = await connect(Number(port));
  const module = await import(pathToFileURL(path.resolve(recipe)).href);
  try {
    await module.default(page);
  } finally {
    page.close();
  }
}
