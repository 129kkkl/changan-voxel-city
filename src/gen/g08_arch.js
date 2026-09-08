// g08_arch.js — 建筑层（ArchGrid）：2× 分辨率的建筑专用体素层
// 设计要点（见 10_建筑大升级计划_v4.md §3）：
//   ① 城市层（VoxStore，1 体素 ≈ 13.8m）只负责地形/街/墙/渠/铺装/树；
//   ② 建筑层（ArchStore，1 建筑体素 = 0.5 城市体素 ≈ 6.9m）承担全部建筑；
//   ③ 每栋建筑只有一个权威来源 —— 本文件构造的建筑不再由城市层重复生成（守则铁律一）。
'use strict';

// ---------------------------------------------------------------- 建筑体素存储（arch 坐标，稀疏 Map）
CHANGAN.ArchStore = class ArchStore {
  constructor() { this.map = new Map(); }
  get count() { return this.map.size; }
  _k(x, y, z) { return ((x + 4096) * 8192 + (z + 4096)) * 512 + y; }
  set(x, y, z, c) {
    if (y < 0 || y > 511) return;
    x |= 0; y |= 0; z |= 0;
    this.map.set(this._k(x, y, z), c);
  }
  get(x, y, z) { return this.map.get(this._k(x | 0, y | 0, z | 0)) | 0; }
  has(x, y, z) { return this.map.has(this._k(x | 0, y | 0, z | 0)); }
  fill(x0, y0, z0, x1, y1, z1, c) {
    const xa = Math.min(x0, x1) | 0, xb = Math.max(x0, x1) | 0;
    const ya = Math.min(y0, y1) | 0, yb = Math.max(y0, y1) | 0;
    const za = Math.min(z0, z1) | 0, zb = Math.max(z0, z1) | 0;
    for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) for (let y = ya; y <= yb; y++) this.set(x, y, z, c);
  }
  // 只写一层水平板（省体素：楼板/屋面不必实心）
  slab(x0, y, z0, x1, z1, c) { this.fill(x0, y, z0, x1, y, z1, c); }
  // 空心盒（墙/台基：只写外壳，内部留空 —— 直接把建筑层体素压到 1/3）
  shellBox(x0, y0, z0, x1, y1, z1, c) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { this.set(x, y0, z, c); this.set(x, y1, z, c); }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { this.set(x, y, z0, c); this.set(x, y, z1, c); }
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) { this.set(x0, y, z, c); this.set(x1, y, z, c); }
  }
  bbox() {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const k of this.map.keys()) {
      const y = k % 512, t = (k - y) / 512, z = (t % 8192) - 4096, x = (t - (t % 8192)) / 8192 - 4096;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    return { x0, y0, z0, x1, y1, z1 };
  }
};

