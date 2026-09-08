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
    // 柱头斗拱向外挑 2 格（华拱两层）+ 挑檐枋环：
    // P0 判"柱顶到檐口之间仍是同一平面贴附，结构性进深只完成一半"。
    for (const [x, z] of cols) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        a.set(x + dx, y + 1, z + dz, outC);
        a.set(x + 2 * dx, y + 1, z + 2 * dz, outC);
        a.set(x + 2 * dx, y + 2, z + 2 * dz, outC);
      }
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
      // 四面都开门窗洞（P0 判"墙面只有等距细黑孔，像货架隔板"）：
      // 按开间取中、洞宽 3 或 1、竖向占窗带（下碱与额枋之间），门洞留空
      const south = (z === z1), north = (z === z0);
      const onMain = south || north;
      const mcz = (z0 + z1) >> 1;
      let bay2 = -1, bayMid = 0, bayW = 0;
      if (onMain && bay >= 0 && bay + 1 < xs.length) {
        bay2 = bay; bayMid = (xs[bay] + xs[bay + 1]) >> 1; bayW = xs[bay + 1] - xs[bay];
      } else if (!onMain) {
        bay2 = 0; bayMid = mcz; bayW = z1 - z0 + 1;
      }
      const half = bayW >= 6 ? 1 : 0;
      const isDoorBay = south && bay2 === doorBay;
      for (let y = y0; y < y0 + h; y++) {
        if (y === y0 + h - 1) { a.set(x, y, z, opts.frameC || PAL.zhu); continue; }   // 额枋
        if (y === y0) { a.set(x, y, z, wallC); continue; }                            // 下碱
        const inWin = bay2 >= 0 && y <= y0 + h - 2
          && (onMain ? Math.abs(x - bayMid) <= half : Math.abs(z - bayMid) <= half);
        if (inWin) {
          if (isDoorBay) continue;                    // 门洞留空
          a.set(x, y, z, winC); continue;             // 直棂窗
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
      // 脊端收头：按屋顶规模缩放。普通民居只起 1 格（原先一律 5 格高的"叉状大块"，
      // 被重建方案点名"屋脊及脊端形成大量巨大的灰色叉状块"）。
      const fh = opts.finialH == null ? (shortHalf >= 8 ? 3 : 1) : opts.finialH;
      for (const [sx, dir] of [[lx0, -1], [lx1, 1]]) {
        if (fh <= 1) { a.set(sx, ry + 2, cz, fin); continue; }
        a.set(sx, ry + 2, cz, fin); a.set(sx + dir, ry + 2, cz, fin);
        a.set(sx, ry + 3, cz, fin); a.set(sx + dir, ry + 3, cz, ridgeC);
        if (fh >= 3) { a.set(sx, ry + 4, cz, fin); a.set(sx + dir, ry + 4, cz, fin); }
      }
    } else {
      const cx = (lx0 + lx1) >> 1;
      for (let z = lz0; z <= lz1; z++) { a.set(cx, ry, z, ridgeC); a.set(cx, ry + 1, z, ridgeC); }
      const fh2 = opts.finialH == null ? (shortHalf >= 8 ? 3 : 1) : opts.finialH;
      for (const [sz, dir] of [[lz0, -1], [lz1, 1]]) {
        if (fh2 <= 1) { a.set(cx, ry + 2, sz, fin); continue; }
        a.set(cx, ry + 2, sz, fin); a.set(cx, ry + 2, sz + dir, fin);
        a.set(cx, ry + 3, sz, fin); a.set(cx, ry + 3, sz + dir, ridgeC);
        if (fh2 >= 3) { a.set(cx, ry + 4, sz + dir, fin); }
      }
    }
    return ry + (opts.finialH == null && shortHalf < 8 ? 3 : 5);
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
      // 檐口挑出：最下一层再向外挑 2 格（P0 判"檐口零出挑，像扣在盒子上的帽檐"）
      const out = (L === 0) ? 2 : 0;
      for (let x = ex0 - out; x <= ex1 + out; x++) for (let z = za - out; z <= zb + out; z++) {
        const isEave = (z === za - out || z === zb + out);
        let c = ((x & 1) ? main : groove);
        if (L === 0 && isEave) c = lip;
        a.set(x, y, z, c);
      }
      for (const sx of [ex0 - out, ex1 + out]) for (let z = za - out; z <= zb + out; z++) a.set(sx, y, z, L === 0 ? lip : PAL.plasterWarm);
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

// ---------------------------------------------------------------- 官署（皇城百司）：B1~B3 独立语法
// 与坊内民居彻底分开：外垣 + 前庭 + 仪门 + 重檐大堂 + 东西廊庑 + 后堂，等级由 rank 控制
CHANGAN.buildArchOffice = function (ctx, x0, z0, x1, z1, base, rng, facing, rank) {
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;
  const S = 2;
  const ax0 = x0 * S, az0 = z0 * S, ax1 = (x1 + 1) * S - 1, az1 = (z1 + 1) * S - 1;
  const ab = base * S;
  const R = rank == null ? 3 : rank;
  // 官署色带：三品以上琉璃绿、以下琉璃蓝，与坊区灰瓦形成鸟瞰可辨的独立色带
  const tone = R >= 4 ? [PAL.roofGreen, PAL.roofGreenL, PAL.roofGreenG] : [PAL.roofBlue, PAL.roofBlueL, PAL.roofBlueG];
  // 外垣
  const g = ARCH.enclosure(a, ax0, az0, ax1, az1, ab, facing || 'S', { courses: 3, gateW: 5 });
  const wallTop = ab + 4;

  // 仪门（第二道门，3 间，歇山）
  const midZ = Math.round(az0 + (az1 - az0) * 0.42);
  const gw = 14;
  const gy = ARCH.platform(a, g.gx - gw, midZ - 6, g.gx + gw, midZ + 6, ab, 2, { steps: true, stepW: 5 });
  const gf = ARCH.colonnade(a, g.gx - gw, midZ - 6, g.gx + gw, midZ + 6, gy, 8, 3, PAL.zhuBright, 2);
  ARCH.wall(a, g.gx - gw, midZ - 6, g.gx + gw, midZ + 6, gy, 8, gf.cols, {
    wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: gf.xs, doorBay: 1,
  });
  ARCH.dougong(a, gf.cols, gy + 7, PAL.zhuBright, PAL.zhu);
  ARCH.roofGable(a, g.gx - gw, midZ - 6, g.gx + gw, midZ + 6, gy + 10, {
    layers: 7, overhang: 4, main: PAL.roofSlate, groove: PAL.roofSlateG, lip: PAL.roofSlateL,
  });

  // 大堂（坐北，5~7 间，重檐歇山，琉璃剪边）—— 官署的视觉核心
  const hw = (R >= 4 ? 24 : 19) + Math.round(rng() * 6), hd = 14 + Math.round(rng() * 4);
  const hcx = (ax0 + ax1) >> 1;
  const hz1 = az0 + 8 + hd, hz0 = az0 + 8;
  const hx0 = hcx - hw, hx1 = hcx + hw;
  let y = ARCH.platform(a, hx0 - 4, hz0 - 4, hx1 + 4, hz1 + 4, ab, 3, { steps: true, stepW: 7 });
  const bays = (R >= 4 ? 7 : 5) + (rng() < 0.4 ? 2 : 0);
  const fr = ARCH.colonnade(a, hx0, hz0, hx1, hz1, y, 12, bays, PAL.zhuBright, 2);
  ARCH.wall(a, hx0, hz0, hx1, hz1, y, 12, fr.cols, {
    wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: fr.xs, doorBay: Math.floor(bays / 2),
  });
  ARCH.dougong(a, fr.cols, y + 11, PAL.zhuBright, PAL.zhu);
  // 腰檐
  const eaveY = y + 14, eo = 5;
  for (let x = hx0 - eo; x <= hx1 + eo; x++) for (let z = hz0 - eo; z <= hz1 + eo; z++) {
    const ring = (x === hx0 - eo || x === hx1 + eo || z === hz0 - eo || z === hz1 + eo);
    // 腰檐必须铺满（不能只铺外圈环）：环与下方斗拱无面相邻关系，会整圈浮空。
    a.set(x, eaveY, z, ring ? PAL.roofSlateL : PAL.roofSlate);
    a.set(x, eaveY + 1, z, ((x & 1) ? PAL.roofSlate : PAL.roofSlateG));
  }
  // 上檐
  const dx0 = hx0 + 4, dx1 = hx1 - 4, dz0 = hz0 + 4, dz1 = hz1 - 4;
  const fr2 = ARCH.colonnade(a, dx0, dz0, dx1, dz1, eaveY + 2, 6, Math.max(3, bays - 2), PAL.zhuBright, 2);
  ARCH.wall(a, dx0, dz0, dx1, dz1, eaveY + 2, 6, fr2.cols, {
    wallC: PAL.plasterWarm, winC: PAL.timberDark, frameC: PAL.zhu, xs: fr2.xs, doorBay: -1,
  });
  ARCH.dougong(a, fr2.cols, eaveY + 7, PAL.zhuBright, PAL.zhu);
  const topY = ARCH.roofHip(a, dx0, dz0, dx1, dz1, eaveY + 10, {
    layers: 9, ridgeRatio: 0.6, overhang: 5,
    main: tone[0], groove: tone[2], lip: tone[1],
    trim: R >= 4 ? PAL.gold : null, ridgeC: PAL.roofDark, finial: PAL.gold,
  });

  // 东西廊庑（长条低矮，围出前庭）
  for (const sx of [ax0 + 5, ax1 - 5]) {
    const lz0 = midZ + 8, lz1 = az0 + 6 + hd + 6;
    if (lz1 - lz0 < 8) continue;
    const ly = ARCH.platform(a, sx - 3, lz0, sx + 3, lz1, ab, 1, { steps: false });
    const lf = ARCH.colonnade(a, sx - 3, lz0, sx + 3, lz1, ly, 6, 1, PAL.zhu, 1);
    ARCH.wall(a, sx - 3, lz0, sx + 3, lz1, ly, 6, lf.cols, { wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: lf.xs, doorBay: -1 });
    ARCH.roofGable(a, sx - 3, lz0, sx + 3, lz1, ly + 7, { layers: 4, overhang: 2, main: tone[0], groove: tone[2], lip: tone[1] });
  }

  // 后堂（大堂之后，较小）
  const bz1 = az1 - 6, bz0 = bz1 - 10;
  if (bz0 > hz1 + 6) {
    const bw = 14, by = ARCH.platform(a, hcx - bw, bz0 - 2, hcx + bw, bz1 + 2, ab, 2, { steps: true, stepW: 5 });
    const bf = ARCH.colonnade(a, hcx - bw, bz0, hcx + bw, bz1, by, 8, 3, PAL.zhu, 1);
    ARCH.wall(a, hcx - bw, bz0, hcx + bw, bz1, by, 8, bf.cols, { wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: bf.xs, doorBay: 1 });
    ARCH.roofGable(a, hcx - bw, bz0, hcx + bw, bz1, by + 9, { layers: 6, overhang: 3, main: tone[0], groove: tone[2], lip: tone[1] });
  }

  // 占位
  const topCity = Math.ceil(Math.max(topY, wallTop) / S);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (i < 0) continue;
    ctx.fields.topH[i] = topCity; ctx.fields.topColor[i] = tone[0];
  }
  return topY;
};

