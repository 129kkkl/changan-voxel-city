// g04_fine.js — M2 建筑层：1/8 定点细体素、BuildingAssembly、四材质、三档 LOD
// 这层只负责可见建筑。VoxStore 继续保留道路/城坊骨架与粗碰撞代理。
'use strict';
(function () {
const Q = 8;
const ORDINARY_SNAP = 2; // 1/4 城市格
const LANDMARK_SNAP = 1; // 1/8 城市格
const ARCH_CHUNK = 80;
const MAT = { earth: 'earth', timber: 'timber', tile: 'tile', accent: 'accent', mass: 'mass' };

const GRAMMARS = {
  residence: [
    '单进三间宅','单进五间宅','单进偏门宅','单进深庭宅','双进前堂后寝','双进穿廊宅',
    '东西厢合院','单厢开庭宅','跨院复合宅','厨院后置宅','井园宅','小型乌头门宅',
    '临巷曲尺宅','前窄后阔宅','前庭后园宅','并列双院宅','廊庑围庭宅','南坊园圃宅'
  ],
  official: ['门堂戒石署','前堂后寝署','双廊正堂署','三进官廨','仓曹合署','礼仪轴线署'],
  temple: ['单院佛寺','廊院佛寺','前塔后殿寺','三进皇家寺','僧坊经院'],
  market: ['前店后宅','前铺后坊','邸店天井','高墙仓栈','作坊火院','胡商合院','临渠货栈','双面街铺','奢侈品铺院','市署楼院'],
  palace: ['前朝大殿','宫门阙楼','重楼阁院','皇家寺院','朝序廊院','苑囿楼台'],
};

function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, v | 0)); }
function qSnap(v, snap) { return Math.round(v * Q / snap) * snap; }
function qFloor(v) { return Math.floor(v * Q); }
function qCeil(v) { return Math.ceil(v * Q); }
function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

class FineVoxelStore {
  constructor() { this.boxes = []; this.revision = 0; }
  addQ(x0, y0, z0, x1, y1, z1, color, material, lod, buildingId) {
    x0 |= 0; y0 |= 0; z0 |= 0; x1 |= 0; y1 |= 0; z1 |= 0;
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return null;
    const W = CFG.WORLD;
    const minX = W.x0 * Q, maxX = (W.x1 + 1) * Q;
    const minZ = W.z0 * Q, maxZ = (W.z1 + 1) * Q;
    x0 = Math.max(x0, minX); x1 = Math.min(x1, maxX);
    z0 = Math.max(z0, minZ); z1 = Math.min(z1, maxZ);
    y0 = Math.max(0, y0); y1 = Math.min(W.H * Q, y1);
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return null;
    const b = { x0, y0, z0, x1, y1, z1, color: color | 0, material: material || MAT.earth, lod: lod | 0, buildingId: buildingId | 0 };
    this.boxes.push(b); this.revision++;
    return b;
  }
  addWorld(x0, y0, z0, x1, y1, z1, color, material, lod, buildingId, snap) {
    snap = snap || ORDINARY_SNAP;
    return this.addQ(qSnap(x0, snap), qSnap(y0, snap), qSnap(z0, snap), qSnap(x1, snap), qSnap(y1, snap), qSnap(z1, snap), color, material, lod, buildingId);
  }
  removeCell(qx, qy, qz) {
    const next = [];
    let removed = 0;
    for (const b of this.boxes) {
      if (qx < b.x0 || qx >= b.x1 || qy < b.y0 || qy >= b.y1 || qz < b.z0 || qz >= b.z1) { next.push(b); continue; }
      removed++;
      const copy = (x0, y0, z0, x1, y1, z1) => {
        if (x1 > x0 && y1 > y0 && z1 > z0) next.push({ x0, y0, z0, x1, y1, z1, color: b.color, material: b.material, lod: b.lod, buildingId: b.buildingId });
      };
      copy(b.x0, b.y0, b.z0, qx, b.y1, b.z1);
      copy(qx + 1, b.y0, b.z0, b.x1, b.y1, b.z1);
      copy(qx, b.y0, b.z0, qx + 1, qy, b.z1);
      copy(qx, qy + 1, b.z0, qx + 1, b.y1, b.z1);
      copy(qx, qy, b.z0, qx + 1, qy + 1, qz);
      copy(qx, qy, qz + 1, qx + 1, qy + 1, b.z1);
    }
    if (removed) { this.boxes = next; this.revision++; }
    return removed;
  }
  hasCell(qx, qy, qz) {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      if (b.lod === 0 && qx >= b.x0 && qx < b.x1 && qy >= b.y0 && qy < b.y1 && qz >= b.z0 && qz < b.z1) return b;
    }
    return null;
  }
  hasMacroCell(x, y, z) {
    const x0 = x * Q, y0 = y * Q, z0 = z * Q, x1 = x0 + Q, y1 = y0 + Q, z1 = z0 + Q;
    return this.boxes.some(b => b.lod === 0 && b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0 && b.z0 < z1 && b.z1 > z0);
  }
}

function ensure(ctx) {
  if (!ctx.fineStore) ctx.fineStore = new FineVoxelStore();
  if (!ctx.buildings) ctx.buildings = [];
  if (!ctx.buildingByKey) ctx.buildingByKey = new Map();
  if (!ctx._grammarRoleCount) ctx._grammarRoleCount = Object.create(null);
  if (!ctx._fineAssemblyStack) ctx._fineAssemblyStack = [];
  if (!ctx.archMask) {
    const W = CFG.WORLD;
    const volume = (W.x1 - W.x0 + 1) * (W.z1 - W.z0 + 1) * W.H;
    ctx.archMask = new Uint8Array(Math.ceil(volume / 8));
  }
  return ctx.fineStore;
}

function maskIndex(x, y, z) {
  const W = CFG.WORLD;
  if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= W.H) return -1;
  return ((x - W.x0) * (W.z1 - W.z0 + 1) + (z - W.z0)) * W.H + y;
}
function setMask(ctx, x, y, z, value) {
  ensure(ctx);
  const i = maskIndex(x, y, z); if (i < 0) return;
  const bi = i >> 3, bit = 1 << (i & 7);
  if (value === false) ctx.archMask[bi] &= ~bit;
  else ctx.archMask[bi] |= bit;
}
function isMasked(ctx, x, y, z) {
  if (!ctx.archMask) return false;
  const i = maskIndex(x, y, z); if (i < 0) return false;
  return !!(ctx.archMask[i >> 3] & (1 << (i & 7)));
}
function maskPrism(ctx, x0, y0, z0, x1, y1, z1) {
  const W = CFG.WORLD;
  x0 = clampInt(Math.floor(x0), W.x0, W.x1); x1 = clampInt(Math.ceil(x1), W.x0, W.x1);
  z0 = clampInt(Math.floor(z0), W.z0, W.z1); z1 = clampInt(Math.ceil(z1), W.z0, W.z1);
  y0 = clampInt(Math.floor(y0), 0, W.H - 1); y1 = clampInt(Math.ceil(y1), 0, W.H - 1);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) setMask(ctx, x, y, z, true);
}

function wardAt(ctx, x, z) {
  for (const w of ctx.wards || []) if (x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1) return w;
  return null;
}
function roleCatalog(role) {
  if (role === 'residence' || role === 'manor') return GRAMMARS.residence;
  if (role === 'office') return GRAMMARS.official;
  if (role === 'temple') return GRAMMARS.temple;
  if (role === 'market' || role === 'warehouse') return GRAMMARS.market;
  return GRAMMARS.palace;
}
function current(ctx) {
  const s = ctx._fineAssemblyStack || [];
  return s.length ? s[s.length - 1] : null;
}
function inferKey(ctx, spec) {
  const cx = (spec.x0 + spec.x1) * 0.5, cz = (spec.z0 + spec.z1) * 0.5;
  const lm = ctx._landmarkStack && ctx._landmarkStack.length ? ctx._landmarkStack[ctx._landmarkStack.length - 1] : null;
  if (lm) return 'landmark:' + lm;
  const w = wardAt(ctx, cx, cz);
  if (spec.key) return spec.key;
  if (spec.role === 'market' || spec.role === 'warehouse') {
    const side = cx < 0 ? 'W' : 'E';
    return 'market:' + side + ':' + Math.floor((Math.abs(cx) - 165) / 16) + ':' + Math.floor((cz - 78) / 20);
  }
  if (w) {
    if (spec.role === 'temple' || spec.role === 'office') return 'ward:' + w.id + ':' + spec.role;
    const qx = cx < (w.x0 + w.x1) * 0.5 ? 0 : 1;
    const qz = cz < (w.z0 + w.z1) * 0.5 ? 0 : 1;
    return 'ward:' + w.id + ':court:' + (qz * 2 + qx);
  }
  return (spec.role || 'building') + ':' + Math.round(cx / 12) + ':' + Math.round(cz / 12);
}
function ensureAssembly(ctx, spec) {
  ensure(ctx);
  const key = inferKey(ctx, spec);
  let a = ctx.buildingByKey.get(key);
  if (!a) {
    const id = ctx.buildings.length + 1;
    const w = wardAt(ctx, (spec.x0 + spec.x1) * 0.5, (spec.z0 + spec.z1) * 0.5);
    const role = spec.role || 'residence';
    const catalog = roleCatalog(role);
    const roleOrdinal = ctx._grammarRoleCount[role] || 0;
    ctx._grammarRoleCount[role] = roleOrdinal + 1;
    const variant = (roleOrdinal + CHANGAN.hashSeed(ctx.seed, 'arch-grammar-' + role)) % catalog.length;
    a = {
      id, key, wardId: w ? w.id : 0, role, rank: spec.rank == null ? 1 : spec.rank,
      evidenceLevel: spec.evidenceLevel || (role === 'palace' || role === 'gate' || role === 'pagoda' ? 'A/B' : 'B/C'),
      transform: { position: [0, 0, 0], rotationY: 0, quant: role === 'palace' || role === 'gate' || role === 'pagoda' ? 8 : 4 },
      footprint: { x0: spec.x0, z0: spec.z0, x1: spec.x1, z1: spec.z1 },
      collisionProxy: { x0: Math.floor(spec.x0), y0: Math.floor(spec.base || 0), z0: Math.floor(spec.z0), x1: Math.ceil(spec.x1), y1: Math.ceil((spec.base || 0) + 8), z1: Math.ceil(spec.z1) },
      grammar: catalog[variant], variant, components: [], normalizedSignature: '', lods: [{ level: 0 }, { level: 1 }, { level: 2 }],
    };
    ctx.buildings.push(a); ctx.buildingByKey.set(key, a);
  } else {
    a.footprint.x0 = Math.min(a.footprint.x0, spec.x0); a.footprint.z0 = Math.min(a.footprint.z0, spec.z0);
    a.footprint.x1 = Math.max(a.footprint.x1, spec.x1); a.footprint.z1 = Math.max(a.footprint.z1, spec.z1);
    a.rank = Math.max(a.rank, spec.rank == null ? 1 : spec.rank);
  }
  return a;
}
function pushAssembly(ctx, spec) { const a = ensureAssembly(ctx, spec); ctx._fineAssemblyStack.push(a); return a; }
function popAssembly(ctx) { return (ctx._fineAssemblyStack || []).pop(); }
function withAssembly(ctx, spec, fn) {
  const had = current(ctx); let pushed = false;
  if (!had) { pushAssembly(ctx, spec); pushed = true; }
  try { return fn(current(ctx)); } finally { if (pushed) popAssembly(ctx); }
}
function addToken(a, token) { if (a && token) a.components.push(token); }

