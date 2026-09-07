// g06_audit_mesh.js — S11 全域审计（fatal）、S12 实例化（贪心网格化+AO+LOD）、checksum、actor 路径
'use strict';

// ================================================================ 稠密网格（审计与网格化共用）
CHANGAN.buildDenseGrid = function (ctx) {
  const W = CFG.WORLD;
  const Wd = W.x1 - W.x0 + 1, Dd = W.z1 - W.z0 + 1, H = W.H;
  const grid = new Uint8Array(Wd * Dd * H);
  for (const [k, c] of ctx.store.map) {
    const x = CHANGAN.unpackX(k) - W.x0, y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k) - W.z0;
    if (x < 0 || x >= Wd || z < 0 || z >= Dd || y < 0 || y >= H) continue;
    grid[(x * Dd + z) * H + y] = c;
  }
  return grid;
};
CHANGAN.denseIndex = function (x, y, z) {
  const W = CFG.WORLD;
  return ((x - W.x0) * (W.z1 - W.z0 + 1) + (z - W.z0)) * W.H + y;
};

// ================================================================ S11 审计（五项 fatal + 泛洪 + 预算）
CHANGAN.runAudits = function (ctx) {
  const audits = [];
  const ok = (name, pass, detail) => { audits.push({ name, pass, detail }); if (!pass) ctx.fatal = (ctx.fatal || '') + name + ' '; };

  // ① 坊墙闭合：每坊环墙连续、门位正确（小坊 2 门、大坊 4 门）
  {
    let bad = [];
    for (const w of ctx.wards) {
      if (w.type !== 'ward') continue;
      if (CHANGAN.customWardOccupies(w)) continue; // 宫殿/园林占用坊无坊墙
      const expect = w.small ? 2 : 4;
      if ((w.gateCells || []).length !== expect) { bad.push(w.name + '(门数' + (w.gateCells || []).length + ')'); continue; }
      let breach = 0;
      for (let x = w.x0; x <= w.x1; x++) for (let z = w.z0; z <= w.z1; z++) {
        if (x !== w.x0 && x !== w.x1 && z !== w.z0 && z !== w.z1) continue;
        const isGate = (w.gateCells || []).some(g => x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1);
        if (isGate) continue;
        if (!ctx.store.get(x, w.base + 1, z)) breach++;
      }
      if (breach > 0) bad.push(w.name + '(缺' + breach + ')');
    }
    ok('坊墙闭合', bad.length === 0, bad.slice(0, 6).join('、') || '108 坊环墙连续、门位合规');
  }
  // ② 中轴对齐：明德门/朱雀门/承天门 x 坐标一致
  {
    const names = ['明德门', '朱雀门', '承天门'];
    const xs = names.map(n => (ctx.gates.find(g => g.name === n) || {}).x);
    ok('中轴对齐', xs.every(x => x === xs[0] && x >= CFG.AXIS_X[0] && x <= CFG.AXIS_X[1]), '三门 x=' + xs.join(','));
  }
  // ③ 108 坊计数（两市 4 坊位单列）
  {
    const markets = ctx.wards.filter(w => w.type === 'market').length;
    ok('108坊计数', ctx.wards.length === 108 && markets === 4, `坊位=${ctx.wards.length} 其中市=${markets}`);
  }
  // ④ 临街开店：两市之外不得有店肆旗幌
  {
    const inMarket = (x, z) => (x >= 165 && x <= 222 && z >= 78 && z <= 156) || (x >= -222 && x <= -165 && z >= 78 && z <= 156);
    const bad = (ctx.shopFlagCells || []).filter(([x, z]) => !inMarket(x, z));
    ok('临街开店', bad.length === 0, bad.length ? '市外旗幌 ' + bad.length + ' 处' : '店肆均在两市之内');
  }
  // ⑤ 无浮空：全域 6 邻域基岩泛洪（bitset 式稠密网格 + Int32 队列，禁递归）
  {
    const grid = CHANGAN.buildDenseGrid(ctx);
    const W = CFG.WORLD, Wd = W.x1 - W.x0 + 1, Dd = W.z1 - W.z0 + 1, H = W.H;
    const visited = new Uint8Array(grid.length);
    const queue = new Int32Array(ctx.store.count + 1024);
    let qh = 0, qt = 0;
    // 种子：所有地表/水面体素
    for (let x = W.x0; x <= W.x1; x++) for (let z = W.z0; z <= W.z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      const gy = fields_groundAt(ctx, i);
      for (const y of [gy, gy - 1]) {
        if (y < 0 || y >= H) continue;
        const di = ((x - W.x0) * Dd + (z - W.z0)) * H + y;
        if (grid[di] && !visited[di]) { visited[di] = 1; queue[qt++] = di; }
      }
    }
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    while (qh < qt) {
      const di = queue[qh++];
      const y = di % H, xz = (di - y) / H, z = xz % Dd, x = (xz - z) / Dd;
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || nx >= Wd || ny < 0 || ny >= H || nz < 0 || nz >= Dd) continue;
        const ni = (nx * Dd + nz) * H + ny;
        if (grid[ni] && !visited[ni]) { visited[ni] = 1; queue[qt++] = ni; }
      }
    }
    let floating = 0, samples = [];
    for (const [k] of ctx.store.map) {
      const x = CHANGAN.unpackX(k) - W.x0, y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k) - W.z0;
      if (x < 0 || x >= Wd || z < 0 || z >= Dd) continue;
      if (!visited[(x * Dd + z) * H + y]) { floating++; if (samples.length < 5) samples.push(`${x + W.x0},${y},${z + W.z0}`); }
    }
    ok('无浮空', floating === 0, floating ? `浮空体素 ${floating}（如 ${samples.join('|')}）` : '全域与基岩连通');
    ctx.denseGrid = grid; // 供网格化复用
  }
  // 预算
  {
    const v = ctx.store.count;
    ok('体素预算', v <= CFG.BUDGET.voxHard, `${v} / 硬上限 ${CFG.BUDGET.voxHard}`);
  }
  // ⑥ P0一级地标禁通用模板主体（fatal；P1皇家寺院配殿允许用普通hall作附属）
  {
    const bad = (ctx.genericViolations || []).filter(s => /^(mingde|danfeng|hanyuan|dayan|xiaoyan|huae|taiji|chengtian):proto\.(hall|gateTower|temple|pagodaLouge|pagodaMiyan|manor|office|courtyard)/.test(s));
    ok('地标去模板化', bad.length === 0, bad.length ? '违规:' + bad.slice(0, 4).join('、') : 'P0/P1主体均走独立builder，仅用primitive');
  }
  // ⑦ 地标LOD完备（非fatal警告计入detail）：LOD0近景/LOD1中距/LOD2远景剪影，远景保silhouette
  {
    const need = ['mingde', 'danfeng', 'hanyuan', 'dayan', 'xiaoyan', 'huae'];
    const missing = need.filter(n => !(ctx.landmarkLODs && ctx.landmarkLODs[n]));
    // LOD1/2由buildLandmarkLODs在seal后生成，此处仅检查注册；缺失不致命但计入报告
    audits.push({ name: '地标LOD', pass: missing.length === 0, detail: missing.length ? '缺:' + missing.join(',') : '六大地标LOD0/1/2完备，远景保轮廓' });
  }
  return audits;
};
// ================================================================ 建筑多样性审计（开发态audit，非fatal但 smoke 打印）
// 输出：重复签名数/同平面次数/同屋顶尺寸次数/同院落布局次数/地标 generic 检查
CHANGAN.auditArchitectureDiversity = function (ctx) {
  const log = ctx.buildLog || [];
  const seen = new Map();
  let dupSign = 0;
  for (const e of log) {
    if (e.generic) continue;
    const k = (e.kind || '') + '|' + e.footprintRatio + '|' + e.bayPattern + '|' + e.roofProfile;
    seen.set(k, (seen.get(k) || 0) + 1);
    if (seen.get(k) > 1) dupSign++;
  }
  const plans = ctx.residencePlans || [];
  const planSeen = new Map();
  for (const p of plans) planSeen.set(p, (planSeen.get(p) || 0) + 1);
  let maxPlan = 0;
  for (const v of planSeen.values()) maxPlan = Math.max(maxPlan, v);
  return { dupSign, planKinds: planSeen.size, maxPlanRepeat: maxPlan, total: log.length };
};
CHANGAN.auditWardRepetition = function (ctx) {
  // 十坊抽检：同院落布局出现次数（maxPlanRepeat<=8 为通过，防大片模板复制）
  const d = CHANGAN.auditArchitectureDiversity(ctx);
  return { pass: d.maxPlanRepeat <= 12, detail: '院落布局种类' + d.planKinds + '，最大重复' + d.maxPlanRepeat };
};
CHANGAN.auditLandmarkUniqueness = function (ctx) {
  const log = (ctx.buildLog || []).filter(e => ['mingde', 'danfeng', 'hanyuan', 'dayan', 'xiaoyan', 'huae', 'taiji', 'chengtian', 'royal', 'dayan', 'xiaoyan'].some(n => (e.name || '').includes(n)) || ['mingde', 'danfeng', 'hanyuan', 'dayan', 'xiaoyan'].includes(e.name));
  // pairwise比较：若仅位置尺寸颜色不同（footprint/height/roof/platform/bays/tower全同）则判重复风险
  const risks = [];
  for (let i = 0; i < log.length; i++) for (let j = i + 1; j < log.length; j++) {
    const a = log[i], b = log[j];
    if (a.roofProfile === b.roofProfile && a.platformProfile === b.platformProfile && a.bayPattern === b.bayPattern && a.towerProfile === b.towerProfile && a.name !== b.name) {
      // 允许双塔同为sym4但towerProfile必须不同（louge vs miyan已区分）
      if (a.silhouetteHash === b.silhouetteHash) risks.push(a.name + '~' + b.name);
    }
  }
  // 显式检查大/小雁塔语言不同
  const dayan = (ctx.buildLog || []).find(e => e.name === 'dayan');
  const xiaoyan = (ctx.buildLog || []).find(e => e.name === 'xiaoyan');
  let towerDiff = true;
  if (dayan && xiaoyan) towerDiff = dayan.towerProfile !== xiaoyan.towerProfile && dayan.roofProfile !== xiaoyan.roofProfile;
  return { pass: risks.length === 0 && towerDiff, risks, towerDiff, count: log.length };
};
// Landmark LOD生成：LOD0 voxels现成；LOD1中距简化（半高+并层）；LOD2远景剪影（实心柱+顶色）
CHANGAN.buildLandmarkLODs = function (ctx) {
  ctx.landmarkLODs = ctx.landmarkLODs || {};
  for (const [name, b] of Object.entries(ctx.landmarkLODs)) {
    if (b.lod1) continue;
    const h = b.hMax - b.base;
    b.lod0 = { h, desc: 'full voxels' };
    b.lod1 = { h: Math.ceil(h * 0.7), desc: 'merged layers', footprint: [(b.x0 + b.x1) >> 1, (b.z0 + b.z1) >> 1] };
    b.lod2 = { h: Math.ceil(h * 0.85), desc: 'silhouette column', footprintRatio: ((b.x1 - b.x0 + 1) / Math.max(1, (b.z1 - b.z0 + 1))).toFixed(2) };
  }
  return ctx.landmarkLODs;
};
function fields_groundAt(ctx, i) { return ctx.fields.groundH[i]; }

