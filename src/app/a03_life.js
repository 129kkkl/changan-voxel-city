// a03_life.js — 时辰状态机、actor 分频、昼夜天空、程序化街鼓市声
export const Life = {
  hour: 12,
  autoFlow: false,
  festival: false,
  doorsClosed: false,
  speed: 0.1,
  actors: null,
  sound: null,
};

const LIGHT_HOUR = { dawn: 6.2, noon: 12, dusk: 18.6, lantern: 21.2 };

function shiName(h) {
  const names = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  return names[Math.floor(((h + 1) % 24) / 2) % 12];
}

function phaseOf(h, festival) {
  if (festival) return '上元灯夜';
  if (h >= 5 && h < 7) return '晨鼓';
  if (h >= 11 && h < 13) return '正午';
  if (h >= 17 && h < 18.2) return '击钲散市';
  if (h >= 18.2 && h < 19.5) return '暮鼓';
  if (h >= 19.5 || h < 5) return '夜禁';
  if (h >= 7 && h < 11) return '开市';
  return '斜照';
}

function wantDoorsClosed(h, festival) {
  if (festival) return false;
  return h >= 18.45 || h < 5.35;
}

function civiliansOut(h, festival) {
  if (festival) return true;
  return h >= 5.5 && h < 18.6;
}

export function setClockLabel() {
  const el = document.getElementById('clock-label');
  if (!el) return;
  const h = Life.hour;
  const hh = String(Math.floor(h) % 24).padStart(2, '0');
  const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
  el.textContent = `${shiName(h)}时 ${hh}:${mm} · ${phaseOf(h, Life.festival)}`;
}

export function setLightMode(name) {
  Life.festival = name === 'lantern';
  Life.autoFlow = false;
  const btnT = document.getElementById('toggle-time');
  if (btnT) { btnT.classList.remove('active'); btnT.setAttribute('aria-pressed', 'false'); }
  document.querySelectorAll('.light-mode').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.light === name)));
  Life.hour = LIGHT_HOUR[name] ?? 12;
  applyDayNight();
  syncDoors();
  setClockLabel();
}

export function toggleAutoTime() {
  Life.autoFlow = !Life.autoFlow;
  const btn = document.getElementById('toggle-time');
  if (btn) { btn.classList.toggle('active', Life.autoFlow); btn.setAttribute('aria-pressed', String(Life.autoFlow)); }
  if (Life.autoFlow) document.querySelectorAll('.light-mode').forEach(b => b.setAttribute('aria-pressed', 'false'));
  return Life.autoFlow;
}

export function setHour(h) {
  Life.hour = ((h % 24) + 24) % 24;
  applyDayNight();
  syncDoors();
  setClockLabel();
}