function addBox(ctx, a, lod, material, color, x0, y0, z0, x1, y1, z1, snap) {
  a.footprint.x0=Math.min(a.footprint.x0,x0); a.footprint.z0=Math.min(a.footprint.z0,z0);
  a.footprint.x1=Math.max(a.footprint.x1,x1); a.footprint.z1=Math.max(a.footprint.z1,z1);
  a.collisionProxy.x0=Math.min(a.collisionProxy.x0,Math.floor(x0)); a.collisionProxy.z0=Math.min(a.collisionProxy.z0,Math.floor(z0));
  a.collisionProxy.x1=Math.max(a.collisionProxy.x1,Math.ceil(x1)); a.collisionProxy.z1=Math.max(a.collisionProxy.z1,Math.ceil(z1));
  a.collisionProxy.y1=Math.max(a.collisionProxy.y1,Math.ceil(y1));
  return ensure(ctx).addWorld(x0, y0, z0, x1, y1, z1, color, material, lod, a.id, snap || (a.rank >= 4 ? LANDMARK_SNAP : ORDINARY_SNAP));
}

function addWallWithGap(ctx, a, lod, material, color, axis, fixed, lo, hi, y0, y1, thick, gapC, gapW, snap) {
  if (gapC == null) {
    if (axis === 'x') addBox(ctx, a, lod, material, color, lo, y0, fixed, hi, y1, fixed + thick, snap);
    else addBox(ctx, a, lod, material, color, fixed, y0, lo, fixed + thick, y1, hi, snap);
    return;
  }
  const ga = gapC - gapW * 0.5, gb = gapC + gapW * 0.5;
  if (axis === 'x') {
    addBox(ctx, a, lod, material, color, lo, y0, fixed, ga, y1, fixed + thick, snap);
    addBox(ctx, a, lod, material, color, gb, y0, fixed, hi, y1, fixed + thick, snap);
  } else {
    addBox(ctx, a, lod, material, color, fixed, y0, lo, fixed + thick, y1, ga, snap);
    addBox(ctx, a, lod, material, color, fixed, y0, gb, fixed + thick, y1, hi, snap);
  }
}

function fineRoof(ctx, a, x0, z0, x1, z1, y, type, rank, opts) {
  opts = opts || {};
  const snap = rank >= 4 ? LANDMARK_SNAP : ORDINARY_SNAP;
  const w = x1 - x0, d = z1 - z0, alongX = w >= d;
  const eave = Math.min(1.5, 0.5 + rank * 0.125 + (a.variant % 3) * 0.125);
  const step = snap / Q;
  const shortSpan = Math.max(1, alongX ? d : w);
  const steps = Math.max(3, Math.min(rank >= 4 ? 10 : 6, Math.round((shortSpan * 0.5 + eave) / step)));
  const main = opts.main || PAL.roofGrey, lip = opts.lip || PAL.roofLight;
  for (let s = 0; s < steps; s++) {
    const shrink = s * step;
    let ax0 = x0 - eave, ax1 = x1 + eave, az0 = z0 - eave, az1 = z1 + eave;
    if (alongX) {
      az0 += shrink; az1 -= shrink;
      if (type === 'hip' || type === 'xie') { const end = type === 'hip' ? shrink * 0.55 : Math.max(0, shrink - shortSpan * 0.25) * 0.35; ax0 += end; ax1 -= end; }
    } else {
      ax0 += shrink; ax1 -= shrink;
      if (type === 'hip' || type === 'xie') { const end = type === 'hip' ? shrink * 0.55 : Math.max(0, shrink - shortSpan * 0.25) * 0.35; az0 += end; az1 -= end; }
    }
    if (ax1 - ax0 < step || az1 - az0 < step) break;
    addBox(ctx, a, 0, MAT.tile, s === 0 ? lip : main, ax0, y + s * step, az0, ax1, y + (s + 1) * step, az1, snap);
  }
  const rise = steps * step;
  if (alongX) addBox(ctx, a, 0, MAT.tile, PAL.roofDark, x0 - eave * 0.45, y + rise, (z0 + z1) * 0.5 - step, x1 + eave * 0.45, y + rise + step * 1.25, (z0 + z1) * 0.5 + step, snap);
  else addBox(ctx, a, 0, MAT.tile, PAL.roofDark, (x0 + x1) * 0.5 - step, y + rise, z0 - eave * 0.45, (x0 + x1) * 0.5 + step, y + rise + step * 1.25, z1 + eave * 0.45, snap);
  if (rank >= 3) {
    const trim = opts.trim || (rank >= 4 ? PAL.glazeGreen : PAL.bronze);
    if (alongX) for (const x of [x0 - eave * 0.35, x1 + eave * 0.35]) addBox(ctx, a, 0, MAT.accent, trim, x - step, y + rise, (z0 + z1) * 0.5 - step, x + step, y + rise + step * 2, (z0 + z1) * 0.5 + step, snap);
    else for (const z of [z0 - eave * 0.35, z1 + eave * 0.35]) addBox(ctx, a, 0, MAT.accent, trim, (x0 + x1) * 0.5 - step, y + rise, z - step, (x0 + x1) * 0.5 + step, y + rise + step * 2, z + step, snap);
  }
  // LOD1：三片缓坡；LOD2：一体化远景轮廓。
  const l1step = Math.max(0.25, step * 2);
  for (let s = 0; s < 3; s++) {
    const shrink = s * Math.max(0.25, shortSpan / 7);
    const ax0 = x0 - eave + (alongX ? (type === 'hip' ? shrink * .35 : 0) : shrink);
    const ax1 = x1 + eave - (alongX ? (type === 'hip' ? shrink * .35 : 0) : shrink);
    const az0 = z0 - eave + (alongX ? shrink : (type === 'hip' ? shrink * .35 : 0));
    const az1 = z1 + eave - (alongX ? shrink : (type === 'hip' ? shrink * .35 : 0));
    addBox(ctx, a, 1, MAT.mass, main, ax0, y + s * l1step, az0, ax1, y + (s + 1) * l1step, az1, snap);
  }
  addBox(ctx, a, 2, MAT.mass, main, x0 - eave * .65, y, z0 - eave * .65, x1 + eave * .65, y + Math.max(.5, rise * .65), z1 + eave * .65, snap);
  return y + rise + step * 2;
}

function fineFrame(ctx, a, x0, z0, x1, z1, y0, rank, opts) {
  opts = opts || {};
  const snap = rank >= 4 ? LANDMARK_SNAP : ORDINARY_SNAP;
  const t = rank >= 4 ? .25 : .25;
  const h = opts.frameH || (rank >= 4 ? 4 : rank >= 2 ? 2.5 : 1.75);
  const maxBays = rank >= 5 ? 11 : rank >= 3 ? 7 : 5;
  const bays = Math.max(2, Math.min(maxBays, (opts.bays || Math.round((x1 - x0) / 1.5)) + (a.variant % 3) - 1));
  const bx0 = x0 + .25, bx1 = x1 - .25, bz0 = z0 + .25, bz1 = z1 - .25;
  for (let i = 0; i <= bays; i++) {
    const x = bx0 + (bx1 - bx0) * i / bays;
    for (const z of [bz0, bz1]) addBox(ctx, a, 0, MAT.timber, rank >= 4 ? PAL.zhuBright : PAL.zhu, x - t * .5, y0, z - t * .5, x + t * .5, y0 + h, z + t * .5, snap);
  }
  const depthRows = (z1 - z0) >= 5 ? 2 : 1;
  for (let j = 0; j <= depthRows; j++) {
    const z = bz0 + (bz1 - bz0) * j / depthRows;
    for (const x of [bx0, bx1]) addBox(ctx, a, 0, MAT.timber, PAL.zhu, x - t * .5, y0, z - t * .5, x + t * .5, y0 + h, z + t * .5, snap);
  }
  addBox(ctx, a, 0, MAT.timber, PAL.zhuDeep, x0, y0 + h - .25, bz0 - .125, x1, y0 + h, bz0 + .125, snap);
  addBox(ctx, a, 0, MAT.timber, PAL.zhuDeep, x0, y0 + h - .25, bz1 - .125, x1, y0 + h, bz1 + .125, snap);
  const panelY1 = y0 + h * .7;
  addWallWithGap(ctx, a, 0, MAT.earth, opts.wallC || PAL.plasterWarm, 'x', bz0 + .125, bx0, bx1, y0 + .125, panelY1, .25, opts.door === 'N' ? (x0 + x1) * .5 : null, 1.1, snap);
  addWallWithGap(ctx, a, 0, MAT.earth, opts.wallC || PAL.plaster, 'x', bz1 - .125, bx0, bx1, y0 + .125, panelY1, .25, opts.door === 'S' || !opts.door ? (x0 + x1) * .5 : null, 1.1, snap);
  // 门扇与直棂窗带。
  const dc = PAL.doorDark;
  if ((opts.door || 'S') === 'S') addBox(ctx, a, 0, MAT.timber, dc, (x0 + x1) * .5 - .5, y0 + .125, bz1 - .05, (x0 + x1) * .5 + .5, y0 + Math.min(1.5, h * .72), bz1 + .15, snap);
  if ((opts.door || 'S') === 'N') addBox(ctx, a, 0, MAT.timber, dc, (x0 + x1) * .5 - .5, y0 + .125, bz0 - .15, (x0 + x1) * .5 + .5, y0 + Math.min(1.5, h * .72), bz0 + .05, snap);
  const slats = Math.min(7, bays);
  for (let i = 1; i < slats; i += 2) {
    const x = bx0 + (bx1 - bx0) * i / slats;
    addBox(ctx, a, 0, MAT.timber, PAL.timberDark, x - .125, y0 + h * .45, bz1 - .08, x + .125, y0 + h * .82, bz1 + .08, snap);
  }
  // 合并的中远距墙体。
  addBox(ctx, a, 1, MAT.mass, PAL.plasterWarm, x0 + .2, y0, z0 + .2, x1 - .2, y0 + h, z1 - .2, snap);
  addBox(ctx, a, 2, MAT.mass, PAL.plasterWarm, x0 + .3, y0, z0 + .3, x1 - .3, y0 + h * .9, z1 - .3, snap);
  addToken(a, 'frame:' + bays + 'x' + depthRows + ':h' + qSnap(h, snap));
  return y0 + h;
}