// ---------------------------------------------------------------- 构件：台基 / 踏道 / 柱列 / 斗拱
// 全部以「建筑体素」为单位（1 建筑体素 = 0.5 城市体素）。厚度恒为 1，尺寸按等级放大。
const ARCH = {
  // 台基：空心盒 + 压边 + 南向踏道
  platform(a, x0, z0, x1, z1, y0, h, opts) {
    opts = opts || {};
    const c = opts.c || PAL.stoneGrey, edge = opts.edge || PAL.stoneWhite;
    a.shellBox(x0, y0, z0, x1, y0 + h, z1, c);
    // 压边（顶面外沿一圈白石）
    for (let x = x0; x <= x1; x++) { a.set(x, y0 + h, z0, edge); a.set(x, y0 + h, z1, edge); }
    for (let z = z0; z <= z1; z++) { a.set(x0, y0 + h, z, edge); a.set(x1, y0 + h, z, edge); }
    // 南向踏道（实心砌筑，防浮空）
    if (opts.steps !== false) {
      const cx = (x0 + x1) >> 1, w = opts.stepW || 5;
      for (let s = 0; s < h; s++) {
        a.fill(cx - w, y0, z1 + 1 + s, cx + w, y0 + h - 1 - s, z1 + 1 + s, edge);
      }
    }
    return y0 + h + 1;
  },

  // 柱网：沿 x 布 bays+1 根檐柱，进深方向 2~3 排；柱径由 colR 控制（宫殿 2，民居 1），返回柱位
  colonnade(a, x0, z0, x1, z1, y0, h, bays, colC, colR) {
    const R = colR || 1;
    const cols = [];
    const xs = [];
    for (let b = 0; b <= bays; b++) xs.push(Math.round(x0 + (x1 - x0) * b / bays));
    const uniq = Array.from(new Set(xs)).sort((p, q) => p - q);
    for (const x of uniq) { cols.push([x, z0], [x, z1]); }
    const midZ = (z0 + z1) >> 1;
    if (z1 - z0 >= 10) for (const x of uniq) cols.push([x, midZ]);
    for (const [x, z] of cols) for (let y = y0; y < y0 + h; y++) {
      for (let dx = 0; dx < R; dx++) for (let dz = 0; dz < R; dz++) a.set(x + dx, y, z + dz, colC);
    }
    // 额枋（柱头之间横贯，一层高）
    for (const [x, z] of cols) for (let dx = 0; dx < R; dx++) a.set(x + dx, y0 + h, z, colC);
    for (let x = x0; x <= x1; x++) { for (let dz = 0; dz < R; dz++) { a.set(x, y0 + h, z0 + dz, colC); a.set(x, y0 + h, z1 - dz, colC); } }
    for (let z = z0; z <= z1; z++) { for (let dx = 0; dx < R; dx++) { a.set(x0 + dx, y0 + h, z, colC); a.set(x1 - dx, y0 + h, z, colC); } }
    return { cols, xs: uniq };
  },

  // 斗拱：柱头一垛（向外挑 2、向上 1），补间一朵
  dougong(a, cols, y, colC, outC) {
    for (const [x, z] of cols) {
      // 柱头斗拱：三层叠出
      a.set(x, y + 1, z, colC);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) a.set(x + dx, y + 1, z + dz, outC);
      a.set(x, y + 2, z, outC);
    }
  },

  // 墙体：柱间砌墙，留门窗洞（洞口宽度按开间）
  wall(a, x0, z0, x1, z1, y0, h, cols, opts) {
    opts = opts || {};
    const wallC = opts.wallC || PAL.plaster, winC = opts.winC || PAL.timberDark;
    const isCol = new Set(cols.map(([x, z]) => x * 10000 + z));
    // 柱径 >1 时，墙体要避开整根柱子（含左上邻格）
    const nearCol = (x, z) => isCol.has(x * 10000 + z) || isCol.has((x - 1) * 10000 + z)
      || isCol.has(x * 10000 + z - 1) || isCol.has((x - 1) * 10000 + z - 1);
    const doorBay = opts.doorBay == null ? -1 : opts.doorBay;
    const xs = opts.xs || [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      if (nearCol(x, z)) continue;
      // 找到所属开间
      let bay = -1;
      for (let i = 0; i + 1 < xs.length; i++) if (x >= xs[i] && x <= xs[i + 1]) { bay = i; break; }
      const south = (z === z1);
      for (let y = y0; y < y0 + h; y++) {
        const top = (y === y0 + h - 1);
        if (top) { a.set(x, y, z, opts.frameC || PAL.zhu); continue; }
        // 南立面：门洞（指定开间）/ 直棂窗（其余开间的中部）
        if (south && bay >= 0 && bay < xs.length - 1) {
          const bw = xs[bay + 1] - xs[bay];
          const mid = (xs[bay] + xs[bay + 1]) >> 1;
          if (bay === doorBay && Math.abs(x - mid) <= 1) continue;          // 门洞留空
          if (bay !== doorBay && bw >= 4 && Math.abs(x - mid) <= 0 && y > y0 && y < y0 + h - 2) {
            a.set(x, y, z, winC); continue;                                  // 直棂窗（深色棂条）
          }
        }
        a.set(x, y, z, wallC);
      }
    }
  },

  // 瓦面：庑殿坡，逐层内收 1，1 建筑体素一级的连续台阶坡。
  // 关键修正：**长短轴分别内收**——短轴收尽成脊线，长轴按 ridgeRatio 少收，
  // 留出正脊长度。上一版两轴同收，长轴留下 26 格宽的大平顶，评审判"像一块大平板"。
  roofHip(a, x0, z0, x1, z1, y0, opts) {
    opts = opts || {};
    const main = opts.main || PAL.roofGrey, groove = opts.groove || PAL.roofGroove;
    const lip = opts.lip || PAL.roofLight, trim = opts.trim;
    const over = opts.overhang == null ? 3 : opts.overhang;
    const ex0 = x0 - over, ex1 = x1 + over, ez0 = z0 - over, ez1 = z1 + over;
    const hx = (ex1 - ex0) >> 1, hz = (ez1 - ez0) >> 1;
    const alongX = hx >= hz;
    const shortHalf = alongX ? hz : hx;
    const layers = Math.max(3, Math.min(opts.layers || 15, shortHalf));
    const rLong = opts.ridgeRatio == null ? 0.55 : opts.ridgeRatio;
    let lx0 = ex0, lx1 = ex1, lz0 = ez0, lz1 = ez1;
    for (let L = 0; L < layers; L++) {
      const t = Math.pow(L / Math.max(1, layers - 1), 1.15);
      const ix = Math.round(hx * t * (alongX ? rLong : 1));
      const iz = Math.round(hz * t * (alongX ? 1 : rLong));
      const xa = ex0 + ix, xb = ex1 - ix, za = ez0 + iz, zb = ez1 - iz;
      if (xa > xb || za > zb) break;
      const y = y0 + L;
      for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) {
        const ring = (x === xa || x === xb || z === za || z === zb);
        let c = ((alongX ? x : z) & 1) ? main : groove;
        if (L === 0 && ring) c = lip;
        if (trim && L === 0 && ring) c = trim;
        a.set(x, y, z, c);
      }
      lx0 = xa; lx1 = xb; lz0 = za; lz1 = zb;
    }
    // 正脊（沿长轴，两层）+ 鸱尾（三段收分 + 外卷尖）
    const ry = y0 + layers;
    const fin = opts.finial || PAL.gold;
    const ridgeC = opts.ridgeC || PAL.roofDark;
    if (alongX) {
      const cz = (lz0 + lz1) >> 1;
      for (let x = lx0; x <= lx1; x++) { a.set(x, ry, cz, ridgeC); a.set(x, ry + 1, cz, ridgeC); }
      for (const [sx, dir] of [[lx0, -1], [lx1, 1]]) {
        // 鸱尾：宽基座 + 逐级外卷的鱼尾（5 格高，正脊端头明确收头）
        for (let k = 0; k < 3; k++) a.set(sx - dir * 0 + dir * k, ry + 2, cz, fin);
        a.set(sx, ry + 3, cz, fin); a.set(sx + dir, ry + 3, cz, fin); a.set(sx + dir * 2, ry + 3, cz, fin);
        a.set(sx, ry + 4, cz, fin); a.set(sx + dir, ry + 4, cz, fin); a.set(sx + dir * 2, ry + 4, cz, ridgeC);
        a.set(sx, ry + 5, cz, fin); a.set(sx + dir, ry + 5, cz, fin);
        a.set(sx + dir, ry + 6, cz, fin);
      }
    } else {
      const cx = (lx0 + lx1) >> 1;
      for (let z = lz0; z <= lz1; z++) { a.set(cx, ry, z, ridgeC); a.set(cx, ry + 1, z, ridgeC); }
      for (const [sz, dir] of [[lz0, -1], [lz1, 1]]) {
        a.set(cx, ry + 2, sz, fin); a.set(cx, ry + 2, sz + dir, ridgeC);
        a.set(cx, ry + 3, sz, fin); a.set(cx, ry + 3, sz + dir * 2, fin);
        a.set(cx, ry + 4, sz + dir, fin);
      }
    }
    return ry + 5;
  },

  // 悬山两坡（民居/厢房）：沿长轴起坡，两端山面封板
  roofGable(a, x0, z0, x1, z1, y0, opts) {
    opts = opts || {};
    const main = opts.main || PAL.roofGrey, groove = opts.groove || PAL.roofGroove;
    const lip = opts.lip || PAL.roofLight;
    const over = opts.overhang == null ? 2 : opts.overhang;
    const ex0 = x0 - over, ex1 = x1 + over, ez0 = z0 - over, ez1 = z1 + over;
    const hz = (ez1 - ez0) >> 1;
    const layers = Math.max(3, Math.min(opts.layers || 6, hz));
    for (let L = 0; L < layers; L++) {
      const t = Math.pow(L / Math.max(1, layers - 1), 1.15);
      const iz = Math.round(hz * t);
      const za = ez0 + iz, zb = ez1 - iz;
      if (za > zb) break;
      const y = y0 + L;
      for (let x = ex0; x <= ex1; x++) for (let z = za; z <= zb; z++) {
        const isEave = (z === za || z === zb);
        let c = ((x & 1) ? main : groove);
        if (L === 0 && isEave) c = lip;
        a.set(x, y, z, c);
      }
      for (const sx of [ex0, ex1]) for (let z = za; z <= zb; z++) a.set(sx, y, z, L === 0 ? lip : PAL.plasterWarm);
    }
    const ry = y0 + layers;
    const cz = (ez0 + ez1) >> 1;
    for (let x = ex0; x <= ex1; x++) a.set(x, ry, cz, PAL.roofDark);
    a.set(ex0, ry + 1, cz, PAL.roofDark); a.set(ex1, ry + 1, cz, PAL.roofDark);
    return ry + 2;
  },

  // 院墙：夯土墙身 + 瓦顶压边（外挑 1 + 瓦暗脊）+ 门洞与门柱
  enclosure(a, x0, z0, x1, z1, base, facing, opts) {
    opts = opts || {};
    const courses = opts.courses || 3;
    const cap = base + courses + 1;
    const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
    const gateW = opts.gateW || 3;
    let gx = cx, gz = z1, gAxis = 'NS';
    if (facing === 'N') { gx = x0 + 4; gz = z0; }
    else if (facing === 'E') { gx = x1; gz = cz; gAxis = 'EW'; }
    else if (facing === 'W') { gx = x0; gz = cz; gAxis = 'EW'; }
    const isGate = (x, z) => gAxis === 'NS' ? (z === gz && Math.abs(x - gx) <= gateW) : (x === gx && Math.abs(z - gz) <= gateW);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      if (isGate(x, z)) continue;
      a.set(x, base + 1, z, PAL.rammed);
      if (courses >= 2) a.set(x, base + 2, z, PAL.rammedLight);
      if (courses >= 3) a.set(x, base + 3, z, PAL.rammedLight);
      a.set(x, cap, z, PAL.roofDark);
      const ox = x === x0 ? -1 : x === x1 ? 1 : 0;
      const oz = z === z0 ? -1 : z === z1 ? 1 : 0;
      if (ox) a.set(x + ox, cap, z, PAL.roofGrey);
      if (oz) a.set(x, cap, z + oz, PAL.roofGrey);
    }
    const posts = gAxis === 'NS' ? [[gx - gateW - 1, gz], [gx + gateW + 1, gz]] : [[gx, gz - gateW - 1], [gx, gz + gateW + 1]];
    for (const [px, pz] of posts) for (let y = 1; y <= courses + 1; y++) a.set(px, base + y, pz, PAL.zhu);
    for (let s = -gateW; s <= gateW; s++) a.set(gAxis === 'NS' ? gx + s : gx, cap, gAxis === 'NS' ? gz : gz + s, PAL.roofDark);
    return { gx, gz, gAxis };
  },
};