export function applyDayNight() {
  const t = Life.hour;
  // 太阳运动：t=12 正午天顶(最高，偏南)，t=6 晨光东升，t=18 暮光西落，t=0 子时地底
  const sunRad = ((t - 12) / 24) * Math.PI * 2;
  const sunY = Math.cos(sunRad) * 320 + 20;
  const sunX = -Math.sin(sunRad) * 260;
  const sunZ = Math.cos(sunRad) * 160 + 60;
  const { hemi, sun, amb } = Engine.lights;
  sun.position.set(sunX, Math.max(8, sunY), sunZ);
  const day = THREE.MathUtils.clamp((sunY + 20) / 280, 0, 1);
  const dusk = Math.max(0, Math.sin(THREE.MathUtils.clamp((t - 16.0) / 3.6, 0, 1) * Math.PI));
  const dawn = Math.max(0, Math.sin(THREE.MathUtils.clamp((t - 4.8) / 3.0, 0, 1) * Math.PI));
  const night = THREE.MathUtils.clamp(1 - day * 1.35, 0, 1);
  const sunCol = new THREE.Color(0xddeeff).lerp(new THREE.Color(0xfff5e4), day);
  if (dusk > 0.05) sunCol.lerp(new THREE.Color(0xff8438), dusk * 0.75);
  if (dawn > 0.05) sunCol.lerp(new THREE.Color(0xffad6b), dawn * 0.6);
  sun.color.copy(sunCol);
  sun.intensity = THREE.MathUtils.lerp(0.12, 1.85, day) + dusk * 0.25;

  const hemiSky = new THREE.Color(0x425470).lerp(new THREE.Color(0xdcecf8), day);
  if (dusk > 0.05) hemiSky.lerp(new THREE.Color(0xdc8658), dusk * 0.75);
  else if (dawn > 0.05) hemiSky.lerp(new THREE.Color(0xd69a70), dawn * 0.5);
  hemi.color.copy(hemiSky);

  const hemiGnd = new THREE.Color(0x302c24).lerp(new THREE.Color(0x8a7a66), day);
  if (dusk > 0.05) hemiGnd.lerp(new THREE.Color(0x5a3c28), dusk * 0.6);
  hemi.groundColor.copy(hemiGnd);

  hemi.intensity = THREE.MathUtils.lerp(0.36, 0.52, day) + dusk * 0.28;

  const ambCol = new THREE.Color(0x344660).lerp(new THREE.Color(0xeef4fa), day);
  if (dusk > 0.05) ambCol.lerp(new THREE.Color(0xa86844), dusk * 0.65);
  amb.color.copy(ambCol);

  amb.intensity = THREE.MathUtils.lerp(0.36, 0.32, day) + dusk * 0.25 + night * 0.15;
  Engine.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.05, day) + dusk * 0.15;
  if (Engine.scene.fog) {
    const fc = new THREE.Color(0x182436).lerp(new THREE.Color(0xd0dce8), day);
    if (dusk > 0.1) fc.lerp(new THREE.Color(0xdca47a), dusk * 0.5);
    else if (dawn > 0.1) fc.lerp(new THREE.Color(0xdab294), dawn * 0.35);
    Engine.scene.fog.color.copy(fc);
  }
  if (Engine.sky) {
    const u = Engine.sky.material.uniforms;
    u.sunDir.value.copy(sun.position).normalize();
    u.nightMix.value = night;
    u.topColor.value.set(night > 0.6 ? 0x152238 : 0x76aee0);
    u.midColor.value.set(dusk > 0.4 ? 0xdf9e6c : (night > 0.6 ? 0x223048 : 0xd2dce6));
    u.botColor.value.set(dusk > 0.4 ? 0xc87d4a : (night > 0.6 ? 0x2c2b3e : 0xe8dbb6));
    u.sunColor.value.copy(sunCol);
  }
  if (Engine.materials.glow) Engine.materials.glow.opacity = 1;
  sun.target.position.set(0, 8, 0);
  sun.target.updateMatrixWorld();
}

function syncDoors() {
  const closed = wantDoorsClosed(Life.hour, Life.festival);
  if (closed === Life.doorsClosed) return;
  Life.doorsClosed = closed;
  const app = Life._app;
  if (!app || !app.worker || !app.meta || !app.meta.doors) return;
  const indices = app.meta.doors.map((_, i) => i);
  app.worker.postMessage({ cmd: 'doors', closed, indices, reqId: ++app.reqId });
  if (Life.sound && Life.sound.enabled) {
    if (closed) Life.sound.drum(9);
    else Life.sound.drum(11);
  }
}

export function initLife(app) {
  Life._app = app;
  Life.sound = new Soundtrack();
  spawnActors(app);
  if (Life.actors) Life.actors.update(0, Life.hour, civiliansOut(Life.hour, Life.festival));
  applyDayNight();
  syncDoors();
  setClockLabel();
}

export function tickLife(dt) {
  if (Life.autoFlow) {
    const prev = Life.hour;
    Life.hour = (Life.hour + dt * Life.speed) % 24;
    applyDayNight();
    syncDoors();
    setClockLabel();
    if (Life.sound && Life.sound.enabled) {
      const a = phaseOf(prev, Life.festival), b = phaseOf(Life.hour, Life.festival);
      if (a !== b) {
        if (b === '晨鼓' || b === '暮鼓') Life.sound.drum(10);
        else if (b === '击钲散市') Life.sound.zheng();
        else if (b === '正午') Life.sound.bell();
      }
    }
  }
  if (Life.sound) Life.sound.spatial(Engine.camera.position);
  if (Life.actors) Life.actors.update(dt, Life.hour, civiliansOut(Life.hour, Life.festival));
}

export function toggleAudio() {
  if (!Life.sound) return false;
  const on = Life.sound.toggle();
  const btn = document.getElementById('toggle-audio');
  if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); }
  return on;
}

