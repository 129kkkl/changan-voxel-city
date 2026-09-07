// a04_ui.js — 小地图、街巷漫游、涂抹编辑、拍照、分享、toast
let U = null;
let toastTimer = 0;

export function showToast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function fieldI(x, z) {
  const W = U.meta.world;
  x = Math.round(x); z = Math.round(z);
  if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1) return -1;
  return (z - W.z0) * (W.x1 - W.x0 + 1) + (x - W.x0);
}

export const Walk = {
  active: false, yaw: 0, pitch: 0,
  pos: new THREE.Vector3(),
  keys: { f: false, b: false, l: false, r: false, shift: false },
  speed: 16, bob: 0, vy: 0, grounded: true,
  savedP: new THREE.Vector3(), savedT: new THREE.Vector3(),
  ptr: false, lx: 0, ly: 0, moved: 0, btn: 0,
};

export function stopWalk() {
  if (!Walk.active) return;
  Walk.active = false;
  Engine.controls.enabled = true;
  Engine.camera.position.copy(Walk.savedP);
  Engine.controls.target.copy(Walk.savedT);
  Engine.controls.update();
  document.getElementById('walk-crosshair')?.classList.remove('active');
  const btn = document.getElementById('toggle-walk');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); }
}

function isDoorClosed(nx, nz) {
  if (!Life.doorsClosed) return false;
  const doors = U.meta.doors;
  if (!doors) return false;
  const ix = Math.round(nx), iz = Math.round(nz);
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    for (let c = 0; c < d.cells.length; c++) {
      if (d.cells[c][0] === ix && d.cells[c][1] === iz) return true;
    }
  }
  return false;
}

function isWalkablePortal(nx, nz) {
  if (isDoorClosed(nx, nz)) return false;
  const i = fieldI(nx, nz);
  if (i < 0) return false;
  const road = U.fields.road[i];
  if (road > 0) return true;
  const doors = U.meta.doors;
  if (doors) {
    const ix = Math.round(nx), iz = Math.round(nz);
    for (let k = 0; k < doors.length; k++) {
      const d = doors[k];
      for (let c = 0; c < d.cells.length; c++) {
        if (d.cells[c][0] === ix && d.cells[c][1] === iz) return true;
      }
    }
  }
  return false;
}

function walkHeight(x, z) {
  const i = fieldI(x, z);
  if (i < 0) return 4;
  const g = U.fields.groundH[i];
  const top = U.fields.topH[i];
  if (isWalkablePortal(x, z) && (top - g > 1)) return g;
  return (top - g <= 1.2) ? top : g;
}

function canStep(nx, nz) {
  const i = fieldI(nx, nz);
  if (i < 0) return false;
  const top = U.fields.topH[i], g = U.fields.groundH[i], w = U.fields.water[i];
  if (w && top <= g + 1) return false;
  if (isDoorClosed(nx, nz)) return false;
  if (isWalkablePortal(nx, nz) && (top - g > 1)) {
    const feet = Walk.pos.y - 1.65;
    return Math.abs(g - feet) <= 1.4;
  }
  const feet = Walk.pos.y - 1.65;
  if (top - feet > 1.2) return false;
  return true;
}

export function startWalk() {
  if (Walk.active) return;
  stopAutoTour();
  Walk.active = true;
  Walk.savedP.copy(Engine.camera.position);
  Walk.savedT.copy(Engine.controls.target);
  Engine.controls.enabled = false;
  let sx = Engine.controls.target.x, sz = Engine.controls.target.z;
  const W = U.meta.world;
  sx = THREE.MathUtils.clamp(sx, W.x0 + 8, W.x1 - 8);
  sz = THREE.MathUtils.clamp(sz, W.z0 + 8, W.z1 - 8);
  Walk.pos.set(sx, walkHeight(sx, sz) + 1.65, sz);
  Walk.yaw = Math.atan2(-(Walk.savedT.x - Walk.savedP.x), -(Walk.savedT.z - Walk.savedP.z));
  Walk.pitch = 0; Walk.vy = 0; Walk.grounded = true;
  Engine.camera.position.copy(Walk.pos);
  walkRot();
  document.getElementById('walk-crosshair')?.classList.add('active');
  const btn = document.getElementById('toggle-walk');
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
}

export function toggleWalk() { if (Walk.active) stopWalk(); else startWalk(); return Walk.active; }