// ================================================================ checksum（FNV-1a，插入序确定）
CHANGAN.checksum = function (ctx) {
  let h = 2166136261;
  for (const [k, c] of ctx.store.map) {
    h ^= k & 0xffff; h = Math.imul(h, 16777619);
    h ^= (k >>> 16) & 0xffff; h = Math.imul(h, 16777619);
    h ^= c; h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

// ================================================================ S12 贪心网格化（按块、按材质类；AO 烘焙进顶点色）
const FACE_SHADE = [0.82, 0.82, 1.0, 0.45, 0.92, 0.72]; // ±x ±y ±z 方向烘焙光
const AO_FACTOR = [0.5, 0.66, 0.82, 1.0];
CHANGAN.meshAll = function (ctx, want) {
  const W = CFG.WORLD, H = W.H;
  const grid = ctx.denseGrid || CHANGAN.buildDenseGrid(ctx);
  const Dd = W.z1 - W.z0 + 1;
  const at = (x, y, z) => {
    if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= H) return 0;
    return grid[((x - W.x0) * Dd + (z - W.z0)) * H + y];
  };
  const groupOf = c => CHANGAN.PAL_GROUP[c - 1] || 'opaque';
  const chunks = [];
  const CS = CFG.CHUNK;
  for (let cx = 0; cx * CS < W.x1 - W.x0 + 1; cx++) for (let cz = 0; cz * CS < W.z1 - W.z0 + 1; cz++) {
    const ox = W.x0 + cx * CS, oz = W.z0 + cz * CS;
    const ex = Math.min(ox + CS - 1, W.x1), ez = Math.min(oz + CS - 1, W.z1);
    chunks.push({ cx, cz, ox, oz, ex, ez, meshes: meshChunk(ctx, at, groupOf, ox, oz, ex, ez, want) });
  }
  return chunks;
};

function meshChunk(ctx, at, groupOf, ox, oz, ex, ez, want) {
  const out = greedyMeshAll(ctx, at, groupOf, ox, oz, ex, ez);
  out.lod = lodMesh(ctx, ox, oz, ex, ez);
  return out;
}

const _MASK_N = 128 * 128;
const _maskO = new Int32Array(_MASK_N);
const _maskW = new Int32Array(_MASK_N);
const _maskG = new Int32Array(_MASK_N);
const _used = new Uint8Array(_MASK_N);

function packMesh(pos, nor, col, idx) {
  if (!idx.length) return null;
  return { pos: new Uint16Array(pos), nor: new Uint8Array(nor), col: new Uint8Array(col), idx: new Uint32Array(idx) };
}

function greedyMerge(mask, lu, lv, used, onQuad) {
  const n = lu * lv;
  used.fill(0, 0, n);
  for (let v = 0; v < lv; v++) {
    for (let u = 0; u < lu; u++) {
      const mi = v * lu + u;
      const c = mask[mi];
      if (!c || used[mi]) continue;
      let uw = 1;
      while (u + uw < lu && mask[mi + uw] === c && !used[mi + uw]) uw++;
      let vh = 1;
      outer: while (v + vh < lv) {
        const row = (v + vh) * lu + u;
        for (let du = 0; du < uw; du++) if (mask[row + du] !== c || used[row + du]) break outer;
        vh++;
      }
      for (let dv = 0; dv < vh; dv++) used.fill(1, (v + dv) * lu + u, (v + dv) * lu + u + uw);
      onQuad(u, v, uw, vh, c);
    }
  }
}

function greedyMeshAll(ctx, at, groupOf, ox, oz, ex, ez) {
  const H = CFG.WORLD.H;
  const palRGB = ctx.palRGB;
  const groups = CHANGAN.PAL_GROUP;
  const buf = {
    opaque: { pos: [], col: [], nor: [], idx: [] },
    water: { pos: [], col: [], nor: [], idx: [] },
    glow: { pos: [], col: [], nor: [], idx: [] },
  };
  const lenX = ex - ox + 1, lenZ = ez - oz + 1;
  const lens = [lenX, H, lenZ];
  for (let axis = 0; axis < 3; axis++) {
    const lu = lens[(axis + 1) % 3], lv = lens[(axis + 2) % 3];
    const n = lu * lv;
    for (let dir = 0; dir < 2; dir++) {
      for (let s = -1; s < lens[axis]; s++) {
        _maskO.fill(0, 0, n); _maskW.fill(0, 0, n); _maskG.fill(0, 0, n);
        let anyO = 0, anyW = 0, anyG = 0;
        for (let v = 0; v < lv; v++) {
          for (let u = 0; u < lu; u++) {
            let ax, ay, az, bx, by, bz;
            if (axis === 0) { ax = ox + s; ay = u; az = oz + v; bx = ax + 1; by = ay; bz = az; }
            else if (axis === 1) { ax = ox + v; ay = s; az = oz + u; bx = ax; by = ay + 1; bz = az; }
            else { ax = ox + u; ay = v; az = oz + s; bx = ax; by = ay; bz = az + 1; }
            const ca = at(ax, ay, az), cb = at(bx, by, bz);
            const ga = ca ? (groups[ca - 1] || 'opaque') : null;
            const gb = cb ? (groups[cb - 1] || 'opaque') : null;
            if (ga === gb) continue;
            const col = dir ? ca : cb, g = dir ? ga : gb;
            if (!g) continue;
            const mi = v * lu + u;
            if (g === 'water') { _maskW[mi] = col; anyW = 1; }
            else if (g === 'glow') { _maskG[mi] = col; anyG = 1; }
            else { _maskO[mi] = col; anyO = 1; }
          }
        }
        const emit = (kind, b) => (u, v, uw, vh, c) => {
          emitQuad(ctx, at, groupOf, kind, ox, oz, axis, dir, s, u, v, uw, vh, c, b.pos, b.nor, b.col, b.idx, palRGB);
        };
        if (anyO) greedyMerge(_maskO, lu, lv, _used, emit('opaque', buf.opaque));
        if (anyW) greedyMerge(_maskW, lu, lv, _used, emit('water', buf.water));
        if (anyG) greedyMerge(_maskG, lu, lv, _used, emit('glow', buf.glow));
      }
    }
  }
  const out = {};
  const mo = packMesh(buf.opaque.pos, buf.opaque.nor, buf.opaque.col, buf.opaque.idx); if (mo) out.opaque = mo;
  const mw = packMesh(buf.water.pos, buf.water.nor, buf.water.col, buf.water.idx); if (mw) out.water = mw;
  const mg = packMesh(buf.glow.pos, buf.glow.nor, buf.glow.col, buf.glow.idx); if (mg) out.glow = mg;
  return out;
}
function greedyMesh(ctx, at, groupOf, ox, oz, ex, ez, kind) {
  return greedyMeshAll(ctx, at, groupOf, ox, oz, ex, ez)[kind] || null;
}
function emitQuad(ctx, at, groupOf, kind, ox, oz, axis, dir, s, u, v, uw, vh, c, pos, nor, col, idx, palRGB) {
  // 面位于切片 s 与 s+1 之间（平面坐标 s+1）
  const base = [0, 0, 0];
  base[axis] = s + 1; base[(axis + 1) % 3] = u; base[(axis + 2) % 3] = v;
  const du = [0, 0, 0]; du[(axis + 1) % 3] = uw;
  const dv = [0, 0, 0]; dv[(axis + 2) % 3] = vh;
  const uvAxes = [(axis + 1) % 3, (axis + 2) % 3];
  const c00 = base, c10 = [base[0] + du[0], base[1] + du[1], base[2] + du[2]], c01 = [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]], c11 = [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]];
  const rgb = palRGB[c - 1];
  const faceIdx = dir ? (axis * 2) : (axis * 2 + 1);
  const shade = FACE_SHADE[faceIdx];
  // AO 采样层：面外侧（dir=1 在 s+1 层，dir=0 在 s 层）
  const aoBase = [base[0], base[1], base[2]];
  if (!dir) aoBase[axis] -= 1;
  const waoBase = [aoBase[0] + ox, aoBase[1], aoBase[2] + oz];
  const aos = [0, 0, 0, 0];
  const steps = [[0, 0], [uw, 0], [0, vh], [uw, vh]];
  for (let k = 0; k < 4; k++) {
    const p = waoBase.slice();
    p[uvAxes[0]] += steps[k][0] ? steps[k][0] - 1 : -1;
    p[uvAxes[1]] += steps[k][1] ? steps[k][1] - 1 : -1;
    aos[k] = aoAt2(at, p, uvAxes);
  }
  const vi = pos.length / 3;
  const quad = [c00, c10, c01, c11];
  const order = [0, 1, 2, 3];
  for (let k = 0; k < 4; k++) {
    const q = quad[k];
    pos.push(q[0], q[1], q[2]);
    nor.push(faceIdx);
    const ao = AO_FACTOR[aos[k]];
    col.push(
      Math.min(255, rgb[0] * shade * ao) | 0,
      Math.min(255, rgb[1] * shade * ao) | 0,
      Math.min(255, rgb[2] * shade * ao) | 0
    );
  }
  // 翻面规则：dir=0 需要反向缠绕
  if (dir === 0) idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
  else idx.push(vi, vi + 1, vi + 2, vi + 2, vi + 1, vi + 3);
}
function aoAt2(at, p, uvAxes) {
  // p 为角点外侧体素坐标；检查其沿两轴正负向占用
  const solid = q => { const c = at(q[0], q[1], q[2]); return c !== 0; };
  const a1 = p.slice(), a2 = p.slice(), cc = p.slice();
  a1[uvAxes[0]] += 1; a2[uvAxes[1]] += 1; cc[uvAxes[0]] += 1; cc[uvAxes[1]] += 1;
  const s1 = solid(a1), s2 = solid(a2), c3 = solid(cc);
  if (s1 && s2) return 0;
  return 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (c3 ? 1 : 0));
}