// ---------------------------------------------------------------- 建筑层浮空审计
// 6 邻域连通性：从"坐落在城市实体之上"的建筑体素泛洪，未被泛洪到的即为浮空。
// 这是城市层泛洪审计覆盖不到的一层（建筑层是独立网格）。
CHANGAN.auditArchFloating = function (ctx, arch) {
  const S = 2;
  const key = (x, y, z) => ((x + 4096) * 8192 + (z + 4096)) * 512 + y;
  const seen = new Set();
  const stack = [];
  for (const k of arch.map.keys()) {
    const y = k % 512, t = (k - y) / 512, z = (t % 8192) - 4096, x = (t - (t % 8192)) / 8192 - 4096;
    if (y > 0 && arch.has(x, y - 1, z)) continue;      // 下方还有建筑体素，不是种子
    // 建筑体素 y 占据城市 [y/S, (y+1)/S)，其下承托的是城市体素 floor(y/S) - 1 与自身所在层
    const cy = Math.floor(y / S), cx = Math.floor(x / S), cz = Math.floor(z / S);
    if (y === 0 || ctx.store.get(cx, cy, cz)) { seen.add(key(x, y, z)); stack.push(x, y, z); }
  }
  const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const seedCount = seen.size;
  while (stack.length) {
    const z = stack.pop(), y = stack.pop(), x = stack.pop();
    for (const [dx, dy, dz] of D) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!arch.has(nx, ny, nz)) continue;
      const kk = key(nx, ny, nz);
      if (seen.has(kk)) continue;
      seen.add(kk); stack.push(nx, ny, nz);
    }
  }
  const floating = arch.count - seen.size;
  const samples = [];
  let ymin = 1e9, ymax = -1e9;
  const colTally = new Map();
  if (floating) {
    for (const [k, c] of arch.map) {
      if (seen.has(k)) continue;
      const y = k % 512, t = (k - y) / 512, z = (t % 8192) - 4096, x = (t - (t % 8192)) / 8192 - 4096;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      colTally.set(c, (colTally.get(c) || 0) + 1);
      if (samples.length < 5) samples.push(`${x / S},${y / S},${z / S}`);
    }
  }
  const topCols = [...colTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([c, n]) => `${(CHANGAN.PAL_DEF[c - 1] || ['?'])[0]}:${n}`).join(' ');
  return {
    pass: floating === 0,
    detail: floating
      ? `建筑层浮空 ${floating} 体素（种子 ${seedCount}）y∈[${ymin / S},${ymax / S}] 主要色 ${topCols} 如 ${samples.join('|')}`
      : `建筑层 ${arch.count} 体素全部落地连通`,
  };
};