function walkRot() {
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Walk.pitch);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Walk.yaw);
  Engine.camera.quaternion.copy(qy.multiply(qx));
}

export function tickWalk(dt) {
  if (!Walk.active) return;
  const fx = -Math.sin(Walk.yaw), fz = -Math.cos(Walk.yaw);
  const sx = Math.cos(Walk.yaw), sz = -Math.sin(Walk.yaw);
  let mx = 0, mz = 0;
  if (Walk.keys.f) { mx += fx; mz += fz; }
  if (Walk.keys.b) { mx -= fx; mz -= fz; }
  if (Walk.keys.l) { mx -= sx; mz -= sz; }
  if (Walk.keys.r) { mx += sx; mz += sz; }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    const sp = Walk.speed * (Walk.keys.shift ? 1.7 : 1) * dt;
    mx = mx / len * sp; mz = mz / len * sp;
    const W = U.meta.world;
    const nx = THREE.MathUtils.clamp(Walk.pos.x + mx, W.x0 + 4, W.x1 - 4);
    const nz = THREE.MathUtils.clamp(Walk.pos.z + mz, W.z0 + 4, W.z1 - 4);
    const okX = canStep(nx, Walk.pos.z), okZ = canStep(Walk.pos.x, nz), ok = canStep(nx, nz);
    if (ok) { Walk.pos.x = nx; Walk.pos.z = nz; }
    else if (okX) Walk.pos.x = nx;
    else if (okZ) Walk.pos.z = nz;
    Walk.bob += dt * (Walk.keys.shift ? 14 : 9);
  } else Walk.bob = 0;
  const gy = walkHeight(Walk.pos.x, Walk.pos.z);
  if (!Walk.grounded || Walk.vy !== 0) {
    Walk.vy -= 36 * dt;
    let ny = Walk.pos.y + Walk.vy * dt;
    if (ny <= gy + 1.65) { Walk.pos.y = gy + 1.65; Walk.vy = 0; Walk.grounded = true; }
    else { Walk.pos.y = ny; Walk.grounded = false; }
  } else {
    Walk.pos.y = THREE.MathUtils.lerp(Walk.pos.y, gy + 1.65, Math.min(1, dt * 16));
  }
  Engine.camera.position.set(Walk.pos.x, Walk.pos.y + Math.sin(Walk.bob) * 0.06, Walk.pos.z);
  walkRot();
}

function bindWalkKeys() {
  const set = (e, v) => {
    if (e.target.matches('button,input,textarea,select')) return;
    if (e.key === 'Escape' && Walk.active) { stopWalk(); return; }
    if ((e.code === 'Space') && Walk.active) { if (v && Walk.grounded) { Walk.vy = 12; Walk.grounded = false; } e.preventDefault(); return; }
    if (!Walk.active) return;
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') Walk.keys.f = v;
    if (k === 's' || k === 'arrowdown') Walk.keys.b = v;
    if (k === 'a' || k === 'arrowleft') Walk.keys.l = v;
    if (k === 'd' || k === 'arrowright') Walk.keys.r = v;
    if (e.key === 'Shift') Walk.keys.shift = v;
  };
  addEventListener('keydown', e => set(e, true));
  addEventListener('keyup', e => set(e, false));
  const dom = Engine.renderer.domElement;
  dom.addEventListener('contextmenu', e => { if (Walk.active) e.preventDefault(); });
  dom.addEventListener('pointerdown', e => {
    if (!Walk.active || e.pointerType === 'touch') return;
    Walk.ptr = true; Walk.moved = 0; Walk.btn = e.button; Walk.lx = e.clientX; Walk.ly = e.clientY;
    if (e.button === 2) e.preventDefault();
  });
  addEventListener('pointermove', e => {
    if (!Walk.active || !Walk.ptr || e.pointerType === 'touch') return;
    const dx = e.clientX - Walk.lx, dy = e.clientY - Walk.ly;
    Walk.lx = e.clientX; Walk.ly = e.clientY; Walk.moved += Math.abs(dx) + Math.abs(dy);
    Walk.yaw -= dx * 0.0035;
    Walk.pitch = THREE.MathUtils.clamp(Walk.pitch - dy * 0.003, -Math.PI * 0.38, Math.PI * 0.38);
    walkRot();
  });
  addEventListener('pointerup', e => {
    if (Walk.active && Walk.ptr && e.pointerType !== 'touch' && Walk.moved < 5) {
      paintAt(Walk.btn === 2 ? 0 : 5);
    }
    Walk.ptr = false;
  });
}