// ---------------------------------------------------------------- 坊内院落（建筑层 2×）：E1~E3 居住亚型
// 城市层只负责地坪与树井（archCompoundGround），建筑全部由本函数写进建筑层 —— 单一权威。
const TONE_BY_LEVEL = [
  [[PAL.roofGrey, PAL.roofLight, PAL.roofGroove], [PAL.roofGrey, PAL.roofLight, PAL.roofGroove], [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG]],
  [[PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG], [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG], [PAL.roofGrey, PAL.roofLight, PAL.roofGroove]],
  [[PAL.roofGreen, PAL.roofGreenL, PAL.roofGreenG], [PAL.roofBlue, PAL.roofBlueL, PAL.roofBlueG], [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG]],
];

// 院落地面（城市层）：浅夯土满铺 + 中轴砖道
CHANGAN.archCompoundGround = function (ctx, x0, z0, w, d, base) {
  const { store } = ctx;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (i < 0 || ctx.fields.road[i] || ctx.fields.water[i]) continue;
    store.set(x, base, z, PAL.loessLight);
  }
  const cx = (x0 + x1) >> 1;
  for (let z = z0; z <= z1; z++) store.set(cx, base, z, PAL.brickPave);
  for (let x = x0 + 1; x <= x1 - 1; x++) store.set(x, base, z0 + Math.floor(d * 0.55), PAL.brickPave);
};