// ---------------------------------------------------------------- 坊内院落（建筑层 2×）：E1~E3 居住亚型
// 城市层只负责地坪与树井（archCompoundGround），建筑全部由本函数写进建筑层 —— 单一权威。
// 屋面色族池：按等级分三档，每档 5 个**真正不同色相**的族
// （评审实测："民居屋面只有青灰和黛两种近似灰，按坊配色等于空转"）
const T_GREY = [PAL.roofGrey, PAL.roofLight, PAL.roofGroove];
const T_SLATE = [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG];
const T_CLAY = [PAL.roofClay, PAL.roofClayL, PAL.roofClayG];
const T_OCHRE = [PAL.roofOchre, PAL.roofOchreL, PAL.roofOchreG];
const T_BROWN = [PAL.roofBrown, PAL.roofBrownL, PAL.roofBrownG];
const T_GREEN = [PAL.roofGreen, PAL.roofGreenL, PAL.roofGreenG];
const T_BLUE = [PAL.roofBlue, PAL.roofBlueL, PAL.roofBlueG];
const TONE_BY_LEVEL = [
  [T_GREY, T_SLATE, T_CLAY, T_OCHRE, T_CLAY],      // 民居：青灰 / 黛 / 灰陶 / 赭石
  [T_SLATE, T_CLAY, T_OCHRE, T_GREY, T_BROWN],     // 中等宅院
  [T_GREEN, T_SLATE, T_GREEN, T_SLATE, T_CLAY],    // 大宅府第：琉璃绿（蓝留给官署品级色，避免坊区出现突兀亮蓝）
];