// ---------------------------------------------------------------- 涂抹
const PAINT_C = 5;
export const Editor = { stack: [], busy: false };

function persistEdits() {
  try { localStorage.setItem('changan.edit.' + U.seed.toString(16), JSON.stringify(Editor.stack.slice(-8000))); } catch {}
}

export function replayEdits() {
  try {
    const raw = localStorage.getItem('changan.edit.' + U.seed.toString(16));
    const ops = raw ? JSON.parse(raw) : [];
    if (ops.length) {
      Editor.stack = ops;
      U.worker.postMessage({ cmd: 'edit', ops, reqId: ++U.reqId });
      showToast('已恢复 ' + ops.length + ' 处涂抹');
    }
  } catch {}
}

function paintAt(c) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), Engine.camera);
  const hits = ray.intersectObjects(Engine.chunkGroup.children, false);
  if (!hits.length) return;
  const hit = hits[0];
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const p = hit.point;
  let x, y, z;
  if (c === 0) {
    x = Math.floor(p.x - n.x * 0.02); y = Math.floor(p.y - n.y * 0.02); z = Math.floor(p.z - n.z * 0.02);
  } else {
    x = Math.floor(p.x + n.x * 0.51); y = Math.floor(p.y + n.y * 0.51); z = Math.floor(p.z + n.z * 0.51);
  }
  const W = U.meta.world;
  if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 1 || y >= (W.H || 64) - 1) return;
  const op = { x, y, z, c };
  Editor.stack.push(op);
  persistEdits();
  U.worker.postMessage({ cmd: 'edit', ops: [op], reqId: ++U.reqId });
  const hud = document.getElementById('edit-hud');
  if (hud) hud.textContent = (c ? '涂抹' : '消除') + `  (${x},${y},${z})`;
}

export function undoEdit() {
  const op = Editor.stack.pop();
  if (!op) { showToast('没有可撤销的涂抹'); return; }
  persistEdits();
  U.worker.postMessage({ cmd: 'edit', ops: [{ x: op.x, y: op.y, z: op.z, c: op.c ? 0 : PAINT_C }], reqId: ++U.reqId });
  showToast('已撤销');
}

export function applyColPatches(patches) {
  if (!patches || !U.fields) return;
  for (const p of patches) {
    const i = fieldI(p.x, p.z);
    if (i < 0) continue;
    U.fields.topH[i] = p.topH;
    U.fields.topColor[i] = p.topColor;
  }
}

// ---------------------------------------------------------------- 小地图
export const Mini = { mode: 'global', base: null, lastRadar: 0 };

function wxzToPx(x, z, w, h, W) {
  const Wd = W.x1 - W.x0 + 1, Dd = W.z1 - W.z0 + 1;
  return [((x - W.x0) / Wd) * w, ((W.z1 - z) / Dd) * h];
}