function fineHall(ctx, a, x0, z0, x1, z1, base, opts, forcedRank) {
  opts = opts || {};
  const rank = forcedRank == null ? Math.max(0, Math.min(3, opts.platform ? 2 : 1)) : forcedRank;
  const snap = rank >= 4 ? LANDMARK_SNAP : ORDINARY_SNAP;
  const platformH = rank >= 4 ? .75 : opts.platform ? .5 : .25;
  const px = rank >= 3 ? .5 : .25;
  addBox(ctx, a, 0, MAT.earth, rank >= 3 ? PAL.stoneWhite : PAL.rammedLight, x0 - px, base, z0 - px, x1 + 1 + px, base + platformH, z1 + 1 + px, snap);
  addBox(ctx, a, 1, MAT.mass, PAL.rammedLight, x0 - px, base, z0 - px, x1 + 1 + px, base + platformH, z1 + 1 + px, snap);
  addBox(ctx, a, 2, MAT.mass, PAL.rammed, x0 - px * .5, base, z0 - px * .5, x1 + 1 + px * .5, base + platformH, z1 + 1 + px * .5, snap);
  const wallH = rank >= 4 ? Math.max(3, opts.wallH || 4) : 1.5 + rank * .25 + (a.variant % 3) * .25;
  const frameTop = fineFrame(ctx, a, x0, z0, x1 + 1, z1 + 1, base + platformH, rank, { bays: opts.bays, door: opts.door || 'S', frameH: wallH, wallC: opts.wall || PAL.plasterWarm });
  if (opts.doubleEave) fineRoof(ctx, a, x0 - .25, z0 - .25, x1 + 1.25, z1 + 1.25, base + platformH + wallH * .56, 'hip', rank, opts);
  const top = fineRoof(ctx, a, x0, z0, x1 + 1, z1 + 1, frameTop, opts.roof || 'xuan', rank, opts);
  a.collisionProxy.y1 = Math.max(a.collisionProxy.y1, Math.ceil(top));
  addToken(a, 'hall:' + (x1 - x0 + 1) + 'x' + (z1 - z0 + 1) + ':' + (opts.roof || 'xuan') + ':r' + rank + ':e' + (opts.doubleEave ? 2 : 1));
  return top;
}

function fineEnclosure(ctx, a, x0, z0, x1, z1, base, facing) {
  const snap = a.rank >= 4 ? LANDMARK_SNAP : ORDINARY_SNAP;
  const h = a.rank >= 3 ? 1.25 : 1.0, t = .25, gap = 1.5;
  const cx = (x0 + x1 + 1) * .5, cz = (z0 + z1 + 1) * .5;
  addWallWithGap(ctx, a, 0, MAT.earth, PAL.rammedLight, 'x', z0, x0, x1 + 1, base, base + h, t, facing === 'N' ? cx : null, gap, snap);
  addWallWithGap(ctx, a, 0, MAT.earth, PAL.rammed, 'x', z1 + 1 - t, x0, x1 + 1, base, base + h, t, facing === 'S' ? cx : null, gap, snap);
  addWallWithGap(ctx, a, 0, MAT.earth, PAL.rammed, 'z', x0, z0, z1 + 1, base, base + h, t, facing === 'W' ? cz : null, gap, snap);
  addWallWithGap(ctx, a, 0, MAT.earth, PAL.rammedLight, 'z', x1 + 1 - t, z0, z1 + 1, base, base + h, t, facing === 'E' ? cz : null, gap, snap);
  addWallWithGap(ctx, a, 0, MAT.tile, PAL.roofGrey, 'x', z0 - .125, x0 - .125, x1 + 1.125, base + h, base + h + .125, .5, facing === 'N' ? cx : null, gap, snap);
  addWallWithGap(ctx, a, 0, MAT.tile, PAL.roofGrey, 'x', z1 + .875, x0 - .125, x1 + 1.125, base + h, base + h + .125, .5, facing === 'S' ? cx : null, gap, snap);
  addBox(ctx, a, 1, MAT.mass, PAL.rammedLight, x0, base, z0, x1 + 1, base + h, z0 + t, snap);
  addBox(ctx, a, 1, MAT.mass, PAL.rammed, x0, base, z1 + 1 - t, x1 + 1, base + h, z1 + 1, snap);
  addToken(a, 'court:' + Math.round(x1 - x0 + 1) + 'x' + Math.round(z1 - z0 + 1) + ':gate' + (facing || 'S'));
}

function fineShop(ctx, a, x0, z0, w, d, base, facing, trade) {
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  fineHall(ctx, a, x0, z0, x1, z1, base, { roof: a.variant % 4 === 0 ? 'xie' : 'xuan', door: facing || 'S', wallH: 2 }, 1 + (a.variant % 5 === 0 ? 1 : 0));
  const side = facing || 'S', ay = base + 1.35;
  if (side === 'S') addBox(ctx, a, 0, MAT.accent, PAL.clothCream, x0, ay, z1 + 1, x1 + 1, ay + .125, z1 + 1.75, ORDINARY_SNAP);
  else if (side === 'N') addBox(ctx, a, 0, MAT.accent, PAL.clothCream, x0, ay, z0 - .75, x1 + 1, ay + .125, z0, ORDINARY_SNAP);
  else if (side === 'E') addBox(ctx, a, 0, MAT.accent, PAL.clothCream, x1 + 1, ay, z0, x1 + 1.75, ay + .125, z1 + 1, ORDINARY_SNAP);
  else addBox(ctx, a, 0, MAT.accent, PAL.clothCream, x0 - .75, ay, z0, x0, ay + .125, z1 + 1, ORDINARY_SNAP);
  const flagColor = {'酒肆':PAL.flagRed,'胡商邸店':PAL.flagPurple,'金银':PAL.flagYellow,'绢帛':PAL.flagBlue,'药材':PAL.flagGreen,'香药':PAL.flagGreen,'书坊':PAL.paperWhite}[trade] || PAL.flagYellow;
  const fx=side==='E'?x1+1.4:side==='W'?x0-.4:x0+.45, fz=side==='S'?z1+1.35:side==='N'?z0-.35:z0+.45;
  addBox(ctx,a,0,MAT.timber,PAL.timberDark,fx-.125,base,fz-.125,fx+.125,base+2.1,fz+.125,ORDINARY_SNAP);
  if(side==='N'||side==='S')addBox(ctx,a,0,MAT.accent,flagColor,fx+.125,base+1.2,fz-.08,fx+.75,base+2,fz+.08,ORDINARY_SNAP);
  else addBox(ctx,a,0,MAT.accent,flagColor,fx-.08,base+1.2,fz+.125,fx+.08,base+2,fz+.75,ORDINARY_SNAP);
  addBox(ctx,a,0,MAT.accent,PAL.lantern,fx-.18,base+.8,fz-.18,fx+.18,base+1.15,fz+.18,ORDINARY_SNAP);
  addToken(a, 'shop:' + (trade || '市肆') + ':' + w + 'x' + d + ':' + side);
}

function fineWarehouse(ctx, a, x0, z0, w, d, base) {
  const x1 = x0 + w, z1 = z0 + d, h = 2.25;
  addBox(ctx, a, 0, MAT.earth, PAL.rammedDark, x0, base, z0, x1, base + h, z1, ORDINARY_SNAP);
  addBox(ctx, a, 0, MAT.tile, PAL.roofGrey, x0 - .5, base + h, z0 - .5, x1 + .5, base + h + .25, z1 + .5, ORDINARY_SNAP);
  addBox(ctx, a, 0, MAT.timber, PAL.doorDark, (x0 + x1) * .5 - .5, base, z1 - .125, (x0 + x1) * .5 + .5, base + 1.25, z1 + .125, ORDINARY_SNAP);
  addBox(ctx, a, 1, MAT.mass, PAL.rammedDark, x0, base, z0, x1, base + h + .25, z1, ORDINARY_SNAP);
  addBox(ctx, a, 2, MAT.mass, PAL.rammed, x0, base, z0, x1, base + h, z1, ORDINARY_SNAP);
  addToken(a, 'warehouse:' + w + 'x' + d);
}

function finePavilion(ctx, a, x, z, base, size, rank) {
  const s = size || 1.5, h = rank >= 4 ? 3 : 1.75;
  addBox(ctx, a, 0, MAT.earth, PAL.stoneWhite, x - s, base, z - s, x + s, base + .25, z + s, rank >= 4 ? 1 : 2);
  for (const dx of [-s + .25, s - .25]) for (const dz of [-s + .25, s - .25]) addBox(ctx, a, 0, MAT.timber, PAL.zhuBright, x + dx - .125, base + .25, z + dz - .125, x + dx + .125, base + h, z + dz + .125, rank >= 4 ? 1 : 2);
  fineRoof(ctx, a, x - s, z - s, x + s, z + s, base + h, 'jian', rank || 2, { trim: rank >= 4 ? PAL.glazeGreen : PAL.bronze });
  addToken(a, 'pavilion:' + s + ':r' + rank);
}