// ---------------------------------------------------------------- 程序化音效（零音频文件）
class Soundtrack {
  constructor() {
    this.ctx = null; this.enabled = false; this.master = null;
    this.wind = null; this.market = null;
  }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    const n = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.98 * b0 + w * 0.06; b1 = 0.9 * b1 + w * 0.1;
      d[i] = (b0 + b1) * 0.5;
    }
    const mk = (type, freq, q, gain) => {
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = this.ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return g;
    };
    this.wind = mk('bandpass', 380, 2.1, 0.12);
    this.market = mk('lowpass', 900, 0.8, 0.0);
  }
  tone(freq, dur, type, amp, decay) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + dur);
  }
  drum(hits) {
    if (!this.ctx || !this.enabled) return;
    for (let i = 0; i < hits; i++) {
      setTimeout(() => {
        this.tone(90 + (i % 3) * 8, 0.35, 'sine', 0.45, 0.32);
        this.tone(48, 0.4, 'triangle', 0.22, 0.38);
      }, i * 160);
    }
  }
  zheng() {
    if (!this.ctx || !this.enabled) return;
    for (let i = 0; i < 8; i++) setTimeout(() => this.tone(880 - i * 12, 0.25, 'square', 0.12, 0.22), i * 140);
  }
  bell() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    [1, 2.01, 2.96, 4.05].forEach((p, i) => {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 246 * p;
      g.gain.setValueAtTime(0.28 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 3.2 + i * 0.3);
      o.connect(g); g.connect(this.master); o.start(now); o.stop(now + 4);
    });
  }
  spatial(cam) {
    if (!this.ctx || !this.enabled || !this.market) return;
    const app = Life._app; if (!app || !app.meta) return;
    const wm = app.meta.viewAnchors.westMarket, em = app.meta.viewAnchors.eastMarket;
    const d = Math.min(cam.distanceTo(new THREE.Vector3(wm.x, cam.y, wm.z)), cam.distanceTo(new THREE.Vector3(em.x, cam.y, em.z)));
    const day = civiliansOut(Life.hour, Life.festival) ? 1 : 0.05;
    const near = THREE.MathUtils.clamp(1.15 - d / 220, 0, 1) * day;
    const now = this.ctx.currentTime;
    this.market.gain.setTargetAtTime(near * 0.22, now, 0.3);
    this.wind.gain.setTargetAtTime(0.08 + cam.y / 800, now, 0.3);
  }
  toggle() {
    this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    this.master.gain.linearRampToValueAtTime(this.enabled ? 0.55 : 0, now + 0.8);
    if (this.enabled) this.bell();
    return this.enabled;
  }
}

// ---------------------------------------------------------------- actor
const HEX = {
  purple: 0x5f3a75, fei: 0xa83a32, green: 0x4a7a44, qing: 0x3a5a7d,
  hemp: 0x8a7a5f, monk: 0xc9762a, armor: 0x4a4e55, skirt: 0xc85a6a,
  hu: 0xb0693a, camel: 0xb08a5a, ox: 0x5f5648, timber: 0x6d4a2f,
  skin: 0xc9916a, zhu: 0xb23a27, cream: 0xeee0bf, hat: 0x3a2a1c,
};

function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return Math.max(1, L);
}
function pathAt(pts, t, loop) {
  const n = pts.length;
  if (n === 1) return [pts[0][0], pts[0][1], 0];
  const segs = loop ? n : n - 1;
  let x = ((t % 1) + 1) % 1 * segs;
  if (!loop) x = THREE.MathUtils.clamp(t, 0, 0.999) * segs;
  const i = Math.min(segs - 1, Math.floor(x));
  const u = x - i;
  const a = pts[i], b = pts[(i + 1) % n];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return [a[0] + dx * u, a[1] + dz * u, Math.atan2(dx, dz)];
}

