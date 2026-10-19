// Tiny Chrome DevTools Protocol driver — no npm packages needed (Node 22+ has WebSocket + fetch built in).
// Used by tests/browser.test.mjs and tools/shots.mjs.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const found = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Edge not found. Set CHROME_PATH to its executable.');
  return found;
}

export async function launch({ port = 9333 + Math.floor(Math.random() * 400), extraArgs = [] } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'abcc-chrome-'));
  const proc = spawn(
    findChrome(),
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--allow-file-access-from-files',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--hide-scrollbars',
      '--mute-audio',
      'about:blank',
      ...extraArgs,
    ],
    { stdio: 'ignore' },
  );

  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await sleep(150);
    }
  }
  if (!targets) {
    proc.kill();
    throw new Error('Chrome did not expose the debugging port');
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 0;
  const pending = new Map();
  const listeners = [];
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        consoleErrors.push(`${d.exception?.description || d.text} @ line ${d.lineNumber}`);
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/fonts\.g|ERR_INTERNET|ERR_NAME|net::/.test(msg.params.entry.text + (msg.params.entry.url || ''))) {
        consoleErrors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`);
      }
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      pending.set(myId, { resolve, reject });
      ws.send(JSON.stringify({ id: myId, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  const api = {
    send,
    consoleErrors,
    clearErrors: () => (consoleErrors.length = 0),
    async viewport(width, height, { dpr = 1, mobile = false } = {}) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
      if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
    },
    async goto(url) {
      const loaded = new Promise((res) => {
        const l = (m) => {
          if (m.method === 'Page.loadEventFired') {
            listeners.splice(listeners.indexOf(l), 1);
            res();
          }
        };
        listeners.push(l);
      });
      await send('Page.navigate', { url });
      await loaded;
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    sleep,
    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill();
      await sleep(200);
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {}
    },
  };
  return api;
}