function bakeMini() {
  const canvas = document.getElementById('minimap-canvas');
  if (!canvas || !U.fields) return;
  const w = canvas.width, h = canvas.height;
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const c = off.getContext('2d');
  const img = c.createImageData(w, h);
  const W = U.meta.world, F = U.fields;
  const Wd = W.x1 - W.x0 + 1, Dd = W.z1 - W.z0 + 1;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = W.x0 + Math.floor(px / w * Wd);
    const z = W.z1 - Math.floor(py / h * Dd);
    const i = (z - W.z0) * Wd + (x - W.x0);
    const o = (py * w + px) * 4;
    const road = F.road[i], water = F.water[i], ward = F.wardId[i];
    if (water) { img.data[o] = 80; img.data[o+1] = 150; img.data[o+2] = 148; img.data[o+3] = 255; }
    else if (road === 1) { img.data[o] = 196; img.data[o+1] = 168; img.data[o+2] = 120; img.data[o+3] = 255; }
    else if (road) { img.data[o] = 186; img.data[o+1] = 166; img.data[o+2] = 128; img.data[o+3] = 255; }
    else if (ward) {
      const s = 0.92 + (ward % 5) * 0.02;
      img.data[o] = 210 * s; img.data[o+1] = 196 * s; img.data[o+2] = 160 * s; img.data[o+3] = 255;
    } else { img.data[o] = 168; img.data[o+1] = 176; img.data[o+2] = 150; img.data[o+3] = 255; }
  }
  c.putImageData(img, 0, 0);
  c.strokeStyle = 'rgba(140,45,31,.55)'; c.lineWidth = 0.6;
  c.font = '6px "Microsoft YaHei UI", sans-serif';
  c.fillStyle = 'rgba(43,33,24,.82)';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const wd of U.meta.wards) {
    const [x0, y0] = wxzToPx(wd.x0, wd.z1, w, h, W);
    const [x1, y1] = wxzToPx(wd.x1, wd.z0, w, h, W);
    const rw = x1 - x0, rh = y1 - y0;
    if (wd.type === 'market') { c.fillStyle = 'rgba(179,71,51,.18)'; c.fillRect(x0, y0, rw, rh); c.fillStyle = 'rgba(43,33,24,.82)'; }
    c.strokeRect(x0, y0, rw, rh);
    if (rw > 10 && wd.name && wd.name !== '东市' && wd.type !== 'market') {
      if (wd.detail >= 1 || rw > 16) c.fillText(wd.name, x0 + rw / 2, y0 + rh / 2);
    } else if (wd.type === 'market' && wd.marketHalf === 'N') {
      c.fillText(wd.side === 'E' ? '东市' : '西市', x0 + rw / 2, y0 + rh);
    }
  }
  Mini.base = off;
}

function drawMini() {
  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const now = performance.now();
  const card = document.getElementById('minimap-card');
  if (card && card.classList.contains('collapsed')) return;
  if (Mini.mode === 'radar') {
    if (Mini.lastRadar && now - Mini.lastRadar < 160) return;
    Mini.lastRadar = now;
  }
  ctx.clearRect(0, 0, w, h);
  const W = U.meta.world;
  const fx = Walk.active ? Walk.pos.x : Engine.controls.target.x;
  const fz = Walk.active ? Walk.pos.z : Engine.controls.target.z;
  if (Mini.mode === 'global' && Mini.base) {
    ctx.drawImage(Mini.base, 0, 0);
    const [px, py] = wxzToPx(fx, fz, w, h, W);
    drawYou(ctx, px, py);
  } else {
    const range = 220;
    const img = ctx.createImageData(w, h);
    const F = U.fields, Wd = W.x1 - W.x0 + 1;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const x = Math.round(fx + (px / w - 0.5) * range);
      const z = Math.round(fz - (py / h - 0.5) * range);
      const o = (py * w + px) * 4;
      if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1) { img.data[o] = 40; img.data[o+1] = 36; img.data[o+2] = 28; img.data[o+3] = 255; continue; }
      const i = (z - W.z0) * Wd + (x - W.x0);
      const road = F.road[i], water = F.water[i];
      const top = F.topH[i] - F.groundH[i];
      if (water) { img.data[o] = 70; img.data[o+1] = 140; img.data[o+2] = 142; }
      else if (road) { img.data[o] = 210; img.data[o+1] = 190; img.data[o+2] = 150; }
      else if (top > 3) { img.data[o] = 176; img.data[o+1] = 86; img.data[o+2] = 70; }
      else { img.data[o] = 196; img.data[o+1] = 184; img.data[o+2] = 150; }
      img.data[o+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    drawYou(ctx, w / 2, h / 2);
  }
}

function drawYou(ctx, px, py) {
  ctx.fillStyle = '#b34733';
  ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
  const yaw = Walk.active ? Walk.yaw : Math.atan2(Engine.camera.position.x - Engine.controls.target.x, Engine.camera.position.z - Engine.controls.target.z);
  ctx.strokeStyle = '#8c2d1f'; ctx.beginPath();
  ctx.moveTo(px, py); ctx.lineTo(px + Math.sin(yaw) * 8, py - Math.cos(yaw) * 8); ctx.stroke();
}