function spawnActors(app) {
  const paths = app.meta.paths || {};
  const cap = ({ high: 900, mid: 550, low: 280 }[Engine.quality] || 550);
  const extra = [
    { key: 'zhuque', pts: [[-1, 260], [-1, -90]], loop: false },
    { key: 'heng', pts: [[-90, -228], [90, -228]], loop: false },
    { key: 'eastwest', pts: [[-300, 75], [300, 75]], loop: false },
  ];
  const routes = [];
  const add = (pts, loop, count, kind, hours, speed, color, scale) => {
    if (!pts || pts.length < 2) return;
    routes.push({ pts, loop: !!loop, count, kind, hours, speed, color, scale });
  };
  add(paths.camel && paths.camel.pts, false, 18, 'camel', [7, 17.5], 5.2, HEX.camel, 1.6);
  add(paths.court && paths.court.pts, false, 22, 'official', [5.5, 11], 6.0, HEX.purple, 1);
  add(paths.courtW && paths.courtW.pts, false, 16, 'official', [5.5, 11], 5.8, HEX.fei, 1);
  add(paths.daming && paths.daming.pts, false, 12, 'official', [5.5, 11.5], 6.2, HEX.qing, 1);
  add(paths.pilgrimYan && paths.pilgrimYan.pts, false, 10, 'monk', [9, 17], 3.6, HEX.monk, 1);
  add(paths.pilgrimQing && paths.pilgrimQing.pts, false, 8, 'lady', [10, 17], 3.8, HEX.skirt, 1);
  add(paths.patrol && paths.patrol.pts, true, 10, 'jinwu', [0, 24], 4.4, HEX.armor, 1.05);
  add(paths.patrolAxis && paths.patrolAxis.pts, true, 8, 'jinwu', [0, 24], 4.2, HEX.armor, 1.05);
  add(paths.toWestMarket && paths.toWestMarket.pts, false, 28, 'hu', [8, 17.2], 4.6, HEX.hu, 1);
  add(paths.toEastMarket && paths.toEastMarket.pts, false, 22, 'common', [8, 17.2], 4.4, HEX.hemp, 1);
  add(paths.boatYongan && paths.boatYongan.pts, false, 5, 'boat', [8, 17], 3.2, HEX.timber, 1.8);
  add(paths.boatQujiang && paths.boatQujiang.pts, true, 6, 'boat', [11, 17.5], 2.6, HEX.timber, 1.8);
  extra.forEach(e => add(e.pts, e.loop, 14, 'common', [6.5, 18], 4.5, HEX.hemp, 1));
  add(paths.toWestMarket && paths.toWestMarket.pts, false, 8, 'oxcart', [8, 16.5], 3.1, HEX.ox, 1.3);

  const list = [];
  for (const r of routes) {
    for (let i = 0; i < r.count && list.length < cap; i++) {
      list.push({
        kind: r.kind, pts: r.pts, loop: r.loop, hours: r.hours,
        speed: r.speed * (0.85 + (i % 5) * 0.06),
        color: r.color, scale: r.scale,
        t: (i / Math.max(1, r.count)) % 1, dir: 1,
        len: pathLen(r.pts), nightOwl: r.kind === 'jinwu',
        px: r.pts[0][0], pz: r.pts[0][1], yaw: 0, hidden: false,
      });
    }
  }
  Life.actors = new ActorSystem(list);
}