function fineMarketTower(ctx,a,cx,cz,base,east){
  const w=east?3.1:4.2,d=east?3.1:2.8;
  addBox(ctx,a,0,MAT.earth,PAL.stoneWhite,cx-w-.5,base,cz-d-.5,cx+w+.5,base+.5,cz+d+.5,ORDINARY_SNAP);
  const y1=fineFrame(ctx,a,cx-w,cz-d,cx+w,cz+d,base+.5,3,{bays:east?5:7,door:'S',frameH:2.5});
  fineRoof(ctx,a,cx-w,cz-d,cx+w,cz+d,y1,east?'jian':'xie',3,{trim:PAL.bronze});
  const uw=east?1.7:2.3,ud=east?1.7:1.6,uy=y1+1.15;
  const y2=fineFrame(ctx,a,cx-uw,cz-ud,cx+uw,cz+ud,uy,3,{bays:east?3:5,door:'S',frameH:2.0});
  fineRoof(ctx,a,cx-uw,cz-ud,cx+uw,cz+ud,y2,'jian',3,{trim:east?PAL.glazeGreen:PAL.bronze});
  const fx=cx+(east?3.8:5.0),fz=cz+(east?3.8:2.8);
  addBox(ctx,a,0,MAT.timber,PAL.timberDark,fx-.125,base,fz-.125,fx+.125,y2+2,fz+.125,ORDINARY_SNAP);
  addBox(ctx,a,0,MAT.accent,east?PAL.flagYellow:PAL.flagRed,fx+.125,y2+.6,fz-.08,fx+1.1,y2+1.7,fz+.08,ORDINARY_SNAP);
  addToken(a,east?'east-market-tower:5+3-bay':'west-market-tower:7+5-bay');
}

function finePagoda(ctx, a, cx, cz, base, kind) {
  const dayan = kind === 'dayan';
  const levels = dayan ? 7 : 13;
  let y = base + (dayan ? .75 : .5);
  const start = dayan ? 5.5 : 3.5;
  addBox(ctx, a, 0, MAT.earth, PAL.stoneWhite, cx - start - 1, base, cz - start - 1, cx + start + 1, y, cz + start + 1, LANDMARK_SNAP);
  for (let i = 0; i < levels; i++) {
    const half = dayan ? Math.max(2.8, start - i * .38) : Math.max(1.45, start - i * .16);
    const fh = dayan ? 2.45 : .92;
    addBox(ctx, a, 0, MAT.earth, i % 2 ? PAL.rammedLight : PAL.brickPave, cx - half, y, cz - half, cx + half, y + fh, cz + half, LANDMARK_SNAP);
    const e = dayan ? .55 : .42;
    addBox(ctx, a, 0, MAT.tile, i % 2 ? PAL.roofGrey : PAL.roofLight, cx - half - e, y + fh, cz - half - e, cx + half + e, y + fh + .125, cz + half + e, LANDMARK_SNAP);
    if (dayan) {
      for (const [dx, dz] of [[0, half], [0, -half], [half, 0], [-half, 0]]) addBox(ctx, a, 0, MAT.timber, PAL.doorDark, cx + dx - (dx ? .08 : .38), y + .55, cz + dz - (dz ? .08 : .38), cx + dx + (dx ? .08 : .38), y + 1.55, cz + dz + (dz ? .08 : .38), LANDMARK_SNAP);
    }
    y += fh + (dayan ? .2 : .08);
  }
  addBox(ctx, a, 0, MAT.accent, PAL.bronze, cx - .125, y, cz - .125, cx + .125, y + 1.5, cz + .125, LANDMARK_SNAP);
  addBox(ctx, a, 0, MAT.accent, PAL.gold, cx - .25, y + 1.25, cz - .25, cx + .25, y + 1.65, cz + .25, LANDMARK_SNAP);
  // LOD1 保留层级节奏，LOD2 保留收分塔影。
  const l1Levels = dayan ? 4 : 6;
  let ly = base + .5;
  for (let i = 0; i < l1Levels; i++) {
    const half = Math.max(dayan ? 2.8 : 1.5, start - i * (dayan ? .65 : .33));
    const hh = dayan ? 4.2 : 2.1;
    addBox(ctx, a, 1, MAT.mass, PAL.brickPave, cx - half, ly, cz - half, cx + half, ly + hh, cz + half, LANDMARK_SNAP);
    addBox(ctx, a, 1, MAT.mass, PAL.roofGrey, cx - half - .4, ly + hh, cz - half - .4, cx + half + .4, ly + hh + .2, cz + half + .4, LANDMARK_SNAP);
    ly += hh;
  }
  addBox(ctx, a, 2, MAT.mass, PAL.brickPave, cx - (dayan ? 4.4 : 2.6), base, cz - (dayan ? 4.4 : 2.6), cx + (dayan ? 4.4 : 2.6), y, cz + (dayan ? 4.4 : 2.6), LANDMARK_SNAP);
  a.collisionProxy.y1 = Math.max(a.collisionProxy.y1, Math.ceil(y));
  addToken(a, 'pagoda:' + kind + ':' + levels + ':taper' + start);
}

function inferRankFromOpts(opts) { return opts && opts.rank != null ? opts.rank : opts && opts.doubleEave ? 4 : opts && opts.platform >= 2 ? 3 : 1; }
function basicSpec(ctx, role, x0, z0, x1, z1, base, rank, key) { return { role, x0, z0, x1, z1, base, rank, key, evidenceLevel: rank >= 4 ? 'A/B' : 'B/C' }; }

function wrapProto() {
  const proto = CHANGAN.proto;
  const hall0 = proto.hall;
  proto.hall = function (ctx, x0, z0, x1, z1, base, opts) {
    const rank = inferRankFromOpts(opts || {});
    return withAssembly(ctx, basicSpec(ctx, 'residence', x0, z0, x1, z1, base, rank), a => {
      const out = hall0.apply(this, arguments);
      fineHall(ctx, a, x0, z0, x1, z1, base, opts || {}, rank);
      return out;
    });
  };
  function wrapCompound(name, role, bounds, after) {
    const fn = proto[name]; if (!fn) return;
    proto[name] = function (ctx) {
      const args = Array.prototype.slice.call(arguments, 1);
      const b = bounds.apply(null, args);
      return withAssembly(ctx, basicSpec(ctx, role, b.x0, b.z0, b.x1, b.z1, b.base, b.rank || 1), a => {
        const out = fn.apply(this, arguments);
        if (after) after(ctx, a, args, b);
        return out;
      });
    };
  }
  wrapCompound('courtyard', 'residence', (x0,z0,w,d,base,level) => ({x0,z0,x1:x0+w-1,z1:z0+d-1,base,rank:Math.min(2,level||0)+1}), (ctx,a,v,b) => fineEnclosure(ctx,a,b.x0,b.z0,b.x1,b.z1,b.base,v[7]||'S'));
  wrapCompound('manor', 'manor', (x0,z0,x1,z1,base,facing,rng,opts) => ({x0,z0,x1,z1,base,rank:Math.min(3,(opts&&opts.level)||2)}), (ctx,a,v,b) => fineEnclosure(ctx,a,b.x0,b.z0,b.x1,b.z1,b.base,v[5]||'S'));
  wrapCompound('office', 'office', (x0,z0,x1,z1,base) => ({x0,z0,x1,z1,base,rank:3}), (ctx,a,v,b) => fineEnclosure(ctx,a,b.x0,b.z0,b.x1,b.z1,b.base,v[7]||'S'));
  wrapCompound('temple', 'temple', (x0,z0,x1,z1,base,opts) => ({x0,z0,x1,z1,base,rank:opts&&opts.big?3:2}), (ctx,a,v,b) => fineEnclosure(ctx,a,b.x0,b.z0,b.x1,b.z1,b.base,'S'));

  const shop0 = proto.shop;
  proto.shop = function (ctx, x0, z0, w, d, base, trade, east, rng, facing) {
    return withAssembly(ctx, basicSpec(ctx, 'market', x0,z0,x0+w-1,z0+d-1,base,2), a => {
      const out = shop0.apply(this, arguments);
      fineShop(ctx,a,x0,z0,w,d,base,facing,trade);
      return out;
    });
  };
  const mt0 = proto.marketTower;
  proto.marketTower = function (ctx,cx,cz,base) {
    return withAssembly(ctx,basicSpec(ctx,'market',cx-4,cz-4,cx+4,cz+4,base,3,'market-tower:'+(cx<0?'W':'E')),a=>{
      const out=mt0.apply(this,arguments); fineMarketTower(ctx,a,cx,cz,base,cx>0); return out;
    });
  };
  const pav0 = proto.pavilion;
  proto.pavilion = function(ctx,x,z,base,kind) {
    return withAssembly(ctx,basicSpec(ctx,'palace',x-3,z-3,x+3,z+3,base,kind==='big'?3:2),a=>{ const out=pav0.apply(this,arguments); finePavilion(ctx,a,x,z,base,kind==='big'?2.5:1.5,kind==='big'?3:2); return out; });
  };
  for (const name of ['pagodaLouge','pagodaMiyan']) {
    const p0=proto[name]; if(!p0) continue;
    proto[name]=function(ctx,cx,cz,base,opts){ return withAssembly(ctx,basicSpec(ctx,'temple',cx-6,cz-6,cx+6,cz+6,base,3),a=>{ const out=p0.apply(this,arguments); finePagoda(ctx,a,cx,cz,base,name==='pagodaLouge'?'dayan':'xiaoyan'); return out; }); };
  }
  const gt0 = proto.gateTower;
  proto.gateTower = function (ctx, g) {
    const out = gt0 ? gt0.apply(this, arguments) : undefined;
    g = g || {};
    const b = g.towerBase; if (!b) return out;
    const gy = (ctx.fields.groundH[CHANGAN.fieldIndex(g.x, g.z)] || 4) + CFG.Y.WALL_H + 1; // 墩顶
    // rank 3：避免整块被判为地标而被强制提升一级 LOD（静态批次预算）；出檐覆盖靠加宽平坐 + ring
    withAssembly(ctx, basicSpec(ctx, 'gate', b.x0, b.z0, b.x1, b.z1, gy, 3, 'gate-tower:' + (g.name || g.x + ':' + g.z)),
      a => { fineCityGateTower(ctx, a, g, gy); });
    return out;
  };
  const ct0 = proto.cornerTower;
  proto.cornerTower = function (ctx, x, z, base) {
    const out = ct0 ? ct0.apply(this, arguments) : undefined;
    // 宏观 rammedDark 基座 base+1..3 保留作台，细亭自 base+3 起接管墙体与屋顶
    withAssembly(ctx, basicSpec(ctx, 'gate', x - 3, z - 3, x + 3, z + 3, base + 3, 3),
      a => { finePavilion(ctx, a, x, z, base + 3, 2.5, 3); });
    return out;
  };
}

