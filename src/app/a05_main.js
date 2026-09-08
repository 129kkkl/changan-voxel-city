// a05_main.js — 装配：URL 参数、Worker 引导、进度、主循环
const STAGE_LABEL = {
  terrain: '六坡地形：东南高西北低，龙首原、乐游原起势',
  walls: '礼制骨架：外郭城墙、十二城门、三重城',
  streets: '街道工程：御道横街、排水沟、路拱',
  wards: '坊内生长：108 坊墙门、十字街、十六区宅院',
  markets: '东西两市：市墙八门、井字街、市楼行肆',
  custom: '名坊详写：大寺名宅、国子监、王府',
  palaces: '三大内：太极宫、皇城百司、大明宫、兴庆宫',
  water: '五渠成网：龙首、清明、永安、漕、黄渠与曲江',
  detail: '生活细节：槐行柳岸、井台灯笼、寺观松竹',
  seal: '封壳与字段刷新',
  audit: '礼制审计与基岩泛洪',
  mesh: '分块网格与 LOD 烘焙',
  done: '装配场景',
};

const App = {
  seed: 0x5a17c4a9,
  worker: null,
  meta: null,
  fields: null,
  stats: null,
  reqId: 1,
  urlView: 'mingde',
  urlTime: null,
  urlQ: null,
};

function parseSeed(s) {
  if (!s) return 0x5a17c4a9;
  if (/^0x/i.test(s)) return parseInt(s, 16) >>> 0;
  if (/^[0-9a-f]{5,8}$/i.test(s)) return parseInt(s, 16) >>> 0;
  const n = Number(s);
  if (Number.isFinite(n) && String(s).trim() !== '') return n >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function readURL() {
  let q = {};
  try { q = Object.fromEntries(new URLSearchParams(location.search)); } catch {}
  App.seed = parseSeed(q.seed);
  App.urlView = q.view || 'mingde';
  App.urlTime = q.t != null && q.t !== '' ? q.t : null;
  App.urlQ = q.q || null;
  App.plan = q.plan || null;                       // P1 规划方案：?plan=0|A|B|C
  try { if (!App.urlQ) App.urlQ = localStorage.getItem('changan.q'); } catch {}
}

function setProgress(pct, label) {
  const bar = document.getElementById('progress');
  const lab = document.getElementById('loading-label');
  if (bar) bar.style.width = Math.round(pct * 100) + '%';
  if (lab && label) lab.textContent = label;
}

function fatal(msg) {
  if (window.__VOXEL_SHOW_FATAL__) window.__VOXEL_SHOW_FATAL__(msg);
}

function createWorker() {
  const src = document.getElementById('gen-src') && document.getElementById('gen-src').textContent;
  if (!src || src.length < 1000) throw new Error('生成器源码缺失');
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  return new Worker(url);
}

function onWorld(data) {
  App.stats = data.stats;
  App.meta = data.meta;
  App.fields = data.fields;
  buildChunks(data.chunks);
  if (data.archMesh) buildArchMesh(data.archMesh);
  const vc = document.getElementById('voxel-count');
  if (vc) vc.textContent = (data.stats.voxels / 10000).toFixed(0) + ' 万';
  bindViews(App);
  const id = VIEW_DEFS.some(v => v.id === App.urlView) ? App.urlView : 'mingde';
  goToView(id, true);
  initLife(App);
  if (App.urlTime != null) {
    if (App.urlTime === 'dawn' || App.urlTime === 'noon' || App.urlTime === 'dusk' || App.urlTime === 'lantern') setLightMode(App.urlTime);
    else {
      const h = parseFloat(App.urlTime);
      if (Number.isFinite(h)) setHour(h);
    }
  }
  initUI(App);
  replayEdits();
  document.getElementById('loading')?.classList.add('done');
  window.__CHANGAN_READY__ = true;
  showToast('长安已成 · seed ' + App.seed.toString(16));
  loop();
}

function onRemesh(msg) {
  if (msg.chunks) replaceChunks(msg.chunks);
  if (msg.colPatches) applyColPatches(msg.colPatches);
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  tickCamera();
  if (Walk.active) tickWalk(dt);
  else Engine.controls.update();
  updateLOD();
  adaptFog();
  tickLife(dt);
  tickUI();
  statsTick(dt);
  autoQualityTick(dt);
  if (Engine.materials.water) {
    Engine.materials.water.opacity = 0.74 + Math.sin(performance.now() * 0.0016) * 0.05;
  }
  Engine.renderer.render(Engine.scene, Engine.camera);
}

function bindGlobalKeys() {
  addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    const k = e.key;
    if (k === 'Escape') {
      document.getElementById('lore-card')?.setAttribute('aria-hidden', 'true');
    } else if (k === 'v' || k === 'V') { toggleWalk(); e.preventDefault(); }
    else if (k === 'p' || k === 'P') takePhoto();
    else if (k === 'm' || k === 'M') toggleAudio();
    else if (k === 'l' || k === 'L') toggleAutoTime();
    else if (k === 'r' || k === 'R') goToView('mingde');
    else if (k === '[' || k === ',') cycleView(-1);
    else if (k === ']' || k === '.') cycleView(1);
    else if (e.ctrlKey && (k === 'z' || k === 'Z')) { undoEdit(); e.preventDefault(); }
    else if (/^[0-9]$/.test(k) && !e.shiftKey) viewByKey(k === '0' ? '0' : k);
    else if (e.shiftKey && /^[1-8]$/.test(k)) viewByKey('ABCDEFGH'[parseInt(k, 10) - 1]);
  });
  const seedIn = document.getElementById('world-seed');
  if (seedIn) {
    seedIn.value = App.seed.toString(16);
    seedIn.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const u = new URL(location.href);
      u.searchParams.set('seed', seedIn.value.trim());
      location.search = u.search;
    });
  }
}

function boot() {
  if (!window.__CHANGAN_OFFLINE_CORE__) return;
  readURL();
  initViewPanel();
  bindGlobalKeys();
  try {
    initEngine(document.getElementById('scene'));
    buildSky();
    if (App.urlQ && { high: 1, mid: 1, low: 1 }[App.urlQ]) {
      Engine.autoQuality.enabled = false;
      applyQuality(App.urlQ);
    }
  } catch (err) {
    fatal('渲染引擎未能启动：' + (err && err.message));
    return;
  }
  let worker;
  try { worker = createWorker(); } catch (err) { fatal(err.message); return; }
  App.worker = worker;
  worker.onerror = ev => fatal('生成线程错误：' + (ev && ev.message));
  worker.onmessage = e => {
    const msg = e.data || {};
    if (msg.type === 'progress') setProgress(0.05 + msg.pct * 0.9, STAGE_LABEL[msg.stage] || msg.stage);
    else if (msg.type === 'done') onWorld(msg);
    else if (msg.type === 'fatal') fatal(msg.error || 'fatal 审计未过');
    else if (msg.type === 'remesh') onRemesh(msg);
  };
  setProgress(0.02, '正在唤起营造线程…');
  worker.postMessage({ cmd: 'generate', seed: App.seed, plan: App.plan });
}

boot();
window.__CHANGAN__ = { goToView, setLightMode, setHour, Engine, Life, App, Walk };