CHANGAN.buildArchCompound = function (ctx, x0, z0, w, d, base, level, rng, facing, plan) {
  const a = ctx.arch;
  if (!a) return;
  const S = 2;
  const ax0 = x0 * S, az0 = z0 * S, ax1 = (x0 + w) * S - 1, az1 = (z0 + d) * S - 1;
  const ab = base * S;
  const courses = level === 0 ? 2 : 3;
  const g = ARCH.enclosure(a, ax0, az0, ax1, az1, ab, facing || 'S', { courses, gateW: 3 });
  const wallTop = ab + courses + 1;
  // 琉璃色只给大体量院落，小宅保持青灰/黛（评审判"亮翠绿像游乐园"）
  const tonePool = (level >= 2 && Math.min(w, d) >= 18) ? TONE_BY_LEVEL[2] : TONE_BY_LEVEL[Math.min(1, level)];
  const tone = tonePool[Math.floor(rng() * tonePool.length)];
  const roofOpt = { main: tone[0], groove: tone[2], lip: tone[1], overhang: level === 0 ? 2 : 3 };

  // 正房（坐北朝南，占院北侧）
  const mainD = Math.max(8, Math.min(20, Math.round(d * 0.42) * S));
  const hx0 = ax0 + 3, hx1 = ax1 - 3, hz0 = az0 + 3, hz1 = Math.min(az1 - 6, az0 + 3 + mainD);
  let topY = wallTop;
  if (hx1 - hx0 >= 10 && hz1 - hz0 >= 6) {
    const bays = Math.max(3, Math.min(9, Math.round((hx1 - hx0) / 8)));
    const wallH = level === 0 ? 4 : 6;
    let y = ARCH.platform(a, hx0 - 2, hz0 - 2, hx1 + 2, hz1 + 2, ab, level === 0 ? 2 : 3, { steps: true, stepW: 4 });
    const fr = ARCH.colonnade(a, hx0, hz0, hx1, hz1, y, wallH, bays, level >= 2 ? PAL.zhuBright : PAL.zhu, level >= 1 ? 2 : 1);
    ARCH.wall(a, hx0, hz0, hx1, hz1, y, wallH, fr.cols, {
      wallC: rng() < 0.4 ? PAL.plasterWarm : PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu,
      xs: fr.xs, doorBay: Math.floor(bays / 2),
    });
    ARCH.dougong(a, fr.cols, y + wallH - 1, PAL.zhuBright, PAL.zhu);
    const roofY = y + wallH + 2;
    topY = level >= 2
      ? ARCH.roofHip(a, hx0, hz0, hx1, hz1, roofY, Object.assign({ layers: 8, ridgeRatio: 0.6 }, roofOpt))
      : ARCH.roofGable(a, hx0, hz0, hx1, hz1, roofY, Object.assign({ layers: 6 }, roofOpt));
  }

  // 厢房（东西各一，体量低于正房）
  const wingW = 7;
  if (plan && plan.wingMode !== 'none' && az1 - hz1 >= 12) {
    const wz0 = hz1 + 4, wz1 = az1 - 4;
    const buildWing = (side) => {
      const wx0 = side === 'W' ? ax0 + 3 : ax1 - 3 - wingW;
      const wx1 = wx0 + wingW;
      if (wz1 - wz0 < 6) return;
      const wy = ARCH.platform(a, wx0 - 1, wz0 - 1, wx1 + 1, wz1 + 1, ab, 1, { steps: false });
      const wf = ARCH.colonnade(a, wx0, wz0, wx1, wz1, wy, 5, 2, PAL.zhu, 1);
      ARCH.wall(a, wx0, wz0, wx1, wz1, wy, 5, wf.cols, { wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: wf.xs, doorBay: -1 });
      ARCH.roofGable(a, wx0, wz0, wx1, wz1, wy + 6, { layers: 6, overhang: 2, main: tone[0], groove: tone[2], lip: tone[1] });
    };
    if (plan.wingMode === 'both') { buildWing('W'); buildWing('E'); }
    else buildWing(plan.wingMode === 'E' ? 'E' : 'W');
  }

  // 门屋（跨在院门上的小屋）
  if (g.gAxis === 'NS' && g.gz === az1) {
    const gw = 7;
    const gy = ARCH.platform(a, g.gx - gw, az1 - 5, g.gx + gw, az1 + 1, ab, 1, { steps: false });
    const gf = ARCH.colonnade(a, g.gx - gw, az1 - 5, g.gx + gw, az1, gy, 4, 3, PAL.zhuBright, 1);
    ARCH.roofGable(a, g.gx - gw, az1 - 5, g.gx + gw, az1, gy + 5, { layers: 5, overhang: 2, main: tone[0], groove: tone[2], lip: tone[1] });
    topY = Math.max(topY, gy + 10);
  }

  // 占位戳进城市字段：碰撞 / 小地图 / 远景 LOD 与建筑层一致
  const topCity = Math.ceil(topY / S);
  for (let x = x0; x <= x0 + w - 1; x++) for (let z = z0; z <= z0 + d - 1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (i < 0) continue;
    ctx.fields.topH[i] = topCity;
    ctx.fields.topColor[i] = tone[0];
  }
  return topY;
};