// 城门重楼（细层）：与 proto.gateTower 同一几何基准——平坐底 = 墩顶 gy，两层楼身 + 腰檐 + 重檐。
function fineCityGateTower(ctx, a, g, gy) {
  const b = g.towerBase, pad = 1;
  const x0 = b.x0 + pad, x1 = b.x1 - pad, z0 = b.z0 + pad, z1 = b.z1 - pad;
  if (!(x1 > x0 && z1 > z0)) return;
  const trim = (g.level || 0) >= 5 ? PAL.glazeGreen : PAL.bronze;
  const snap = LANDMARK_SNAP;
  // 平坐楼台板：底必须 = gy，下探会把墩顶遮出缝；左右各外挑 1 格以盖住旧屋顶出檐（外挑 2 格）
  const px0 = x0 - 2, px1 = x1 + 2, pz0 = z0 - 2, pz1 = z1 + 2;
  addBox(ctx, a, 0, MAT.earth, PAL.stoneWhite, px0, gy, pz0, px1, gy + .25, pz1, snap);
  addBox(ctx, a, 1, MAT.mass, PAL.stoneGrey, px0, gy, pz0, px1, gy + .25, pz1, snap);
  addBox(ctx, a, 2, MAT.mass, PAL.stoneGrey, x0, gy, z0, x1 + 1, gy + .25, z1 + 1, snap);
  // 一层楼身 + 腰檐（地标级精度：rank 4 只影响细部与吸附，不再影响 LOD 提升）
  const y1 = fineFrame(ctx, a, x0, z0, x1 + 1, z1 + 1, gy + .25, 4, { frameH: 2.5, door: 'none' });
  fineRoof(ctx, a, x0, z0, x1 + 1, z1 + 1, y1, 'hip', 4, { trim });
  // 二层重楼（内收 2/1）
  const ix0 = x0 + 2, ix1 = x1 - 2, iz0 = z0 + 1, iz1 = z1 - 1;
  if (ix1 > ix0 && iz1 > iz0) {
    const y2 = fineFrame(ctx, a, ix0, iz0, ix1 + 1, iz1 + 1, gy + 8, 4, { frameH: 2.0, door: 'none' });
    fineRoof(ctx, a, ix0, iz0, ix1 + 1, iz1 + 1, y2, (g.level || 0) >= 4 ? 'hip' : 'xie', 4, { trim });
  }
  addToken(a, 'cityGateTower:' + (x1 - x0 + 1) + 'x' + (z1 - z0 + 1) + ':l' + (g.level || 0));
}

function wrapShopTypes() {
  const T = CHANGAN.ShopType || {};
  for (const name of Object.keys(T)) {
    const fn = T[name]; if (typeof fn !== 'function') continue;
    T[name] = function (ctx, x0, z0, w, d, base) {
      return withAssembly(ctx, basicSpec(ctx,'market',x0,z0,x0+(w||4)-1,z0+(d||4)-1,base,2), a => {
        const before = a.components.length;
        const out = fn.apply(this, arguments);
        if (a.components.length === before && /Warehouse|Storage/.test(name)) fineWarehouse(ctx,a,x0,z0,w||4,d||4,base);
        addToken(a,'marketGrammar:'+name);
        return out;
      });
    };
  }
}

function wrapTang() {
  const Tang = CHANGAN.Tang;
  const enter0 = CHANGAN.enterLandmark, exit0 = CHANGAN.exitLandmark;
  CHANGAN.enterLandmark = function(ctx,name) {
    enter0(ctx,name);
    const log = ctx.landmarkLODs && ctx.landmarkLODs[name];
    const b = log || {x0:-4,z0:-4,x1:4,z1:4,base:4};
    const role=name==='dayan'||name==='xiaoyan'?'pagoda':['mingde','danfeng','chengtian'].includes(name)?'gate':name==='royal-temple'?'temple':'palace';
    pushAssembly(ctx,basicSpec(ctx,role,b.x0,b.z0,b.x1,b.z1,b.base||4,5,'landmark:'+name));
  };
  CHANGAN.exitLandmark = function(ctx) { popAssembly(ctx); exit0(ctx); };

  function wrapHigh(obj,name,role,bounds) {
    const fn=obj[name]; if(!fn) return;
    obj[name]=function(ctx){ const args=Array.prototype.slice.call(arguments,1), b=bounds(args); return withAssembly(ctx,basicSpec(ctx,role,b.x0,b.z0,b.x1,b.z1,b.base,b.rank,b.key),()=>fn.apply(this,arguments)); };
  }
  wrapHigh(Tang.HallBuilder,'build','palace',a=>({x0:a[0],z0:a[1],x1:a[2],z1:a[3],base:a[4],rank:a[5]||4}));
  wrapHigh(Tang.TowerBuilder,'build','palace',a=>({x0:a[0]-(a[2]||7)/2-2,z0:a[1]-(a[3]||7)/2-2,x1:a[0]+(a[2]||7)/2+2,z1:a[1]+(a[3]||7)/2+2,base:a[4],rank:a[5]||4}));

  const platform0=Tang.PlatformBuilder.build;
  Tang.PlatformBuilder.build=function(ctx,x0,z0,x1,z1,base,rank,opts){
    return withAssembly(ctx,basicSpec(ctx,'palace',x0,z0,x1,z1,base,rank||4),a=>{
      const top=platform0.apply(this,arguments); const snap=(rank||4)>=4?1:2;
      addBox(ctx,a,0,MAT.earth,(rank||4)>=4?PAL.stoneWhite:PAL.rammedLight,x0-.5,base,z0-.5,x1+1.5,top+.125,z1+1.5,snap);
      addBox(ctx,a,1,MAT.mass,PAL.stoneGrey,x0-.5,base,z0-.5,x1+1.5,top,z1+1.5,snap);
      addBox(ctx,a,2,MAT.mass,PAL.stoneGrey,x0,base,z0,x1+1,top,z1+1,snap);
      addToken(a,'platform:t'+Math.max(1,Math.round(top-base))+':r'+(rank||4)); return top;
    });
  };
  const frame0=Tang.TimberFrameBuilder.build;
  Tang.TimberFrameBuilder.build=function(ctx,x0,z0,x1,z1,yBase,rank,opts){
    return withAssembly(ctx,basicSpec(ctx,'palace',x0,z0,x1,z1,yBase,rank||4),a=>{ const out=frame0.apply(this,arguments); fineFrame(ctx,a,x0,z0,x1+1,z1+1,yBase,rank||4,opts||{}); return out; });
  };
  const roof0=Tang.RoofBuilder.build;
  Tang.RoofBuilder.build=function(ctx,type,x0,z0,x1,z1,y,opts){
    const rank=opts&&opts.rank!=null?opts.rank:4;
    return withAssembly(ctx,basicSpec(ctx,'palace',x0,z0,x1,z1,y,rank),a=>{ const out=roof0.apply(this,arguments); fineRoof(ctx,a,x0,z0,x1+1,z1+1,y,type,rank,opts||{}); addToken(a,'roof:'+type+':r'+rank); return out; });
  };
}

function wrapMajorPagodas() {
  for (const pair of [['buildDayanPagoda','dayan'],['buildXiaoyanPagoda','xiaoyan']]) {
    const fn=CHANGAN[pair[0]]; if(!fn) continue;
    CHANGAN[pair[0]]=function(ctx,cx,cz,base){
      const out=fn.apply(this,arguments);
      const a=ensureAssembly(ctx,basicSpec(ctx,'pagoda',cx-8,cz-8,cx+8,cz+8,base,4,'landmark:'+pair[1]));
      finePagoda(ctx,a,cx,cz,base,pair[1]);
      return out;
    };
  }
}

function addWardGateArchitecture(ctx) {
  for (const w of ctx.wards || []) {
    if (w.type !== 'ward' || !w.gateCells) continue;
    const a = ensureAssembly(ctx,basicSpec(ctx,'gate',w.x0,w.z0,w.x1,w.z1,w.base||4,1,'ward-gates:'+w.id));
    for (const g of w.gateCells) {
      const x=(g.x0+g.x1)*.5, z=(g.z0+g.z1)*.5;
      const sx=g.axis==='NS'?2.15:1.25, sz=g.axis==='NS'?1.25:2.15;
      finePavilion(ctx,a,x,z,w.base||4,Math.max(sx,sz),1);
      addToken(a,'wardGate:'+g.side+':'+g.axis);
    }
  }
}

// ---------------------------------------------------------------- 统一包络遮蔽（P0-1）
// 取代已移除的构件级 maskPrism：以 LOD0 细盒投影到的宏观列为覆盖图，按 core / ring 分级遮蔽旧宏观建筑。
// 覆盖图口径见 07_遮蔽重构暂停存档.md §2：core=盒投影列，ring=盒外扩 E 列（rank≥4 取 2，否则 1）。
const MASK_STRUCT_NAMES = ['roofGrey', 'roofLight', 'roofDark', 'timber', 'timberDark', 'zhu', 'zhuDeep', 'zhuBright',
  'plaster', 'plasterWarm', 'doorDark', 'glazeGreen', 'glazeBlue', 'gold', 'bronze', 'iron',
  'brickPave', 'stoneWhite', 'stoneGrey', 'rammed', 'rammedDark', 'rammedLight',
  'clothCream', 'clothHu', 'flagRed', 'flagBlue', 'flagYellow', 'flagGreen', 'flagPurple', 'paperWhite'];
