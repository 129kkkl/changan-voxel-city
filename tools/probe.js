// tools/probe.js — 打开产物并执行任意 JS，打印结果（调试用）
// 用法: node tools/probe.js "JSON.stringify({arch: !!window.__CHANGAN__.Engine.archMesh, tris: window.__CHANGAN__.Engine.archMesh && window.__CHANGAN__.Engine.archMesh.geometry.index.count/3})"
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));

(async () => {
  const expr = process.argv[2] || '1';
  const file = path.resolve(__dirname, '..', 'index.html');
  const dir = path.join(os.tmpdir(), 'changan-probe-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
  const pf = path.join(dir, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 200; i++) { await sleep(100); if (fs.existsSync(pf)) { port = parseInt(fs.readFileSync(pf, 'utf8').split('\n')[0], 10); break; } }
  if (!port) throw new Error('无 DevTools 端口');
  let target = null;
  for (let i = 0; i < 60; i++) { const l = await getJSON(`http://127.0.0.1:${port}/json/list`); target = (l || []).find(t => t.type === 'page' && t.webSocketDebuggerUrl); if (target) break; await sleep(200); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS 失败')); });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
  for (let i = 0; i < 240; i++) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: '!!window.__CHANGAN_READY__', returnByValue: true });
    if (r.result && r.result.value) break;
  }
  const out = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (out.exceptionDetails) console.log('JS 异常: ' + (out.exceptionDetails.exception?.description || out.exceptionDetails.text));
  else console.log(JSON.stringify(out.result.value, null, 2));
  try { ws.close(); } catch {}
  try { proc.kill(); } catch {}
  await sleep(300);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
})().catch(e => { console.error('[probe] ' + e.message); process.exit(1); });