// ---------------------------------------------------------------- 样板：含元殿式重檐庑殿大朝正殿
// 以建筑体素为单位；cx/cz 为建筑中心，base 为台基顶面（建筑体素 y）
CHANGAN.buildArchGrandHall = function (a, cx, cz, base, opts) {
  opts = opts || {};
  const bays = opts.bays || 13;
  const W = opts.W || 64, D = opts.D || 38;       // 建筑体素（= 32×19 城市体素）
  const x0 = cx - (W >> 1), x1 = x0 + W - 1;
  const z0 = cz - (D >> 1), z1 = z0 + D - 1;

  // 1. 台基（2 层，共 4 建筑体素高 = 2 城市体素）
  let y = ARCH.platform(a, x0 - 3, z0 - 3, x1 + 3, z1 + 3, base, 3, { steps: true, stepW: 7 });
  y = ARCH.platform(a, x0 - 1, z0 - 1, x1 + 1, z1 + 1, y - 1, 2, { steps: false });

  // 2. 檐柱列（13 间，柱径 2）+ 墙 + 斗拱
  const bodyH = 14;                                  // 屋身 16 建筑体素 = 8 城市体素
  const fr = ARCH.colonnade(a, x0, z0, x1, z1, y, bodyH, bays, PAL.zhuBright, 2);
  ARCH.wall(a, x0, z0, x1, z1, y, bodyH, fr.cols, {
    wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu,
    xs: fr.xs, doorBay: Math.floor(bays / 2),
  });
  ARCH.dougong(a, fr.cols, y + bodyH - 1, PAL.zhuBright, PAL.zhu);

  // 3. 下檐（腰檐，琉璃剪边，出檐 7 = 3.5 城市体素）
  const eaveY = y + bodyH + 2;
  const eo = 7;
  for (let x = x0 - eo; x <= x1 + eo; x++) for (let z = z0 - eo; z <= z1 + eo; z++) {
    const ring = (x === x0 - eo || x === x1 + eo || z === z0 - eo || z === z1 + eo);
    if (!ring) continue;
    a.set(x, eaveY, z, PAL.roofGreen);
    a.set(x, eaveY + 1, z, ((x & 1) ? PAL.roofGreen : PAL.roofGreenG));
    if (x === x0 - eo || x === x1 + eo || z === z0 - eo || z === z1 + eo) a.set(x, eaveY, z, PAL.gold);
  }
  // 檐角起翘（四角高 2）
  for (const [qx, qz] of [[x0 - eo, z0 - eo], [x1 + eo, z0 - eo], [x0 - eo, z1 + eo], [x1 + eo, z1 + eo]]) {
    a.set(qx, eaveY + 2, qz, PAL.gold);
    a.set(qx, eaveY + 3, qz, PAL.gold);
  }

  // 4. 楼身（重檐之间的真实屋身，9 建筑体素）
  const drumY = eaveY + 2;
  const drumH = 6;
  const dx0 = x0 + 5, dx1 = x1 - 5, dz0 = z0 + 5, dz1 = z1 - 5;
  const fr2 = ARCH.colonnade(a, dx0, dz0, dx1, dz1, drumY, drumH, Math.max(3, bays - 6), PAL.zhuBright, 2);
  ARCH.wall(a, dx0, dz0, dx1, dz1, drumY, drumH, fr2.cols, {
    wallC: PAL.plasterWarm, winC: PAL.timberDark, frameC: PAL.zhu, xs: fr2.xs, doorBay: -1,
  });
  ARCH.dougong(a, fr2.cols, drumY + drumH - 1, PAL.zhuBright, PAL.zhu);

  // 5. 上檐（重檐庑殿顶，**琉璃绿瓦 + 金剪边 + 金鸱尾** —— 皇宫必须一眼跳出来）
  const topY = drumY + drumH + 2;
  ARCH.roofHip(a, dx0, dz0, dx1, dz1, topY, {
    main: PAL.roofGreen, groove: PAL.roofGreenG, lip: PAL.roofGreenL,
    trim: PAL.gold, ridgeC: PAL.glazeGreen, overhang: 7, layers: 15,
    finial: PAL.gold, ridgeRatio: 0.55,
  });
  return topY;
};