const MASK_RING_EXCLUDE = ['brickPave', 'stoneWhite', 'stoneGrey', 'rammed', 'rammedDark', 'rammedLight'];
const MASK_FACADE_NAMES = MASK_STRUCT_NAMES.filter(n => MASK_RING_EXCLUDE.indexOf(n) < 0);
const MASK_FOLIAGE_NAMES = ['huaiGreen', 'huaiLight', 'willowGreen', 'pineGreen', 'bambooGreen', 'wutongGreen',
  'apricotPink', 'peonyRed', 'grass', 'withered', 'moss'];
// 树冠色（不含草/苔/枯草这类贴地色）：用于保住树干，避免"树冠悬空"
const MASK_TREE_NAMES = ['huaiGreen', 'huaiLight', 'willowGreen', 'pineGreen', 'bambooGreen', 'wutongGreen', 'apricotPink', 'peonyRed'];
const MASK_GLOW_NAMES = ['lantern', 'candle'];
const MASK_PAVE_NAMES = ['brickPave', 'stoneWhite', 'stoneGrey'];
const MASK_WALLTOP_NAMES = ['rammed', 'rammedDark', 'rammedLight', 'brickPave'];
let MASK_SETS = null;
function maskSets() {
  if (MASK_SETS) return MASK_SETS;
  const byName = names => {
    const s = new Set();
    for (const n of names) { const v = PAL[n]; if (v) s.add(v); }
    return s;
  };
  MASK_SETS = {
    struct: byName(MASK_STRUCT_NAMES), facade: byName(MASK_FACADE_NAMES),
    foliage: byName(MASK_FOLIAGE_NAMES), pave: byName(MASK_PAVE_NAMES), wallTop: byName(MASK_WALLTOP_NAMES),
    tree: byName(MASK_TREE_NAMES), glow: byName(MASK_GLOW_NAMES),
  };
  return MASK_SETS;
}

function computeArchCoverage(ctx) {
  ensure(ctx);
  const W = CFG.WORLD, Dd = W.z1 - W.z0 + 1, Wd = W.x1 - W.x0 + 1;
  const n = Wd * Dd;
  const core = new Uint8Array(n), ring = new Uint8Array(n), bottom = new Int16Array(n).fill(32767);
  for (const b of ctx.fineStore.boxes) {
    if (b.lod !== 0 || !b.buildingId) continue; // buildingId=0 为用户涂抹盒，不参与遮蔽
    const a = ctx.buildings[b.buildingId - 1];
    const E = (a && a.rank >= 4) ? 2 : 1;
    const gx0 = Math.floor(b.x0 / Q), gx1 = Math.floor((b.x1 - 1) / Q);
    const gz0 = Math.floor(b.z0 / Q), gz1 = Math.floor((b.z1 - 1) / Q);
    let by = Math.floor(b.y0 / Q); if (by < 0) by = 0;
    for (let x = gx0; x <= gx1; x++) {
      if (x < W.x0 || x > W.x1) continue;
      const bx = (x - W.x0) * Dd;
      for (let z = gz0; z <= gz1; z++) {
        if (z < W.z0 || z > W.z1) continue;
        const i = bx + (z - W.z0);
        core[i] = 1; if (by < bottom[i]) bottom[i] = by;
      }
    }
    for (let x = gx0 - E; x <= gx1 + E; x++) {
      if (x < W.x0 || x > W.x1) continue;
      const bx = (x - W.x0) * Dd;
      for (let z = gz0 - E; z <= gz1 + E; z++) {
        if (z < W.z0 || z > W.z1) continue;
        if (x >= gx0 && x <= gx1 && z >= gz0 && z <= gz1) continue;
        const i = bx + (z - W.z0);
        if (core[i]) continue;
        ring[i] = 1; if (by < bottom[i]) bottom[i] = by;
      }
    }
  }
  return { core, ring, bottom, Wd, Dd, n };
}

function archDoorBase(ctx, n, Dd) {
  const W = CFG.WORLD;
  const doorBase = new Int16Array(n).fill(-1);
  for (const d of ctx.doors || []) {
    const base = d.base || 0;
    for (const cell of d.cells || []) {
      const x = cell[0], z = cell[1];
      if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1) continue;
      const i = (x - W.x0) * Dd + (z - W.z0);
      if (doorBase[i] < 0 || base < doorBase[i]) doorBase[i] = base;
    }
  }
  return doorBase;
}

function archColumnTops(ctx, n, Dd) {
  const W = CFG.WORLD, H = W.H, set = maskSets();
  const topY = new Int16Array(n).fill(-1), topC = new Uint8Array(n), folLow = new Int16Array(n).fill(-1);
  for (const [k, c] of ctx.store.map) {
    const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
    if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= H) continue;
    const i = (x - W.x0) * Dd + (z - W.z0);
    if (y >= topY[i]) { topY[i] = y; topC[i] = c; }
    if (set.tree.has(c) && (folLow[i] < 0 || y < folLow[i])) folLow[i] = y;
  }
  return { topY, topC, folLow };
}

// 墙体保护表：按几何环线登记"墙身保护上界"（含）。坊墙/市墙 base+1..base+3、外郭城墙带 gy+1..gy+WALL_H+1。
// 只保护墙体色（夯土系 + 包砖），不保护木构——否则城门平坐会与细层平坐共面打架。
function archWallGuard(ctx, n, Dd, Wd) {
  const W = CFG.WORLD;
  const guard = new Int16Array(n).fill(-1);
  const mark = (x, z, yTop) => {
    if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1) return;
    const i = (x - W.x0) * Dd + (z - W.z0);
    if (yTop > guard[i]) guard[i] = yTop;
  };
  const gy = (x, z) => ctx.fields.groundH[(z - W.z0) * Wd + (x - W.x0)] || 0;
  for (const w of ctx.wards || []) {
    if (!w.base) continue;
    const top = w.base + 3;
    for (let x = w.x0; x <= w.x1; x++) { mark(x, w.z0, top); mark(x, w.z1, top); }
    for (let z = w.z0; z <= w.z1; z++) { mark(w.x0, z, top); mark(w.x1, z, top); }
  }
  const C = CFG.CITY, T = CFG.WALL, H = CFG.Y.WALL_H;
  if (C && T != null) {
    const bands = [
      [C.x0 - T, C.z1 + 1, C.x1 + T, C.z1 + T], [C.x0 - T, C.z0 - T, C.x1 + T, C.z0 - 1],
      [C.x1 + 1, C.z0 - T, C.x1 + T, C.z1 + T], [C.x0 - T, C.z0 - T, C.x0 - 1, C.z1 + T],
    ];
    for (const b of bands) for (let x = b[0]; x <= b[2]; x++) for (let z = b[1]; z <= b[3]; z++) mark(x, z, gy(x, z) + H + 1);
  }
  // 宫城 / 皇城 / 大明宫 环墙（GONG_WALL_H，顶面为女墙）
  const GH = CFG.Y.GONG_WALL_H || 4;
  for (const r of [CFG.PALACE, CFG.IMPERIAL, CFG.DAMING]) {
    if (!r) continue;
    for (let x = r.x0; x <= r.x1; x++) { mark(x, r.z0, gy(x, r.z0) + GH + 1); mark(x, r.z1, gy(x, r.z1) + GH + 1); }
    for (let z = r.z0; z <= r.z1; z++) { mark(r.x0, z, gy(r.x0, z) + GH + 1); mark(r.x1, z, gy(r.x1, z) + GH + 1); }
  }
  return guard;
}

// 单个体素的遮蔽判定：true=应当遮蔽。envelopeMask 与 auditArchLeak 共用同一口径。wg=该列墙身保护上界（-1 为非墙列）。
function shouldMaskVoxel(set, c, y, isCore, bot, ty, tc, gy, wg, folLow) {
  const isGlow = set.glow.has(c);
  if (!set.struct.has(c) && !isGlow) return false;            // 地形/水/枝叶/人物色永不遮
  if (CHANGAN.PAL_GROUP[c - 1] === 'water') return false;     // 水体永不遮
  if (set.foliage.has(tc)) return false;                      // 树列整列跳过
  if (folLow >= 0 && y <= folLow) return false;               // 树冠以下（树干/树池）保住，否则树冠悬空
  if (wg >= 0 && y <= wg && set.wallTop.has(c)) return false; // 护墙：坊墙/市墙/外郭城墙墙身
  if (isGlow && !isCore) return false;                        // glow 仅在 core 列随旧建筑一并移除（ring 列保留坊门/市楼灯笼）
  if (!isCore) {
    if (set.pave.has(tc)) return false;                       // 露天铺装（仅 ring 保护）
    if (!set.facade.has(c)) return false;                     // ring 只遮外观色
    if (ty < bot + 4) return false;                           // 低矮宏观构件（廊道/武侯铺/坊墙）保护
    return y >= bot && y <= ty;                               // 含 y=bot：否则旧屋顶鸱尾/脊饰会留在半空
  }
  const lo = bot > gy + 1 ? bot : gy + 1;
  return y >= lo && y <= ty;
}