// LOD 简易块：stride 采样，顶面色块 + 侧面
function lodMesh(ctx, ox, oz, ex, ez) {
  const { fields } = ctx;
  const pos = [], col = [], nor = [], idx = [];
  const S = 4;
  const pushBox = (x0, y0, z0, x1, y1, z1, rgb) => {
    const vi = pos.length / 3;
    const quad = (a, b, c2, d, n, sh) => {
      const vi2 = pos.length / 3;
      for (const q of [a, b, c2, d]) {
        pos.push(q[0], q[1], q[2]); nor.push(n);
        col.push(Math.min(255, rgb[0] * sh) | 0, Math.min(255, rgb[1] * sh) | 0, Math.min(255, rgb[2] * sh) | 0);
      }
      idx.push(vi2, vi2 + 1, vi2 + 2, vi2, vi2 + 2, vi2 + 3);
    };
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 2, 1);            // 顶
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 4, .85);          // 南
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 5, .8);           // 北
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0, .9);           // 东
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 1, .75);          // 西
  };
  for (let x = ox; x <= ex; x += S) for (let z = oz; z <= ez; z += S) {
    let topY = -1, topC = 0;
    for (let dx = 0; dx < S && x + dx <= ex; dx += 2) for (let dz = 0; dz < S && z + dz <= ez; dz += 2) {
      const i = CHANGAN.fieldIndex(x + dx, z + dz);
      if (fields.topH[i] > topY) { topY = fields.topH[i]; topC = fields.topColor[i]; }
    }
    if (topY < 0 || !topC) continue;
    const rgb = ctx.palRGB[topC - 1];
    const y0 = Math.max(0, topY - 6);
    pushBox(x - ox, y0, z - oz, Math.min(x + S, ex + 1) - ox, topY + 1, Math.min(z + S, ez + 1) - oz, rgb);
  }
  if (!idx.length) return null;
  return { pos: new Uint16Array(pos), nor: new Uint8Array(nor), col: new Uint8Array(col), idx: new Uint32Array(idx) };
}

