// tools/imgstat.js — 零依赖图片统计：把 PNG 载入无头浏览器 canvas 后计算客观指标
// 用法: node tools/imgstat.js 验收截图/baseline/*.png
// 指标: 平均亮度 / 近黑占比 / 近白占比 / 色相数 / 边缘密度（Sobel 简化）
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('找不到 Chrome/Edge');
}
function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on('error', reject);
  });
}

async function main() {
  const files = process.argv.slice(2).flatMap(a => {
    if (a.includes('*')) {
      const dir = path.dirname(a), base = path.basename(a);
      const re = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return fs.readdirSync(dir).filter(f => re.test(f)).map(f => path.join(dir, f));
    }
    return [a];
  }).filter(f => fs.existsSync(f));
  if (!files.length) { console.error('无输入文件'); process.exit(1); }

  const chromePath = findChrome();
  const userDataDir = path.join(os.tmpdir(), 'changan-stat-' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });
  const proc = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + userDataDir, '--no-first-run', '--disable-extensions', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 200; i++) { await sleep(100); if (fs.existsSync(portFile)) { port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10); break; } }
  if (!port) throw new Error('无 DevTools 端口');

  let target = null;
  for (let i = 0; i < 60; i++) {
    const list = await httpGetJSON(`http://127.0.0.1:${port}/json/list`);
    target = (list || []).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (target) break;
    await sleep(200);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS 失败')); });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');

  const rows = [];
  for (const f of files) {
    const url = 'file:///' + path.resolve(f).replace(/\\/g, '/');
    await send('Page.navigate', { url });
    await sleep(450);
    const js = `(async () => {
      const img = document.querySelector('img');
      if (!img || !img.complete) return JSON.stringify({error:'img not ready'});
      const W = 320, H = Math.round(img.naturalHeight * 320 / img.naturalWidth);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      let sum = 0, black = 0, white = 0, n = W * H;
      const hist = new Uint32Array(16); const hue = new Set();
      const lum = new Float32Array(n);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const r = d[i], gg = d[i+1], b = d[i+2];
        const L = 0.2126*r + 0.7152*gg + 0.0722*b;
        lum[p] = L; sum += L;
        if (L < 22) black++; if (L > 238) white++;
        hist[Math.min(15, L >> 4)]++;
        if (p % 7 === 0) hue.add((r>>4)+','+(gg>>4)+','+(b>>4));
      }
      let edge = 0;
      for (let y = 1; y < H-1; y++) for (let x = 1; x < W-1; x++) {
        const p = y*W+x;
        const gx = Math.abs(lum[p+1]-lum[p-1]), gy = Math.abs(lum[p+W]-lum[p-W]);
        if (gx+gy > 42) edge++;
      }
      const mean = sum / n;
      let sd = 0; for (let p = 0; p < n; p++) sd += (lum[p]-mean)*(lum[p]-mean);
      sd = Math.sqrt(sd/n);
      return JSON.stringify({ mean: +mean.toFixed(1), sd: +sd.toFixed(1), black: +(black/n*100).toFixed(1), white: +(white/n*100).toFixed(1), edge: +(edge/n*100).toFixed(1), colors: hue.size, hist: Array.from(hist) });
    })()`;
    const raw = await evalJS(js);
    const s = JSON.parse(raw);
    if (s.error) { console.log(f.padEnd(46) + '  ' + s.error); continue; }
    rows.push({ f, ...s });
    console.log(`${path.basename(f).padEnd(40)} 亮度=${String(s.mean).padStart(5)} 对比=${String(s.sd).padStart(5)} 黑=${String(s.black).padStart(4)}% 白=${String(s.white).padStart(4)}% 边缘=${String(s.edge).padStart(4)}% 色数=${String(s.colors).padStart(3)}`);
  }
  if (rows.length) {
    const avg = k => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(1);
    console.log(`\n[avg] 亮度=${avg('mean')} 对比=${avg('sd')} 近黑=${avg('black')}% 近白=${avg('white')}% 边缘=${avg('edge')}%`);
  }
  try { ws.close(); } catch {}
  try { proc.kill(); } catch {}
  await sleep(300);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
main().catch(e => { console.error('[imgstat] ' + e.message); process.exit(1); });