function envelopeMask(ctx) {
  ensure(ctx);
  const W = CFG.WORLD, Dd = W.z1 - W.z0 + 1, Wd = W.x1 - W.x0 + 1, H = W.H;
  const n = Wd * Dd;
  const cov = computeArchCoverage(ctx);
  const set = maskSets();
  const tops = archColumnTops(ctx, n, Dd);
  const doorBase = archDoorBase(ctx, n, Dd);
  const guard = archWallGuard(ctx, n, Dd, Wd);
  const groundH = ctx.fields ? ctx.fields.groundH : null;
  let masked = 0;
  for (const [k, c] of ctx.store.map) {
    const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
    if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= H) continue;
    const i = (x - W.x0) * Dd + (z - W.z0);
    const isCore = cov.core[i];
    if (!isCore && !cov.ring[i]) continue;
    let bot = cov.bottom[i]; if (bot > 30000) bot = 0;
    const ty = tops.topY[i], tc = tops.topC[i], folLow = tops.folLow[i];
    if (ty < 0) continue;
    const fi = (z - W.z0) * Wd + (x - W.x0);
    const gy = groundH ? groundH[fi] : 0;
    if (!shouldMaskVoxel(set, c, y, isCore, bot, ty, tc, gy, guard[i], folLow)) continue;
    const db = doorBase[i];
    if (db >= 0 && y >= db + 1 && y <= db + 2) continue;      // 门扉列保护（保坊门/市门动态门扉）
    setMask(ctx, x, y, z, true); masked++;
  }
  // 收尾：遮蔽后仍与基岩不连通的体素一律遮蔽（旧屋顶鸱尾、失去树干的树冠等 A2 浮空块）
  const dropped = dropFloatingVoxels(ctx);
  ctx._archCover = {
    core: cov.core, ring: cov.ring, bottom: cov.bottom, guard,
    Wd, Dd, n, masked, dropped, ready: true,
  };
  return ctx._archCover;
}

// 从地表 6 邻域泛洪（按"遮蔽后可见"口径），未连通者遮蔽；迭代至稳定，最多 3 轮。
function dropFloatingVoxels(ctx) {
  const W = CFG.WORLD, Wd = W.x1 - W.x0 + 1, Dd = W.z1 - W.z0 + 1, H = W.H;
  const groundH = ctx.fields ? ctx.fields.groundH : null;
  if (!groundH) return 0;
  const plane = Wd * Dd, cap = plane * H;
  let removed = 0;
  for (let pass = 0; pass < 3; pass++) {
    const grid = new Uint8Array(cap);
    for (const [k] of ctx.store.map) {
      const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
      if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= H) continue;
      if (isMasked(ctx, x, y, z)) continue;
      grid[((x - W.x0) * Dd + (z - W.z0)) * H + y] = 1;
    }
    const q = new Int32Array(ctx.store.count + 1024);
    let qt = 0;
    for (let x = W.x0; x <= W.x1; x++) for (let z = W.z0; z <= W.z1; z++) {
      const gy = groundH[(z - W.z0) * Wd + (x - W.x0)];
      for (const y of [gy, gy - 1]) {
        if (y < 0 || y >= H) continue;
        const di = ((x - W.x0) * Dd + (z - W.z0)) * H + y;
        if (grid[di] === 1) { grid[di] = 2; q[qt++] = di; }
      }
    }
    for (let h = 0; h < qt; h++) {
      const di = q[h], y = di % H, t = (di - y) / H, lx = (t / Dd) | 0, lz = t % Dd, ni0 = di - y;
      if (lx > 0) { const ni = ni0 - Dd * H + y; if (grid[ni] === 1) { grid[ni] = 2; q[qt++] = ni; } }
      if (lx < Wd - 1) { const ni = ni0 + Dd * H + y; if (grid[ni] === 1) { grid[ni] = 2; q[qt++] = ni; } }
      if (lz > 0) { const ni = ni0 - H + y; if (grid[ni] === 1) { grid[ni] = 2; q[qt++] = ni; } }
      if (lz < Dd - 1) { const ni = ni0 + H + y; if (grid[ni] === 1) { grid[ni] = 2; q[qt++] = ni; } }
      if (y > 0) { const ni = di - 1; if (grid[ni] === 1) { grid[ni] = 2; q[qt++] = ni; } }
      if (y < H - 1) { const ni = di + 1; if (grid[ni] === 1) { grid[ni] = 2; q[qt++] = ni; } }
    }
    let cut = 0;
    for (const [k] of ctx.store.map) {
      const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
      if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= H) continue;
      if (isMasked(ctx, x, y, z)) continue;
      if (grid[((x - W.x0) * Dd + (z - W.z0)) * H + y] === 2) continue;
      setMask(ctx, x, y, z, true); cut++;
    }
    removed += cut;
    if (!cut) break;
  }
  return removed;
}

function normalizedSignature(a) {
  const counts = new Map();
  for (const c of a.components) counts.set(c,(counts.get(c)||0)+1);
  const graph=[...counts.entries()].sort((x,y)=>x[0].localeCompare(y[0])).map(v=>v[0]+'*'+v[1]).join(',');
  return [a.role,'r'+a.rank,a.grammar,graph].join('|');
}

function finalize(ctx) {
  ensure(ctx);
  if (ctx._fineFinalized) return;
  addWardGateArchitecture(ctx);
  envelopeMask(ctx);
  for (const a of ctx.buildings) {
    a.normalizedSignature=normalizedSignature(a);
    a.transform.position=[0,0,0];
    a.lods=[{level:0,description:'fine structural voxels'},{level:1,description:'merged building mass'},{level:2,description:'silhouette mass'}];
  }
  ctx._fineFinalized=true;
}

function emitBox(buf,b,oxQ,ozQ,palRGB) {
  const x0=b.x0-oxQ,x1=b.x1-oxQ,y0=b.y0,y1=b.y1,z0=b.z0-ozQ,z1=b.z1-ozQ;
  const rgb=palRGB[b.color-1]||[180,160,130];
  const faces=[
    [0,[[x1,y0,z1],[x1,y0,z0],[x1,y1,z1],[x1,y1,z0]],.86],
    [1,[[x0,y0,z0],[x0,y0,z1],[x0,y1,z0],[x0,y1,z1]],.72],
    [2,[[x0,y1,z1],[x1,y1,z1],[x0,y1,z0],[x1,y1,z0]],1.0],
    [3,[[x0,y0,z0],[x1,y0,z0],[x0,y0,z1],[x1,y0,z1]],.52],
    [4,[[x0,y0,z1],[x1,y0,z1],[x0,y1,z1],[x1,y1,z1]],.92],
    [5,[[x1,y0,z0],[x0,y0,z0],[x1,y1,z0],[x0,y1,z0]],.78],
  ];
  for(const f of faces){ const vi=buf.pos.length/3; for(const p of f[1]){buf.pos.push(p[0],p[1],p[2]);buf.nor.push(f[0]);buf.col.push(Math.min(255,rgb[0]*f[2])|0,Math.min(255,rgb[1]*f[2])|0,Math.min(255,rgb[2]*f[2])|0);} buf.idx.push(vi,vi+1,vi+2,vi+2,vi+1,vi+3); }
}
function pack(buf) { return buf.idx.length?{pos:new Uint16Array(buf.pos),nor:new Uint8Array(buf.nor),col:new Uint8Array(buf.col),idx:new Uint32Array(buf.idx),positionScale:1/Q}:null; }

function mergeBoxRuns(input) {
  let list=input;
  for(const axis of ['x','z','y']){
    const lo=axis+'0',hi=axis+'1';
    const other=['x0','x1','y0','y1','z0','z1'].filter(k=>k!==lo&&k!==hi);
    list=list.slice().sort((a,b)=>{
      for(const k of other){const d=a[k]-b[k];if(d)return d;}
      return a.color-b.color||a.buildingId-b.buildingId||a[lo]-b[lo]||a[hi]-b[hi];
    });
    const out=[];
    for(const b of list){
      const p=out[out.length-1];
      const same=p&&p.color===b.color&&p.buildingId===b.buildingId&&other.every(k=>p[k]===b[k]);
      if(same&&p[hi]===b[lo])p[hi]=b[hi];else out.push({...b});
    }
    list=out;
  }
  return list;
}

function meshArchitecture(ctx, onlyKeys) {
  ensure(ctx); finalize(ctx);
  const W=CFG.WORLD, nx=Math.ceil((W.x1-W.x0+1)/ARCH_CHUNK), nz=Math.ceil((W.z1-W.z0+1)/ARCH_CHUNK);
  const allow=onlyKeys?new Set(onlyKeys):null, chunks=new Map();
  const getChunk=(cx,cz)=>{
    const key=cx*100+cz; if(allow&&!allow.has(key))return null;
    let ch=chunks.get(key); if(!ch){ const ox=W.x0+cx*ARCH_CHUNK,oz=W.z0+cz*ARCH_CHUNK; ch={cx,cz,key,ox,oz,size:ARCH_CHUNK,buildingIds:new Set(),rankMax:0,lods:[{},{},{}],_boxes:[{},{},{}]}; chunks.set(key,ch); } return ch;
  };
  if(allow) for(const key of allow){ const cx=Math.floor(key/100),cz=key%100; if(cx>=0&&cx<nx&&cz>=0&&cz<nz)getChunk(cx,cz); }
  for(const b0 of ctx.fineStore.boxes){
    const cx0=Math.floor((b0.x0/Q-W.x0)/ARCH_CHUNK),cx1=Math.floor(((b0.x1-1)/Q-W.x0)/ARCH_CHUNK);
    const cz0=Math.floor((b0.z0/Q-W.z0)/ARCH_CHUNK),cz1=Math.floor(((b0.z1-1)/Q-W.z0)/ARCH_CHUNK);
    for(let cx=Math.max(0,cx0);cx<=Math.min(nx-1,cx1);cx++)for(let cz=Math.max(0,cz0);cz<=Math.min(nz-1,cz1);cz++){
      const ch=getChunk(cx,cz);if(!ch)continue; const oxQ=ch.ox*Q,ozQ=ch.oz*Q;
      const b={...b0,x0:Math.max(b0.x0,oxQ),x1:Math.min(b0.x1,oxQ+ARCH_CHUNK*Q),z0:Math.max(b0.z0,ozQ),z1:Math.min(b0.z1,ozQ+ARCH_CHUNK*Q)};
      if(b.x1<=b.x0||b.z1<=b.z0)continue;
      const kind=b.lod===0?b.material:MAT.mass; const lb=ch._boxes[b.lod]; if(!lb[kind])lb[kind]=[]; lb[kind].push(b); ch.buildingIds.add(b.buildingId); const a=ctx.buildings[b.buildingId-1]; if(a)ch.rankMax=Math.max(ch.rankMax,a.rank);
    }
  }
  const out=[];
  for(const ch of chunks.values()){
    for(let l=0;l<3;l++)for(const [kind,boxes] of Object.entries(ch._boxes[l])){
      const buf={pos:[],nor:[],col:[],idx:[]},oxQ=ch.ox*Q,ozQ=ch.oz*Q;
      for(const b of mergeBoxRuns(boxes))emitBox(buf,b,oxQ,ozQ,ctx.palRGB);
      const m=pack(buf);if(m)ch.lods[l][kind]=m;
    }
    delete ch._boxes; ch.buildingIds=[...ch.buildingIds]; out.push(ch);
  }
  out.sort((a,b)=>a.cx-b.cx||a.cz-b.cz); return out;
}