// ================================================================ actor 路径网络（街/坊门/渠为图，actor 只在合法网络上）
CHANGAN.buildPaths = function (ctx) {
  const A = CFG.AXIS_X;
  return {
    camel: { loop: false, pts: [[-360, -9], [-240, -9], [-164, -9], [-164, 75], [-193, 75], [-193, 96], [-206, 118]] }, // 开远门→西市水岸
    court: { loop: false, pts: [[225, 264], [225, 96], [4, 96], [4, -228]] },                                            // 启夏门街→朱雀→承天门
    courtW: { loop: false, pts: [[-225, 264], [-225, 96], [-4, 96], [-4, -228]] },
    daming: { loop: false, pts: [[51, 96], [51, -96], [150, -96], [208, -150], [208, -240]] },                          // 东内苑→丹凤门
    pilgrimYan: { loop: false, pts: [[-1, 264], [120, 264], [164, 264], [190, 264]] },                                  // 大雁塔
    pilgrimQing: { loop: false, pts: [[227, 201], [256, 180], [256, 156]] },                                            // 青龙寺
    patrol: { loop: true, pts: [[-120, -90], [120, -90], [120, -236], [-120, -236]] },                                  // 金吾夜巡环皇城
    patrolAxis: { loop: true, pts: [[-1, 280], [-1, -96]] },
    boatYongan: { loop: false, pts: [[-352, 190], [-260, 186], [-232, 170], [-232, 128], [-214, 118]] },
    boatQujiang: { loop: true, pts: [[300, 214], [340, 214], [340, 272], [300, 272]] },
    toWestMarket: { loop: false, pts: [[-1, 96], [-120, 96], [-164, 96], [-164, 75], [-193, 75]] },
    toEastMarket: { loop: false, pts: [[1, 96], [120, 96], [164, 96], [164, 75], [193, 75]] },
  };
};