class ActorSystem {
  constructor(list) {
    this.list = list;
    this.dummy = new THREE.Object3D();
    this._frame = 0;
    this.hidden = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    this.hidden.setPosition(0, -80, 0);
    const n = list.length;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.body = new THREE.InstancedMesh(box, mat(), n);
    this.head = new THREE.InstancedMesh(box, mat(), n);
    this.hat = new THREE.InstancedMesh(box, mat(), n);
    [this.body, this.head, this.hat].forEach(m => {
      m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      Engine.dynGroup.add(m);
    });
    const skin = new THREE.Color(HEX.skin);
    const hatc = new THREE.Color(HEX.hat);
    list.forEach((a, i) => {
      this.body.setColorAt(i, new THREE.Color(a.color));
      this.head.setColorAt(i, skin);
      this.hat.setColorAt(i, a.kind === 'hu' ? new THREE.Color(HEX.zhu) : hatc);
      this.hide(i);
    });
    this.body.instanceColor.needsUpdate = true;
    this.head.instanceColor.needsUpdate = true;
    this.hat.instanceColor.needsUpdate = true;
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.hat.instanceMatrix.needsUpdate = true;
  }
  pose(mesh, i, x, y, z, yaw, sx, sy, sz) {
    const d = this.dummy;
    d.position.set(x, y, z); d.rotation.set(0, yaw, 0); d.scale.set(sx, sy, sz);
    d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
  }
  hide(i) {
    this.body.setMatrixAt(i, this.hidden);
    this.head.setMatrixAt(i, this.hidden);
    this.hat.setMatrixAt(i, this.hidden);
  }
  inHours(a, hour) {
    if (a.nightOwl) return true;
    const [p, q] = a.hours;
    return p <= q ? (hour >= p && hour < q) : (hour >= p || hour < q);
  }
  groundY(x, z, boat) {
    const app = Life._app, W = app.meta.world, F = app.fields;
    const ix = Math.round(x), iz = Math.round(z);
    if (ix < W.x0 || ix > W.x1 || iz < W.z0 || iz > W.z1) return 4;
    const i = (iz - W.z0) * (W.x1 - W.x0 + 1) + (ix - W.x0);
    const gh = F.groundH[i] != null ? F.groundH[i] : 4;
    const th = F.topH[i] != null ? F.topH[i] : gh;
    if (boat) return gh + 0.4;
    // 低矮台阶贴面(<=1)，门洞/城门/树冠/屋顶(>1)贴地行走，防浮空
    const y = (th - gh <= 1) ? th : gh;
    return y + 0.08;
  }
  update(dt, hour, civOut) {
    this._frame++;
    const cam = Engine.camera.position;
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const a = this.list[i];
      const isCiv = a.kind !== 'jinwu';
      const show = this.inHours(a, hour) && (a.nightOwl || civOut || !isCiv);
      if (!show) { if (!a.hidden) { this.hide(i); a.hidden = true; } continue; }
      a.hidden = false;
      const d2 = (a.px - cam.x) ** 2 + (a.pz - cam.z) ** 2;
      const period = d2 < 80 * 80 ? 1 : d2 < 220 * 220 ? 3 : 8;
      if (this._frame % period !== i % period) continue;
      a.t += a.dir * (dt * a.speed) / a.len;
      if (a.loop) { if (a.t > 1) a.t -= 1; if (a.t < 0) a.t += 1; }
      else {
        if (a.t >= 1) { a.t = 1; a.dir = -1; }
        if (a.t <= 0) { a.t = 0; a.dir = 1; }
      }
      const p = pathAt(a.pts, a.t, a.loop);
      a.px = p[0]; a.pz = p[1]; a.yaw = p[2];
      const y = this.groundY(a.px, a.pz, a.kind === 'boat');
      const s = a.scale;
      if (a.kind === 'camel') {
        this.pose(this.body, i, a.px, y + 0.55 * s, a.pz, a.yaw, 0.7 * s, 0.7 * s, 1.35 * s);
        this.pose(this.head, i, a.px + Math.sin(a.yaw) * 0.7 * s, y + 1.05 * s, a.pz + Math.cos(a.yaw) * 0.7 * s, a.yaw, 0.32 * s, 0.38 * s, 0.32 * s);
        this.pose(this.hat, i, a.px, y + 1.15 * s, a.pz, a.yaw, 0.18 * s, 0.5 * s, 0.18 * s);
      } else if (a.kind === 'boat' || a.kind === 'oxcart') {
        this.pose(this.body, i, a.px, y + 0.28 * s, a.pz, a.yaw, 0.7 * s, 0.35 * s, 1.4 * s);
        this.pose(this.head, i, a.px, y + 0.62 * s, a.pz, a.yaw, 0.25 * s, 0.25 * s, 0.35 * s);
        this.hat.setMatrixAt(i, this.hidden);
      } else {
        this.pose(this.body, i, a.px, y + 0.55 * s, a.pz, a.yaw, 0.38 * s, 0.95 * s, 0.26 * s);
        this.pose(this.head, i, a.px, y + 1.18 * s, a.pz, a.yaw, 0.28 * s, 0.28 * s, 0.28 * s);
        this.pose(this.hat, i, a.px, y + 1.38 * s, a.pz, a.yaw, a.kind === 'hu' ? 0.22 * s : 0.32 * s, a.kind === 'hu' ? 0.28 * s : 0.12 * s, 0.32 * s);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.hat.instanceMatrix.needsUpdate = true;
  }
}