// ---------------------------------------------------------------- 建筑层网格化（面剔除，输出城市坐标）
// 顶点坐标 = 建筑坐标 / 2（1 建筑体素 = 0.5 城市体素）
CHANGAN.meshArch = function (ctx, a) {
  const palRGB = ctx.palRGB;
  const pos = [], nor = [], col = [], idx = [];
  const FACE = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const SHADE = [0.90, 0.90, 1.0, 0.62, 0.96, 0.84];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // 每个面的 4 个角（单位立方体，位于 (x,y,z)..(x+1,y+1,z+1)）
  const CORNERS = [
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],  // +x
    [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],  // -x
    [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],  // +y
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],  // -y
    [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],  // +z
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],  // -z
  ];
  let quads = 0;
  for (const [k, c] of a.map) {
    const y = k % 512, t = (k - y) / 512, z = (t % 8192) - 4096, x = (t - (t % 8192)) / 8192 - 4096;
    const rgb = palRGB[c - 1];
    if (!rgb) continue;
    for (let f = 0; f < 6; f++) {
      const d = DIRS[f];
      if (a.has(x + d[0], y + d[1], z + d[2])) continue;
      const sh = SHADE[f];
      const vi = pos.length / 3;
      for (const q of CORNERS[f]) {
        pos.push((x + q[0]) * 0.5, (y + q[1]) * 0.5, (z + q[2]) * 0.5);
        nor.push(f);
        col.push(Math.min(255, rgb[0] * sh) | 0, Math.min(255, rgb[1] * sh) | 0, Math.min(255, rgb[2] * sh) | 0);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      quads++;
    }
  }
  return { pos: new Float32Array(pos), nor: new Uint8Array(nor), col: new Uint8Array(col), idx: new Uint32Array(idx), quads };
};