// 院落地面（城市层）：浅夯土满铺 + 中轴砖道
CHANGAN.archCompoundGround = function (ctx, x0, z0, w, d, base) {
  const { store } = ctx;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (i < 0 || ctx.fields.road[i] || ctx.fields.water[i]) continue;
    // 地坪加浅纹理：纯色平地被评审判为"正射贴图"最大来源
    const t = (x * 7 + z * 5 + x0) % 9;
    store.set(x, base, z, t === 0 ? PAL.brickPave : (t < 4 ? PAL.loessLight : PAL.loess));
  }
  const cx = (x0 + x1) >> 1;
  for (let z = z0; z <= z1; z++) store.set(cx, base, z, PAL.brickPave);
  for (let x = x0 + 1; x <= x1 - 1; x++) store.set(x, base, z0 + Math.floor(d * 0.55), PAL.brickPave);
};

CHANGAN.pickCompoundVariant = function (level, rng) {
  const r = rng();
  if (level === 0) return r < 0.5 ? 'small' : (r < 0.82 ? 'winged' : 'shed');
  if (level === 1) return r < 0.28 ? 'winged' : (r < 0.56 ? 'twoCourt' : (r < 0.82 ? 'tower' : 'garden'));
  return r < 0.32 ? 'twoCourt' : (r < 0.62 ? 'tower' : (r < 0.86 ? 'garden' : 'winged'));
};

