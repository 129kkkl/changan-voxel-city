// tools/shot.js — 零依赖 CDP 截图/验收工具
// 用法:
//   node tools/shot.js --out 验收截图/cur --views mingde,axis,wardGate,lane --seed 5a17c4a9 --t noon --q mid
//   node tools/shot.js --out 验收截图/cur --views all --w 1600 --h 900
// 依赖: 系统 Chrome/Edge (headless=new) + Node>=22 内置 WebSocket
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('找不到 Chrome/Edge 可执行文件');
}

function parseArgs(argv) {
  const a = { out: '验收截图/auto', views: 'mingde,axis,wardGate,lane', seed: '5a17c4a9', t: 'noon', q: 'mid', w: 1600, h: 900, file: 'index.html', settle: 2600, timeout: 180000 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--out') { a.out = v; i++; }
    else if (k === '--views') { a.views = v; i++; }
    else if (k === '--seed') { a.seed = v; i++; }
    else if (k === '--t') { a.t = v; i++; }
    else if (k === '--q') { a.q = v; i++; }
    else if (k === '--w') { a.w = +v; i++; }
    else if (k === '--h') { a.h = +v; i++; }
    else if (k === '--file') { a.file = v; i++; }
    else if (k === '--settle') { a.settle = +v; i++; }
    else if (k === '--timeout') { a.timeout = +v; i++; }
    else if (k === '--extra') { a.extra = v; i++; }
  }
  return a;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.handlers = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('WS 连接失败')); });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id);
        c.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message)); else res(m.result);
      } else if (m.method) {
        c.events.push(m);
        const h = c.handlers.get(m.method);
        if (h) h(m.params);
      }
    };
    return c;
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  on(method, fn) { this.handlers.set(method, fn); }
  async eval(expr, awaitPromise) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise });
    if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result && r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function launch(chromePath) {
  const userDataDir = path.join(os.tmpdir(), 'changan-shot-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + userDataDir,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--disable-translate',
    '--hide-scrollbars', '--mute-audio',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1600,900',
    'about:blank',
  ];
  const proc = spawn(chromePath, args, { stdio: 'ignore', detached: false });
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 200; i++) {
    await sleep(100);
    if (fs.existsSync(portFile)) {
      const txt = fs.readFileSync(portFile, 'utf8').split('\n');
      if (txt[0]) { port = parseInt(txt[0], 10); break; }
    }
    if (proc.exitCode !== null) throw new Error('Chrome 提前退出, code=' + proc.exitCode);
  }
  if (!port) { try { proc.kill(); } catch {} throw new Error('未能获取 DevTools 端口'); }
  return { proc, port, userDataDir };
}