function architectureChecksum(ctx) {
  let h=2166136261;
  for(const b of ctx.fineStore.boxes){ for(const n of [b.x0,b.y0,b.z0,b.x1,b.y1,b.z1,b.color,b.lod,b.buildingId]){h^=n&0xffff;h=Math.imul(h,16777619);h^=(n>>>16)&0xffff;h=Math.imul(h,16777619);} h^=hashText(b.material);h=Math.imul(h,16777619); }
  return (h>>>0).toString(16);
}
function layoutChecksum(ctx) {
  let h=2166136261;
  const mix=n=>{h^=n&0xffff;h=Math.imul(h,16777619);h^=(n>>>16)&0xffff;h=Math.imul(h,16777619);};
  for(const w of ctx.wards){mix(w.id);mix(w.x0);mix(w.x1);mix(w.z0);mix(w.z1);mix(w.type==='market'?1:0);}
  for(const g of ctx.gates){mix(Math.round(g.x));mix(Math.round(g.z));mix(g.city?1:0);}
  return (h>>>0).toString(16);
}

function auditFine(ctx) {
  finalize(ctx);
  const a=ctx.buildings||[], counts=new Map(), wardCounts=new Map(), wardSigs=new Map();
  for(const b of a){counts.set(b.normalizedSignature,(counts.get(b.normalizedSignature)||0)+1);if(b.wardId){wardCounts.set(b.wardId,(wardCounts.get(b.wardId)||0)+1);const k=b.wardId+'|'+b.normalizedSignature;wardSigs.set(k,(wardSigs.get(k)||0)+1);}}
  let maxGlobal=0,maxWardSig=0;for(const n of counts.values())maxGlobal=Math.max(maxGlobal,n);for(const n of wardSigs.values())maxWardSig=Math.max(maxWardSig,n);
  const badWard=[...wardCounts.entries()].filter(([id,n])=>{const w=ctx.wards.find(v=>v.id===id);return w&&w.type==='ward'&&!CHANGAN.customWardOccupies(w)&&(w.row>=7?(n<1||n>5):(n<3||n>6));});
  const roleCount={};for(const b of a)roleCount[b.role]=(roleCount[b.role]||0)+1;
  const grammarCoverage={
    residence:new Set(a.filter(b=>b.role==='residence').map(b=>b.grammar)).size,
    official:new Set(a.filter(b=>b.role==='office').map(b=>b.grammar)).size,
    temple:new Set(a.filter(b=>b.role==='temple').map(b=>b.grammar)).size,
    market:new Set(a.filter(b=>b.role==='market').map(b=>b.grammar)).size,
  };
  const materialSet=new Set(ctx.fineStore.boxes.filter(b=>b.lod===0).map(b=>b.material));
  const quantOK=ctx.fineStore.boxes.every(b=>[b.x0,b.y0,b.z0,b.x1,b.y1,b.z1].every(Number.isInteger));
  return {
    pass:quantOK&&materialSet.has('earth')&&materialSet.has('timber')&&materialSet.has('tile')&&materialSet.has('accent')&&maxWardSig<=2&&maxGlobal<=Math.max(2,Math.ceil(a.length*.05))&&grammarCoverage.residence>=18&&grammarCoverage.official>=6&&grammarCoverage.temple>=5&&grammarCoverage.market>=10,
    quantOK,materialCount:materialSet.size,maxWardSig,maxGlobal,limit:Math.max(2,Math.ceil(a.length*.05)),badWard:badWard.slice(0,12),roleCount,grammarCoverage,
    detail:'装配'+a.length+' / 细盒'+ctx.fineStore.boxes.length+' / 语法'+grammarCoverage.residence+'+'+grammarCoverage.official+'+'+grammarCoverage.temple+'+'+grammarCoverage.market+' / 同坊同签名≤'+maxWardSig+' / 全城单签名'+maxGlobal+'/'+Math.max(2,Math.ceil(a.length*.05))
  };
}

// P0-4：遮蔽闭环审计。
// 致命项：leakCore / leakRing —— 已被细盒覆盖（core 或 ring）却仍未遮住的旧宏观建筑色，即"两套城市叠加"。
// 观测项：tall（离地 ≥6 仍未被接管的宏观构件，P0-2 待办清单）、floating（下方连续 ≥3 格空的悬空构件）。
// 不用"绝对 y≥12"作口径：龙首原/乐游原等高地上，坊墙宫墙的朱帽本就落在 y>12，会把合法墙体误判为浮空块。
function auditArchLeak(ctx) {
  finalize(ctx);
  const cov = ctx._archCover;
  if (!cov) return { pass: false, leakCore: -1, leakRing: -1, leakDoor: 0, tall: -1, kept: 0, masked: 0, dropped: 0, tallByColor: {}, detail: '未生成遮蔽覆盖图' };
  const W = CFG.WORLD, Dd = cov.Dd, Wd = cov.Wd, n = cov.n, H = W.H;
  const set = maskSets();
  const tops = archColumnTops(ctx, n, Dd);
  const doorBase = archDoorBase(ctx, n, Dd);
  const guard = cov.guard || archWallGuard(ctx, n, Dd, Wd);
  const groundH = ctx.fields ? ctx.fields.groundH : null;
  let leakCore = 0, leakRing = 0, leakDoor = 0, tall = 0, kept = 0, maskedCount = 0;
  const tallByColor = Object.create(null);
  for (const [k, c] of ctx.store.map) {
    const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
    if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= H) continue;
    if (isMasked(ctx, x, y, z)) { maskedCount++; continue; }
    if (!set.struct.has(c)) continue;
    kept++;
    const i = (x - W.x0) * Dd + (z - W.z0);
    const ty = tops.topY[i], tc = tops.topC[i], folLow = tops.folLow[i];
    let bot = cov.bottom[i]; if (bot > 30000) bot = 0;
    const gy = groundH ? groundH[(z - W.z0) * Wd + (x - W.x0)] : 0;
    if (set.facade.has(c)) {
      if (y - gy >= 6) {
        tall++;
        const nm = (CHANGAN.PAL_DEF[c - 1] || ['?'])[0];
        tallByColor[nm] = (tallByColor[nm] || 0) + 1;
      }
    }
    const db = doorBase[i], doorKeep = db >= 0 && y >= db + 1 && y <= db + 2;
    if (cov.core[i]) {
      if (shouldMaskVoxel(set, c, y, true, bot, ty, tc, gy, guard[i], folLow)) { if (doorKeep) leakDoor++; else leakCore++; }
    } else if (cov.ring[i]) {
      if (shouldMaskVoxel(set, c, y, false, bot, ty, tc, gy, guard[i], folLow)) { if (doorKeep) leakDoor++; else leakRing++; }
    }
  }
  const top = Object.entries(tallByColor).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0] + ':' + e[1]).join(' ');
  return {
    pass: leakCore === 0 && leakRing === 0, leakCore, leakRing, leakDoor, tall, kept,
    masked: maskedCount, dropped: cov.dropped || 0, tallByColor,
    detail: '遮蔽' + maskedCount + '（含悬空清除' + (cov.dropped || 0) + '） / 保留建筑色' + kept +
      ' / 漏遮 core ' + leakCore + ' ring ' + leakRing + ' / 门扉保护' + leakDoor +
      ' / 离地≥6未接管' + tall + (top ? ' [' + top + ']' : ''),
  };
}

function applyFineOp(ctx,op) {
  ensure(ctx);
  const q=op.quant||8, qx=Math.floor(op.x*Q/q), qy=Math.floor(op.y*Q/q), qz=Math.floor(op.z*Q/q);
  if((op.color||op.c||0)===0)ctx.fineStore.removeCell(qx,qy,qz);
  else ctx.fineStore.addQ(qx,qy,qz,qx+1,qy+1,qz+1,op.color||op.c,MAT.earth,0,0);
  const x=Math.floor(qx/Q),y=Math.floor(qy/Q),z=Math.floor(qz/Q);
  if(ctx.fineStore.hasMacroCell(x,y,z))ctx.store.set(x,y,z,op.color||op.c||PAL.rammedLight);else ctx.store.del(x,y,z);
  return {archKey:Math.floor((x-CFG.WORLD.x0)/ARCH_CHUNK)*100+Math.floor((z-CFG.WORLD.z0)/ARCH_CHUNK),x,y,z};
}

wrapProto();
wrapShopTypes();
wrapTang();
wrapMajorPagodas();

CHANGAN.FINE_Q=Q; CHANGAN.ARCH_CHUNK=ARCH_CHUNK; CHANGAN.ARCH_GRAMMARS=GRAMMARS; CHANGAN.FineVoxelStore=FineVoxelStore;
CHANGAN.fineQuantize=(v,landmark)=>qSnap(v,landmark?LANDMARK_SNAP:ORDINARY_SNAP);
CHANGAN.fineDequantize=q=>q/Q;
CHANGAN.ensureFineArchitecture=ensure; CHANGAN.finalizeFineArchitecture=finalize; CHANGAN.meshArchitecture=meshArchitecture;
CHANGAN.architectureChecksum=architectureChecksum; CHANGAN.layoutChecksum=layoutChecksum; CHANGAN.auditFineArchitecture=auditFine;
CHANGAN.isArchMasked=isMasked; CHANGAN.setArchMask=setMask; CHANGAN.applyFineOp=applyFineOp;
CHANGAN.auditArchLeak=auditArchLeak; CHANGAN.computeArchCoverage=computeArchCoverage; CHANGAN.envelopeMask=envelopeMask;
})();