CHANGAN.buildArchCompound = function (ctx, x0, z0, w, d, base, level, rng, facing, plan) {
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;
  const S = 2;
  const ax0 = x0 * S, az0 = z0 * S, ax1 = (x0 + w) * S - 1, az1 = (z0 + d) * S - 1;
  const ab = base * S;
  const courses = level === 0 ? 2 : 3;
  const g = ARCH.enclosure(a, ax0, az0, ax1, az1, ab, facing || 'S', { courses, gateW: 3 });
  const wallTop = ab + courses + 1;
  // 坊级风格：色调由坊位决定（相邻坊不同），高度基调 ±1 —— 破同质化的第一手段
  const st = (plan && plan.style) || { tone: 0, hBias: 0, eaveBias: 0 };
  const tonePool = (level >= 2 && Math.min(w, d) >= 18) ? TONE_BY_LEVEL[2] : TONE_BY_LEVEL[Math.min(1, level)];
  // 坊内微差：同坊 35% 的院落用相邻色族 —— 避免"整坊一块纯色"像彩色拼贴（评审判"彩色复制粘贴"）
  let tone = tonePool[(st.tone + (rng() < 0.35 ? 1 : 0)) % tonePool.length];
  // 逐栋明度抖动：35% 的院落屋面换同族深调，破"整片同色平板"（评审判"平板正射贴图感"）
  const DEEP = {};
  DEEP[PAL.roofGrey] = PAL.roofGreyDeep; DEEP[PAL.roofSlate] = PAL.roofSlateDeep;
  DEEP[PAL.roofClay] = PAL.roofClayDeep; DEEP[PAL.roofOchre] = PAL.roofOchreDeep;
  if (rng() < 0.35 && DEEP[tone[0]]) tone = [DEEP[tone[0]], tone[1], tone[2]];
  // 亚型分化：打破"千篇一律的合院"（同质化对策 §6）
  const variant = (plan && plan.variant) || CHANGAN.pickCompoundVariant(level, rng);
  const wallVar = rng() < 0.5 ? 0 : 1;   // 屋身高度 ±1
  const roofOpt = { main: tone[0], groove: tone[2], lip: tone[1], overhang: (level === 0 ? 2 : 3) + (st.eaveBias === 2 ? 1 : 0), finial: PAL.roofDark };

  // 正房（坐北朝南，占院北侧）
  const mainD = Math.max(8, Math.min(20, Math.round(d * 0.42) * S));
  const hx0 = ax0 + 3, hx1 = ax1 - 3, hz0 = az0 + 3, hz1 = Math.min(az1 - 6, az0 + 3 + mainD);
  let topY = wallTop;
  if (hx1 - hx0 >= 10 && hz1 - hz0 >= 6) {
    const bays = Math.max(3, Math.min(9, Math.round((hx1 - hx0) / 8)));
    // 屋身高度：坊基调 + 逐栋抖动 —— 评审判"高度几乎没变"
    const wallH = Math.max(3, (level === 0 ? 4 : 6) + st.hBias + (rng() < 0.35 ? 1 : 0));
    let y = ARCH.platform(a, hx0 - 2, hz0 - 2, hx1 + 2, hz1 + 2, ab, level === 0 ? 2 : 3, { steps: true, stepW: 4 });
    const fr = ARCH.colonnade(a, hx0, hz0, hx1, hz1, y, wallH, bays, level >= 2 ? PAL.zhuBright : PAL.zhu, level >= 2 ? 2 : 1);
    ARCH.wall(a, hx0 + 1, hz0 + 1, hx1 - 1, hz1 - 1, y, wallH, fr.cols, {
      wallC: rng() < 0.4 ? PAL.plasterWarm : PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu,
      xs: fr.xs, doorBay: Math.floor(bays / 2),
    });
    ARCH.dougong(a, fr.cols, y + wallH - 1, PAL.zhuBright, PAL.zhu);
    const roofY = y + wallH + 2;
    if (variant === 'tower' && hx1 - hx0 >= 18 && hz1 - hz0 >= 12) {
      // 楼居：**二层直接起在一层额枋之上**（不先盖屋顶），中间只做一圈腰檐。
      // 旧写法是"先盖一层屋顶、再把二层放在屋顶上方"，二层与屋顶之间没有落地支承 ——
      // 这正是用户看到的"建筑断成两半、上面一半飘在空中"。
      for (let x = hx0 - 3; x <= hx1 + 3; x++) for (let z = hz0 - 3; z <= hz1 + 3; z++) {
        const ring = (x === hx0 - 3 || x === hx1 + 3 || z === hz0 - 3 || z === hz1 + 3);
        a.set(x, roofY, z, ring ? tone[1] : tone[0]);
        a.set(x, roofY + 1, z, tone[2]);
      }
      const inset = 4;
      const tw0 = hx0 + inset, tw1 = hx1 - inset, td0 = hz0 + inset, td1 = hz1 - inset;
      const tH = 7;
      const tf = ARCH.colonnade(a, tw0, td0, tw1, td1, roofY + 2, tH, 3, PAL.zhuBright, 2);
      ARCH.wall(a, tw0, td0, tw1, td1, roofY + 2, tH, tf.cols, {
        wallC: PAL.plasterWarm, winC: PAL.timberDark, frameC: PAL.zhu, xs: tf.xs, doorBay: -1,
      });
      ARCH.dougong(a, tf.cols, roofY + 2 + tH - 1, PAL.zhuBright, PAL.zhu);
      topY = ARCH.roofHip(a, tw0, td0, tw1, td1, roofY + 2 + tH + 2,
        Object.assign({ layers: 8, ridgeRatio: 0.6 }, roofOpt));
    } else {
      // 屋架形式也拉开：部分民居用歇山（庑殿坡）而非悬山，屋面层数逐栋随机
      const useHip = level >= 2 || (level >= 1 && rng() < 0.4) || (level === 0 && rng() < 0.2);
      topY = useHip
        ? ARCH.roofHip(a, hx0, hz0, hx1, hz1, roofY, Object.assign({ layers: 7 + Math.round(rng() * 3), ridgeRatio: 0.55 + rng() * 0.15 }, roofOpt))
        : ARCH.roofGable(a, hx0, hz0, hx1, hz1, roofY, Object.assign({ layers: 5 + Math.round(rng() * 2) }, roofOpt));
    }
  }

  // 厢房（东西各一，体量低于正房）—— small 亚型不设厢房
  const wingW = 7;
  if (variant !== 'small' && variant !== 'shed' && az1 - hz1 >= 12) {
    const wz0 = hz1 + 4, wz1 = az1 - 4;
    const buildWing = (side) => {
      const wx0 = side === 'W' ? ax0 + 3 : ax1 - 3 - wingW;
      const wx1 = wx0 + wingW;
      if (wz1 - wz0 < 6) return;
      const wy = ARCH.platform(a, wx0 - 1, wz0 - 1, wx1 + 1, wz1 + 1, ab, 1, { steps: false });
      const wf = ARCH.colonnade(a, wx0, wz0, wx1, wz1, wy, 4 + wallVar, 2, PAL.zhu, 1);
      ARCH.wall(a, wx0, wz0, wx1, wz1, wy, 4 + wallVar, wf.cols, { wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: wf.xs, doorBay: -1 });
      ARCH.roofGable(a, wx0, wz0, wx1, wz1, wy + 5 + wallVar, { layers: 5, overhang: 2, main: tone[0], groove: tone[2], lip: tone[1] });
    };
    const both = variant === 'twoCourt' || (plan && plan.wingMode === 'both');
    if (both) { buildWing('W'); buildWing('E'); }
    else buildWing(plan && plan.wingMode === 'E' ? 'E' : 'W');
  }

  // 二进院：在院中加一道腰墙与内门，把院子分成前庭后院
  if (variant === 'twoCourt' && az1 - az0 >= 26) {
    const wz = Math.round(az0 + (az1 - az0) * 0.55);
    const wgate = 4;
    for (let x = ax0 + 1; x <= ax1 - 1; x++) {
      if (Math.abs(x - ((ax0 + ax1) >> 1)) <= wgate) continue;
      a.set(x, ab + 1, wz, PAL.rammed); a.set(x, ab + 2, wz, PAL.rammedLight); a.set(x, ab + 3, wz, PAL.roofDark);
    }
    // 注意括号：`>>` 优先级低于 `-`，写成 (ax0+ax1) >> 1 - wgate - 1 会被解析成"右移负数位"，
    // 门柱被扔到城里任意位置并悬空 —— 这就是 2026-09-08 用户实测"建筑断成两半、上面一半飘着"的真凶。
    const wcx = (ax0 + ax1) >> 1;
    for (const px of [wcx - wgate - 1, wcx + wgate + 1]) for (let y = 1; y <= 4; y++) a.set(px, ab + y, wz, PAL.zhu);
  }

  // 楼居二层已并入正房构造（见上），此处不再二次叠加

  // 仓院：大跨敞棚（无墙，柱列 + 大屋顶）+ 场院
  if (variant === 'shed') {
    const sw0 = ax0 + 4, sw1 = ax1 - 4, sd0 = az0 + 4, sd1 = az0 + Math.min(20, Math.round(d * 0.5) * S);
    if (sw1 - sw0 >= 10 && sd1 - sd0 >= 6) {
      const sy = ARCH.platform(a, sw0 - 1, sd0 - 1, sw1 + 1, sd1 + 1, ab, 1, { steps: false });
      const sf = ARCH.colonnade(a, sw0, sd0, sw1, sd1, sy, 7, 4, PAL.timberDark, 1);
      ARCH.dougong(a, sf.cols, sy + 6, PAL.timber, PAL.timberDark);
      topY = ARCH.roofGable(a, sw0, sd0, sw1, sd1, sy + 8, { layers: 7, overhang: 3, main: PAL.roofBrown, groove: PAL.roofBrownG, lip: PAL.roofBrownL });
    }
  }

  // 园宅：院中置亭（攒尖），留出园地
  if (variant === 'garden') {
    const px = ax0 + Math.round(w * 0.6), pz = az1 - Math.round(d * 0.28);
    const pr = 5;
    const py = ARCH.platform(a, px - pr, pz - pr, px + pr, pz + pr, ab, 1, { steps: false });
    const pf = ARCH.colonnade(a, px - pr + 1, pz - pr + 1, px + pr - 1, pz + pr - 1, py, 5, 2, PAL.zhu, 1);
    let ty2 = py + 5;
    const hh = pr - 1;
    for (let L = 0; L < hh; L++) {
      const st = L;
      // 攒尖顶必须逐层铺满：只铺一圈环时，上一层环与下一层环没有面相邻关系，会整层浮空。
      for (let x = px - pr + 1 + st; x <= px + pr - 1 - st; x++) for (let z = pz - pr + 1 + st; z <= pz + pr - 1 - st; z++) {
        const ring = (x === px - pr + 1 + st || x === px + pr - 1 - st || z === pz - pr + 1 + st || z === pz + pr - 1 - st);
        a.set(x, ty2 + L, z, ring ? (L === 0 ? PAL.roofGreenL : ((x & 1) ? PAL.roofGreen : PAL.roofGreenG)) : PAL.roofGreenG);
      }
    }
    a.set(px, ty2 + hh, pz, PAL.gold); a.set(px, ty2 + hh + 1, pz, PAL.gold);
  }

  // 门屋（跨在院门上的小屋）—— small 亚型不设
  if (variant !== 'small' && g.gAxis === 'NS' && g.gz === az1) {
    const gw = 7;
    const gy = ARCH.platform(a, g.gx - gw, az1 - 5, g.gx + gw, az1 + 1, ab, 1, { steps: false });
    const gf = ARCH.colonnade(a, g.gx - gw, az1 - 5, g.gx + gw, az1, gy, 4, 3, PAL.zhuBright, 1);
    // 门屋也要有柱头斗拱层（P0 判"近景门殿/穿堂柱顶到檐口同平面贴附"）
    ARCH.dougong(a, gf.cols, gy + 3, PAL.zhuBright, PAL.zhu);
    ARCH.roofGable(a, g.gx - gw, az1 - 5, g.gx + gw, az1, gy + 6, { layers: 5, overhang: 2, main: tone[0], groove: tone[2], lip: tone[1] });
    topY = Math.max(topY, gy + 10);
  }

  // 占位戳进城市字段：碰撞 / 小地图 / 远景 LOD 与建筑层一致
  const topCity = Math.ceil(topY / S);
  // 建筑坐标表（供 tools/solo.js 单体隔离验收使用）
  ctx.archLog = ctx.archLog || [];
  ctx.archLog.push({ x: x0, z: z0, w, d, top: topCity, lvl: level, var: variant });
  for (let x = x0; x <= x0 + w - 1; x++) for (let z = z0; z <= z0 + d - 1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (i < 0) continue;
    ctx.fields.topH[i] = topCity;
    ctx.fields.topColor[i] = tone[0];
  }
  return topY;
};