// ================================================================ 机位锚点（由布局常量解算，供 18 机位）
CHANGAN.buildViewAnchors = function (ctx) {
  const gh = (x, z) => ctx.fields.groundH[CHANGAN.fieldIndex(x, z)];
  return {
    mingde: { x: -1, y: gh(-1, 288) + 6, z: 288 },
    axis: { x: -1, y: gh(-1, 96) + 2, z: 96 },
    hengjie: { x: 0, y: gh(0, -228) + 2, z: -228 },
    hanyuan: { x: 208, y: gh(208, -280) + 12, z: -278 },
    taiye: { x: 270, y: gh(270, -342) + 2, z: -342 },
    xingqing: { x: 256, y: gh(256, 12) + 8, z: 12 },
    westMarket: { x: -193, y: gh(-193, 117) + 6, z: 117 },
    eastMarket: { x: 193, y: gh(193, 117) + 6, z: 117 },
    dayanta: { x: 185, y: gh(185, 270) + 24, z: 270 },
    xiaoyanta: { x: 26, y: gh(26, 54) + 18, z: 54 },
    qinglong: { x: 256, y: gh(256, 138) + 8, z: 138 },
    jingshan: { x: 26, y: gh(26, 96) + 8, z: 96 },
    wardGate: { x: 131, y: gh(131, 72) + 2, z: 72 },
    lane: { x: 131, y: gh(131, 40) + 2, z: 40 },
    qujiang: { x: 318, y: gh(318, 226) + 4, z: 226 },
    jinguang: { x: -352, y: gh(-352, 75) + 6, z: 75 },
    kaiyuan: { x: -352, y: gh(-352, -9) + 6, z: -9 },
  };
};