function bindMini() {
  const canvas = document.getElementById('minimap-canvas');
  document.getElementById('minimap-mode')?.addEventListener('click', e => {
    e.stopPropagation();
    Mini.mode = Mini.mode === 'global' ? 'radar' : 'global';
    e.currentTarget.textContent = Mini.mode === 'radar' ? '全图' : '雷达';
  });
  document.getElementById('minimap-toggle')?.addEventListener('click', () => {
    const card = document.getElementById('minimap-card');
    card.classList.toggle('collapsed');
    document.getElementById('minimap-toggle').textContent = card.classList.contains('collapsed') ? '＋' : '─';
  });
  canvas?.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width * canvas.width;
    const cy = (e.clientY - rect.top) / rect.height * canvas.height;
    const W = U.meta.world, Wd = W.x1 - W.x0 + 1, Dd = W.z1 - W.z0 + 1;
    let tx, tz;
    if (Mini.mode === 'radar') {
      const fx = Walk.active ? Walk.pos.x : Engine.controls.target.x;
      const fz = Walk.active ? Walk.pos.z : Engine.controls.target.z;
      tx = fx + (cx / canvas.width - 0.5) * 220;
      tz = fz - (cy / canvas.height - 0.5) * 220;
    } else {
      tx = W.x0 + (cx / canvas.width) * Wd;
      tz = W.z1 - (cy / canvas.height) * Dd;
    }
    const y = walkHeight(tx, tz);
    if (Walk.active) Walk.pos.set(tx, y + 1.65, tz);
    else goToPoint(tx, y, tz);
  });
}

function goToPoint(x, y, z) {
  Engine.camera.position.set(x + 40, y + 36, z + 48);
  Engine.controls.target.set(x, y + 4, z);
  Engine.controls.update();
}

export function takePhoto() {
  const a = document.createElement('a');
  a.download = `长安_${U.seed.toString(16)}_${currentViewId}.png`;
  a.href = Engine.renderer.domElement.toDataURL('image/png');
  a.click();
  showToast('已保存截图');
}

export function copyShare() {
  const u = new URL(location.href);
  u.searchParams.set('seed', U.seed.toString(16));
  u.searchParams.set('view', currentViewId);
  u.searchParams.set('t', Life.hour.toFixed(1));
  u.searchParams.set('q', Engine.quality);
  const s = u.toString();
  const done = () => showToast('分享链接已复制');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(s).then(done).catch(() => fallbackCopy(s));
  } else fallbackCopy(s);
}

function fallbackCopy(s) {
  const i = document.createElement('input'); i.value = s; document.body.appendChild(i); i.select();
  try { document.execCommand('copy'); showToast('分享链接已复制'); }
  catch { showToast(s); }
  i.remove();
}

export function tickUI() { drawMini(); }

export function initUI(app) {
  U = app;
  bindWalkKeys();
  bakeMini();
  bindMini();
  document.getElementById('tour-toggle')?.addEventListener('click', e => {
    const p = document.querySelector('.tour-panel');
    p.classList.toggle('collapsed');
    e.currentTarget.textContent = p.classList.contains('collapsed') ? '展开' : '收起';
    e.currentTarget.setAttribute('aria-expanded', String(!p.classList.contains('collapsed')));
  });
  document.getElementById('auto-rotate')?.addEventListener('click', toggleAutoTour);
  document.getElementById('toggle-time')?.addEventListener('click', toggleAutoTime);
  document.getElementById('toggle-walk')?.addEventListener('click', toggleWalk);
  document.getElementById('toggle-audio')?.addEventListener('click', toggleAudio);
  document.getElementById('btn-photo')?.addEventListener('click', takePhoto);
  document.getElementById('btn-share')?.addEventListener('click', copyShare);
  document.querySelectorAll('.light-mode').forEach(b => b.addEventListener('click', () => setLightMode(b.dataset.light)));
  document.getElementById('lore-close')?.addEventListener('click', () => {
    document.getElementById('lore-card')?.setAttribute('aria-hidden', 'true');
  });
  const qPill = document.getElementById('quality-label')?.closest('.pill');
  if (qPill) {
    qPill.style.cursor = 'pointer';
    qPill.setAttribute('role', 'button');
    qPill.setAttribute('tabindex', '0');
    qPill.setAttribute('title', '点击切换画质：中 / 高 / 低');
    const cycleQ = () => {
      const next = { mid: 'high', high: 'low', low: 'mid' }[Engine.quality] || 'mid';
      Engine.autoQuality.enabled = false;
      applyQuality(next);
      showToast('画质已切换至：' + { high: '高', mid: '中', low: '低' }[next] + '（已锁定）');
    };
    qPill.addEventListener('click', cycleQ);
    qPill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { cycleQ(); e.preventDefault(); } });
  }
}