// ---------------------------------------------------------------- 市肆（建筑层）：临街铺面 / 仓储棚
CHANGAN.buildArchShop = function (ctx, x0, z0, w, d, base, trade, east, rng, facing) {
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;
  const S = 2;
  const ax0 = x0 * S, az0 = z0 * S, ax1 = (x0 + w) * S - 1, az1 = (z0 + d) * S - 1;
  const ab = base * S;
  if (ax1 - ax0 < 6 || az1 - az0 < 6) return;
  const tone = east ? [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG] : [PAL.roofClay, PAL.roofClayL, PAL.roofClayG];
  const y = ARCH.platform(a, ax0, az0, ax1, az1, ab, 1, { steps: false });
  const isShed = !east && rng() < 0.3;
  const shopH = 6 + (east ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
  const bays = Math.max(2, Math.min(5, Math.round((ax1 - ax0) / 9)));
  const fr = ARCH.colonnade(a, ax0 + 1, az0 + 1, ax1 - 1, az1 - 1, y, shopH, bays, PAL.zhu, 1);
  if (!isShed) {
    ARCH.wall(a, ax0 + 1, az0 + 1, ax1 - 1, az1 - 1, y, shopH, fr.cols, {
      wallC: rng() < 0.5 ? PAL.plaster : PAL.plasterWarm, winC: PAL.timberDark, frameC: PAL.zhu,
      xs: fr.xs, doorBay: Math.floor(bays / 2),
    });
    ARCH.dougong(a, fr.cols, y + shopH - 1, PAL.zhu, PAL.timberDark);
  }
  const rm = isShed ? [PAL.roofBrown, PAL.roofBrownL, PAL.roofBrownG] : tone;
  const topY = ARCH.roofGable(a, ax0 + 1, az0 + 1, ax1 - 1, az1 - 1, y + shopH + 1, {
    layers: 5 + Math.round(rng() * 2), overhang: isShed ? 3 : 2,
    main: rm[0], groove: rm[2], lip: rm[1],
  });
  const px = (ax0 + ax1) >> 1;
  const pz = (facing === 'N') ? az0 + 1 : az1 - 1;
  const flagC = east ? PAL.flagBlue : PAL.flagRed;
  for (let k = 0; k < 5; k++) a.set(px, y + shopH + 2 + k, pz, PAL.timberDark);
  a.set(px, y + shopH + 6, pz, flagC);
  a.set(px + 1, y + shopH + 6, pz, flagC);
  a.set(px + 1, y + shopH + 5, pz, flagC);
  const topCity = Math.ceil(topY / S);
  // 建筑坐标表（供 tools/solo.js 单体隔离验收使用）
  ctx.archLog = ctx.archLog || [];
  ctx.archLog.push({ x: x0, z: z0, w, d, top: topCity, lvl: 0, var: 'shop' });
  for (let x = x0; x <= x0 + w - 1; x++) for (let z = z0; z <= z0 + d - 1; z++) {
    const i = CHANGAN.fieldIndex(x, z); if (i < 0) continue;
    ctx.fields.topH[i] = topCity; ctx.fields.topColor[i] = rm[0];
  }
  ctx.counters.shops++;
  return topY;
};

// ---------------------------------------------------------------- 寺观（建筑层）：山门 + 重檐大殿 + 配殿
CHANGAN.buildArchTemple = function (ctx, x0, z0, x1, z1, base, opts) {
  opts = opts || {};
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;
  const S = 2;
  const ax0 = x0 * S, az0 = z0 * S, ax1 = (x1 + 1) * S - 1, az1 = (z1 + 1) * S - 1;
  const ab = base * S;
  if (ax1 - ax0 < 24 || az1 - az0 < 24) return;
  const big = !!opts.big;
  const tone = big ? [PAL.roofGreen, PAL.roofGreenL, PAL.roofGreenG] : [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG];
  ARCH.enclosure(a, ax0, az0, ax1, az1, ab, 'S', { courses: 3, gateW: 4 });
  const cx = (ax0 + ax1) >> 1;

  const gw = Math.min(14, (ax1 - ax0) >> 2);
  const gy = ARCH.platform(a, cx - gw, az1 - 12, cx + gw, az1 - 2, ab, 2, { steps: true, stepW: 5 });
  const gf = ARCH.colonnade(a, cx - gw, az1 - 12, cx + gw, az1 - 2, gy, 8, 3, PAL.zhuBright, 1);
  ARCH.wall(a, cx - gw, az1 - 12, cx + gw, az1 - 2, gy, 8, gf.cols, {
    wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: gf.xs, doorBay: 1,
  });
  ARCH.dougong(a, gf.cols, gy + 7, PAL.zhuBright, PAL.zhu);
  ARCH.roofGable(a, cx - gw, az1 - 12, cx + gw, az1 - 2, gy + 10, {
    layers: 6, overhang: 3, main: tone[0], groove: tone[2], lip: tone[1],
  });

  const hw = Math.min(20, (ax1 - ax0) >> 2), hd = Math.max(14, Math.min(20, (az1 - az0) >> 2));
  const hz0 = az0 + 10, hz1 = hz0 + hd;
  const y = ARCH.platform(a, cx - hw, hz0, cx + hw, hz1, ab, 3, { steps: true, stepW: 6 });
  const hf = ARCH.colonnade(a, cx - hw, hz0, cx + hw, hz1, y, 12, big ? 5 : 3, PAL.zhuBright, 2);
  ARCH.wall(a, cx - hw, hz0, cx + hw, hz1, y, 12, hf.cols, {
    wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: hf.xs, doorBay: big ? 2 : 1,
  });
  ARCH.dougong(a, hf.cols, y + 11, PAL.zhuBright, PAL.zhu);
  const eo = 4, eaveY = y + 14;
  for (let x = cx - hw - eo; x <= cx + hw + eo; x++) for (let z = hz0 - eo; z <= hz1 + eo; z++) {
    const ring = (x === cx - hw - eo || x === cx + hw + eo || z === hz0 - eo || z === hz1 + eo);
    a.set(x, eaveY, z, ring ? tone[1] : tone[0]);
    a.set(x, eaveY + 1, z, tone[2]);
  }
  const dx0 = cx - hw + 3, dx1 = cx + hw - 3, dz0 = hz0 + 3, dz1 = hz1 - 3;
  const hf2 = ARCH.colonnade(a, dx0, dz0, dx1, dz1, eaveY + 2, 6, 3, PAL.zhuBright, 2);
  ARCH.wall(a, dx0, dz0, dx1, dz1, eaveY + 2, 6, hf2.cols, {
    wallC: PAL.plasterWarm, winC: PAL.timberDark, frameC: PAL.zhu, xs: hf2.xs, doorBay: -1,
  });
  ARCH.dougong(a, hf2.cols, eaveY + 7, PAL.zhuBright, PAL.zhu);
  const topY = ARCH.roofHip(a, dx0, dz0, dx1, dz1, eaveY + 10, {
    layers: 9, ridgeRatio: 0.6, overhang: 5, main: tone[0], groove: tone[2], lip: tone[1],
    trim: big ? PAL.gold : null, ridgeC: PAL.roofDark, finial: big ? PAL.gold : PAL.roofDark,
  });

  for (const sx of [ax0 + 6, ax1 - 6]) {
    const wz0 = hz0 + 2, wz1 = hz1 - 2;
    if (wz1 - wz0 < 6) continue;
    const wy = ARCH.platform(a, sx - 5, wz0, sx + 5, wz1, ab, 1, { steps: false });
    const wf = ARCH.colonnade(a, sx - 5, wz0, sx + 5, wz1, wy, 7, 2, PAL.zhu, 1);
    ARCH.wall(a, sx - 5, wz0, sx + 5, wz1, wy, 7, wf.cols, {
      wallC: PAL.plaster, winC: PAL.timberDark, frameC: PAL.zhu, xs: wf.xs, doorBay: -1,
    });
    ARCH.roofGable(a, sx - 5, wz0, sx + 5, wz1, wy + 8, {
      layers: 5, overhang: 2, main: tone[0], groove: tone[2], lip: tone[1],
    });
  }

  const topCity = Math.ceil(topY / S);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z); if (i < 0) continue;
    ctx.fields.topH[i] = topCity; ctx.fields.topColor[i] = tone[0];
  }
  ctx.counters.temples++;
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
    a.set(x, eaveY, z, ring ? PAL.gold : PAL.roofGreen);
    a.set(x, eaveY + 1, z, ((x & 1) ? PAL.roofGreen : PAL.roofGreenG));
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