async function main() {
  const a = parseArgs(process.argv);
  const chromePath = findChrome();
  const outDir = path.isAbsolute(a.out) ? a.out : path.join(ROOT, a.out);
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.isAbsolute(a.file) ? a.file : path.join(ROOT, a.file);
  if (!fs.existsSync(filePath)) throw new Error('产物不存在: ' + filePath);

  const { proc, port, userDataDir } = await launch(chromePath);
  let cdp = null;
  const result = { shots: [], console: [], errors: [], meta: null };
  try {
    let target = null;
    for (let i = 0; i < 60; i++) {
      const list = await httpGetJSON(`http://127.0.0.1:${port}/json/list`);
      target = (list || []).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
      await sleep(200);
    }
    if (!target) throw new Error('未找到可用 page target');
    cdp = await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Runtime.consoleAPICalled', p => {
      const txt = (p.args || []).map(x => x.value != null ? x.value : (x.description || x.type)).join(' ');
      result.console.push(p.type + ': ' + txt);
    });
    cdp.on('Runtime.exceptionThrown', p => {
      result.errors.push((p.exceptionDetails && (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text)) || 'unknown');
    });
    cdp.on('Log.entryAdded', p => {
      if (p.entry && (p.entry.level === 'error' || p.entry.level === 'warning')) result.console.push('log.' + p.entry.level + ': ' + p.entry.text);
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: a.w, height: a.h, deviceScaleFactor: 1, mobile: false });

    const url = 'file:///' + filePath.replace(/\\/g, '/') + `?seed=${a.seed}&view=${a.views.split(',')[0]}&t=${a.t}&q=${a.q}` + (a.extra ? '&' + a.extra : '');
    await cdp.send('Page.navigate', { url });

    // 等待生成完成
    const t0 = Date.now();
    let ready = false;
    while (Date.now() - t0 < a.timeout) {
      await sleep(500);
      try {
        const st = await cdp.eval('JSON.stringify({ready: !!window.__CHANGAN_READY__, fatal: (function(){var f=document.getElementById("fatal");return f?getComputedStyle(f).display!=="none":false})(), label: (document.getElementById("loading-label")||{}).textContent||""})');
        const s = JSON.parse(st);
        if (s.fatal) throw new Error('页面 fatal：' + (await cdp.eval('(document.getElementById("fatal-detail")||{}).textContent||""')));
        if (s.ready) { ready = true; break; }
        if (Date.now() - t0 > 3000 && Date.now() % 1 === 0) process.stdout.write('  等待生成… ' + s.label + '\n');
      } catch (e) {
        if (/fatal/.test(e.message)) throw e;
      }
    }
    if (!ready) throw new Error('等待生成超时 ' + a.timeout + 'ms');

    result.meta = await cdp.eval('JSON.stringify({stats: window.__CHANGAN__.App.stats, voxels: (window.__CHANGAN__.App.stats||{}).voxels, views: (window.__CHANGAN__.App.meta&&window.__CHANGAN__.App.meta.viewAnchors)?Object.keys(window.__CHANGAN__.App.meta.viewAnchors):[]})');
    const metaObj = JSON.parse(result.meta);

    // 隐藏 UI 覆盖层（可选，用于纯画面对比）
    const hideUI = process.env.SHOT_HIDE_UI === '1';
    if (hideUI) {
      await cdp.eval(`(function(){['.brand','.tour-panel','.telemetry','.help','.minimap-card','.lore-card','.grain','#toast','#edit-hud'].forEach(s=>{const e=document.querySelector(s); if(e) e.style.display='none';}); return 1})()`);
    }

    let views = a.views === 'all'
      ? ['mingde','axis','hengjie','hanyuan','hanyuanTop','taiye','xingqing','westMarket','eastMarket','dayanta','xiaoyanta','qinglong','jingshan','wardGate','lane','qujiang','jinguang','curfew']
      : (a.views.includes(';') ? a.views.split(';') : a.views.split(',')).map(s => s.trim()).filter(Boolean);

    for (const v of views) {
      // 每个机位前把光照复位到 --t 指定的档位。
      // 否则带 light:'dawn'/'dusk' 的机位（小雁晨钟/暮鼓夜禁）会把光照状态泄漏给后续机位，
      // 让后续截图在错误的时辰下拍摄（曾导致 lane/wardGate 被误判为"整体偏暗"）。
      if (['dawn', 'noon', 'dusk', 'lantern'].includes(String(a.t))) {
        await cdp.eval(`(function(){try{window.__CHANGAN__.setLightMode(${JSON.stringify(a.t)})}catch(e){}return 1})()`);
      }
      if (v.startsWith('cam@')) {
        const body = v.slice(4);
        if (body.startsWith('a:')) {
          // a:anchor,dx,dy,dz,dtx,dty,dtz —— 相对机位锚点偏移，保证落在真实街巷上
          const p = body.slice(2).split(',');
          const name = p[0];
          const n = p.slice(1).map(Number);
          if (n.length < 6 || n.some(x => !Number.isFinite(x))) throw new Error('cam@a: 参数格式: cam@a:<anchor>,dx,dy,dz,dtx,dty,dtz');
          await cdp.eval(`(function(){var A=window.__CHANGAN__.App.meta.viewAnchors;var a=A[${JSON.stringify(name)}];if(!a)throw new Error('锚点不存在: '+${JSON.stringify(name)});var E=window.__CHANGAN__.Engine;E.camera.position.set(a.x+(${n[0]}),a.y+(${n[1]}),a.z+(${n[2]}));E.controls.target.set(a.x+(${n[3]}),a.y+(${n[4]}),a.z+(${n[5]}));E.controls.update();return 1})()`);
        } else {
          const p = body.split(',').map(Number);
          if (p.length < 6 || p.some(n => !Number.isFinite(n))) throw new Error('cam@ 参数格式: cam@x,y,z,tx,ty,tz');
          await cdp.eval(`(function(){var E=window.__CHANGAN__.Engine;E.camera.position.set(${p[0]},${p[1]},${p[2]});E.controls.target.set(${p[3]},${p[4]},${p[5]});E.controls.update();return 1})()`);
        }
      } else {
        await cdp.eval(`window.__CHANGAN__.goToView(${JSON.stringify(v)}, true)`);
      }
      await sleep(a.settle);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const safe = v.replace(/[^0-9a-zA-Z@._-]/g, '_');
      const fname = `${safe}_${a.t}_${a.seed}.png`;
      fs.writeFileSync(path.join(outDir, fname), Buffer.from(shot.data, 'base64'));
      const fps = await cdp.eval('(document.getElementById("fps-count")||{}).textContent||""');
      const dc = await cdp.eval('(document.getElementById("draw-count")||{}).textContent||""');
      const vx = await cdp.eval('(document.getElementById("voxel-count")||{}).textContent||""');
      result.shots.push({ view: v, file: path.join(outDir, fname), fps, drawCalls: dc, voxels: vx });
      console.log(`[shot] ${safe.padEnd(34)} fps=${String(fps).padEnd(5)} dc=${String(dc).padEnd(5)} vox=${vx}`);
    }
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ ...result, meta: metaObj }, null, 2), 'utf8');
    console.log('\n[shot] 完成 ' + result.shots.length + ' 张 → ' + outDir);
    if (result.errors.length) console.log('[shot] 页面异常:\n  ' + result.errors.join('\n  '));
  } finally {
    if (cdp) cdp.close();
    try { proc.kill(); } catch {}
    await sleep(400);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(e => { console.error('[shot] 失败: ' + e.message); process.exit(1); });
