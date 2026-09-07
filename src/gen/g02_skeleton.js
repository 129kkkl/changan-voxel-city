// g02_skeleton.js — S1 六坡地形 / S2 礼制骨架 / S3 城墙城门 / S5 街道工程（街面、排水沟、跨渠桥位）
'use strict';

// ---------------------------------------------------------------- 字段层工具
CHANGAN.fieldIndex = function (x, z) {
  const W = CHANGAN.CFG.WORLD;
  return (z - W.z0) * (W.x1 - W.x0 + 1) + (x - W.x0);
};
CHANGAN.makeFields = function () {
  const W = CHANGAN.CFG.WORLD;
  const n = (W.x1 - W.x0 + 1) * (W.z1 - W.z0 + 1);
  return {
    groundH: new Int16Array(n).fill(4),   // 地表（含街道）高度
    topH: new Int16Array(n).fill(4),      // 柱体最高体素（含建筑）
    topColor: new Uint8Array(n),          // 顶面颜色（小地图/涂抹）
    road: new Uint8Array(n),              // 街级 0 无 / 1 御道 / 2 横街 / 3 门街 / 4 六街 / 5 顺城 / 6 坊内 / 7 巷曲
    wardId: new Int16Array(n),            // 坊位 id（0 非坊区）
    water: new Uint8Array(n),             // 0 无 / 1 渠 / 2 池 / 3 渭水
    canopy: new Uint8Array(n),            // 树冠占位（防重）
  };
};

// ---------------------------------------------------------------- S1 地形：宏观高程（六坡+龙首原+乐游原+郊野）
function macroHeight(x, z, CFG) {
  let h = CFG.Y.BASE;
  // 六坡：六道东西向黄土梁（宇文恺乾卦六爻；九二宫城、九三皇城、九五靖善/崇业）
  const ridges = [[-286, 3, 46], [-166, 3, 42], [-60, 1.5, 36], [20, 1.5, 34], [96, 2.5, 34], [200, 1.5, 36]];
  for (const [zc, amp, sig] of ridges) {
    const d = (z - zc) / sig;
    h += amp * Math.exp(-d * d);
  }
  // 龙首原：东北高起（大明宫、宫城一带）
  {
    const dx = (x - 200) / 90, dz = (z + 300) / 80;
    h += 5 * Math.exp(-(dx * dx + dz * dz));
    if (z < -230) h += 1.5; // 北高南低大势
  }
  // 乐游原：城东南公共高地
  {
    const dx = (x - 285) / 75, dz = (z - 165) / 70;
    h += 4 * Math.exp(-(dx * dx + dz * dz));
  }
  return h;
}
function outsideHeight(x, z, seed, CFG) {
  // 城外郊野：渭水低滩、南郊平野、终南山剪影
  if (z < -354) return 1;                                   // 渭水河床
  if (z < -344) return 2 + (z + 354) * 0.2;                 // 河滩缓坡
  if (z > 348) {                                            // 终南山（箱庭边缘剪影，只表壳）
    const t = z - 348;
    return 3 + t * 2.2 + CHANGAN.fbm(seed, x * 0.02, z * 0.02, 3, 2, 0.5) * 8;
  }
  return 3 + CHANGAN.fbm(seed + 7, x * 0.03, z * 0.03, 2, 2, 0.5) * 1.5;
}

CHANGAN.stageTerrain = function (ctx) {
  const { CFG, store, fields, seed } = ctx;
  const W = CFG.WORLD;
  const Wd = W.x1 - W.x0 + 1;
  markStreetMask(ctx);
  const map = store.map;
  for (let x = W.x0; x <= W.x1; x++) {
    const xk = (x + 512) << 20;
    for (let z = W.z0; z <= W.z1; z++) {
      const i = (z - W.z0) * Wd + (x - W.x0);
      const inCity = x >= CFG.CITY.x0 - 8 && x <= CFG.CITY.x1 + 8 && z >= CFG.CITY.z0 - 8 && z <= CFG.CITY.z1 + 8;
      let y;
      if (inCity) {
        y = macroHeight(x, z, CFG);
        if (!fields.road[i]) y += (CHANGAN.fbm(seed + 3, x * 0.045, z * 0.045, 3, 2, 0.55) - 0.5) * 2;
      } else {
        y = outsideHeight(x, z, seed, CFG);
      }
      y = Math.max(1, Math.round(y));
      fields.groundH[i] = y;
      fields.topH[i] = y;
      let c;
      if (z > 348) {
        c = PAL.mountainFar;
        const yBase = Math.max(1, y - 6);
        for (let yy = yBase; yy < y; yy++) {
          map.set(xk | ((z + 512) << 9) | yy, c);
        }
      }
      else if (z < -344) c = PAL.riverSand;
      else if (!inCity) c = CHANGAN.fbm(seed + 11, x * 0.05, z * 0.05, 2, 2, 0.5) > 0.55 ? PAL.grass : PAL.fieldEarth;
      else c = PAL.loess;
      map.set(xk | ((z + 512) << 9) | y, c);
      fields.topColor[i] = c;
    }
    if ((x & 63) === 0) ctx.progress('terrain', (x - W.x0) / (W.x1 - W.x0));
  }
};

// ---------------------------------------------------------------- S2 礼制骨架：街网掩膜与街级
function markStreetMask(ctx) {
  const { CFG, fields } = ctx;
  const setRect = (x0, z0, x1, z1, lv) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (fields.road[i] < lv) fields.road[i] = lv; // 宽街优先
    }
  };
  const cx0 = CFG.CITY.x0, cx1 = CFG.CITY.x1;
  // 朱雀大街（御道）：明德门 → 承天门
  setRect(CFG.AXIS_X[0], CFG.CITY.z0, CFG.AXIS_X[1], CFG.CITY.z1, 1);
  // 宫皇横街（大朝广场）
  setRect(cx0, CFG.HENGJIE.z0, cx1, CFG.HENGJIE.z1, 2);
  // 皇城南横街
  setRect(cx0, CFG.HUANG_NAN_JIE.z0, cx1, CFG.HUANG_NAN_JIE.z1, 2);
  // 九条横街（排间）：r0|r1 … r7|r8
  const gaps = [[-53, -49], [-11, -7], [31, 35], [73, 77], [115, 119], [157, 161], [199, 203], [241, 245]];
  for (let g = 0; g < gaps.length; g++) {
    const [z0, z1] = gaps[g];
    const lv = (g === 1 || g === 3 || g === 6) ? 3 : 4; // 通化/春明/延兴门街升一级
    setRect(cx0, z0, cx1, z1, lv);
  }
  // 十一条纵街（列间）+ 顺城街
  const colGapsE = [[49, 53], [98, 102], [160, 164], [223, 227], [285, 289]];
  for (const [x0, x1] of colGapsE) {
    setRect(x0, -90, x1, 282, 4);
    setRect(-x1, -90, -x0, 282, 4); // 街西镜像
  }
  setRect(348, CFG.CITY.z0, 351, CFG.CITY.z1, 5); setRect(-351, CFG.CITY.z0, -348, CFG.CITY.z1, 5);
  setRect(cx0, 283, cx1, 287, 5);
  setRect(cx0, CFG.CITY.z0, cx1, CFG.CITY.z0 + 2, 5);
  // 两市所占之横街（r4|r5 间 z115..119）复原为市内：清除两市 footprint 内街级
  for (const m of [165, -222]) {
    for (let x = m; x <= m + 57; x++) for (let z = 78; z <= 156; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      fields.road[i] = 0;
    }
  }
}

// ---------------------------------------------------------------- S5 街道工程：街面铺装、排水沟、路拱色带
CHANGAN.stageStreets = function (ctx) {
  const { CFG, store, fields, seed } = ctx;
  const W = CFG.WORLD;
  const rng = CHANGAN.rngOf(seed, 'street');
  for (let x = W.x0; x <= W.x1; x++) {
    for (let z = W.z0; z <= W.z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      const lv = fields.road[i];
      if (!lv) continue;
      const y = fields.groundH[i];
      let c = PAL.loessLight; // 夯筑路面
      if (lv <= 2) c = (x + z) % 2 ? PAL.loessLight : PAL.rammedLight; // 御道/横街双色微差
      if (lv === 3) c = PAL.loessLight;
      store.set(x, y, z, c);
      fields.topColor[i] = c;
    }
  }
  // 排水沟：朱雀大街与横街两侧土明沟（沟床下沉 1，沟边苔草）
  const ditch = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (fields.water[i]) continue;
      const y = fields.groundH[i];
      store.del(x, y, z);
      store.set(x, y - 1, z, PAL.rammedDark);
      fields.topH[i] = y - 1; fields.topColor[i] = PAL.rammedDark;
      if ((x + z) % 5 === 0) { // 沟边苔草点缀
        const j = CHANGAN.fieldIndex(x + 1, z);
        if (fields.road[j] === 0 && !fields.water[j] && rng() < 0.5) {
          store.set(x + 1, fields.groundH[j] + 1, z, PAL.moss);
          fields.topH[j] = fields.groundH[j] + 1; fields.topColor[j] = PAL.moss;
        }
      }
    }
  };
  // 沟在御道走廊内（路缘外各 1 格），不占坊地
  ditch(CFG.AXIS_X[0] - 1, CFG.CITY.z0 + 4, CFG.AXIS_X[0] - 1, CFG.CITY.z1 - 4, 1);
  ditch(CFG.AXIS_X[1] + 1, CFG.CITY.z0 + 4, CFG.AXIS_X[1] + 1, CFG.CITY.z1 - 4, 1);
  // 横街沟（宫皇横街路缘）
  ditch(CFG.CITY.x0 + 4, CFG.HENGJIE.z0, CFG.CITY.x1 - 4, CFG.HENGJIE.z0, 1);
  ditch(CFG.CITY.x0 + 4, CFG.HENGJIE.z1, CFG.CITY.x1 - 4, CFG.HENGJIE.z1, 1);
};

// ---------------------------------------------------------------- S3 城墙与十二城门
// 城门登记表（外郭十二门 + 皇城/宫城/大明宫门）
CHANGAN.gateTable = function (CFG) {
  const zw = CFG.CITY.z1 + 1;              // 南墙带内缘
  const zn = CFG.CITY.z0 - 1;
  const xe = CFG.CITY.x1 + 1;
  const xw = CFG.CITY.x0 - 1;
  return [
    // 外郭十二门（audit: gateCount===12）
    { name: '明德门', x: -1, z: zw, axis: 'NS', doors: 5, level: 5, city: true },
    { name: '启夏门', x: 225, z: zw, axis: 'NS', doors: 3, level: 3, city: true },
    { name: '安化门', x: -225, z: zw, axis: 'NS', doors: 3, level: 3, city: true },
    { name: '通化门', x: xe, z: -9, axis: 'EW', doors: 3, level: 3, city: true },
    { name: '春明门', x: xe, z: 75, axis: 'EW', doors: 3, level: 3, city: true },
    { name: '延兴门', x: xe, z: 201, axis: 'EW', doors: 3, level: 3, city: true },
    { name: '开远门', x: xw, z: -9, axis: 'EW', doors: 3, level: 3, city: true },
    { name: '金光门', x: xw, z: 75, axis: 'EW', doors: 3, level: 3, city: true },
    { name: '延平门', x: xw, z: 201, axis: 'EW', doors: 3, level: 3, city: true },
    { name: '芳林门', x: -287, z: zn, axis: 'NS', doors: 3, level: 2, city: true },
    { name: '景耀门', x: -225, z: zn, axis: 'NS', doors: 3, level: 2, city: true },
    { name: '光化门', x: -162, z: zn, axis: 'NS', doors: 3, level: 2, city: true },
    // 皇城三门
    { name: '朱雀门', x: -1, z: CFG.IMPERIAL.z1, axis: 'NS', doors: 3, level: 4, city: false },
    { name: '安上门', x: CFG.IMPERIAL.x1, z: -158, axis: 'EW', doors: 3, level: 3, city: false },
    { name: '含光门', x: CFG.IMPERIAL.x0, z: -158, axis: 'EW', doors: 3, level: 3, city: false },
    // 宫城正门与北门
    { name: '承天门', x: -1, z: CFG.PALACE.z1, axis: 'NS', doors: 5, level: 6, city: false },
    { name: '玄武门', x: -1, z: CFG.PALACE.z0, axis: 'NS', doors: 3, level: 5, city: false },
    // 大明宫正门
    { name: '丹凤门', x: 214, z: CFG.DAMING.z1, axis: 'NS', doors: 5, level: 6, city: false },
  ];
};

CHANGAN.stageWalls = function (ctx) {
  const { CFG, store, fields } = ctx;
  const P = CHANGAN.PAL;
  const T = CFG.WALL;
  const H = CFG.Y.WALL_H;
  // ---- 外郭城墙（夯土版筑、仅城门墩包砖、顶部女墙，默认无马面）
  const bands = [
    [CFG.CITY.x0 - T, CFG.CITY.z1 + 1, CFG.CITY.x1 + T, CFG.CITY.z1 + T], // 南
    [CFG.CITY.x0 - T, CFG.CITY.z0 - T, CFG.CITY.x1 + T, CFG.CITY.z0 - 1], // 北
    [CFG.CITY.x1 + 1, CFG.CITY.z0 - T, CFG.CITY.x1 + T, CFG.CITY.z1 + T], // 东
    [CFG.CITY.x0 - T, CFG.CITY.z0 - T, CFG.CITY.x0 - 1, CFG.CITY.z1 + T], // 西
  ];
  for (let bi = 0; bi < bands.length; bi++) {
    const [x0, z0, x1, z1] = bands[bi];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      // 北墙中段（宫城北墙）与东北段（大明宫南接）由宫殿墙代替，不筑郭墙
      if (bi === 1 && ((x >= -102 && x <= 101) || (x >= 112 && x <= 316))) continue;
      const i = CHANGAN.fieldIndex(x, z);
      const g = fields.groundH[i];
      // 夯层错色：三层一循环，版筑感
      for (let y = 1; y <= H; y++) {
        const c = y % 3 === 0 ? P.rammedDark : (y % 2 ? P.rammed : P.rammedLight);
        store.set(x, g + y, z, c);
      }
      // 女墙（垛口相间）
      if ((x + z) % 2 === 0) store.set(x, g + H + 1, z, P.rammedDark);
      fields.topH[i] = g + H + 1;
      fields.topColor[i] = P.rammed;
    }
  }
  // ---- 宫城/皇城/大明宫围墙：由 stagePalaces 整平后重建（避免整平破坏墙基）
  // ---- 城门：外郭十二门先建；皇城/宫城/大明宫门随宫墙在 S7 建
  ctx.gates = CHANGAN.gateTable(CFG);
  for (const g of ctx.gates) if (g.city) buildCityGate(ctx, g);
  ctx.counters.gates += ctx.gates.filter(g => g.city).length;
};
// 宫墙环（供 stagePalaces 调用）：朱粉刷饰、女墙相间
function ring(r, h, c1, c2, ctx) {
  const { store, fields } = ctx;
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
    if (x !== r.x0 && x !== r.x1 && z !== r.z0 && z !== r.z1) continue;
    const i = CHANGAN.fieldIndex(x, z);
    const g = fields.groundH[i];
    for (let y = 1; y <= h; y++) store.set(x, g + y, z, y % 2 ? c1 : c2);
    if ((x + z) % 2 === 0) store.set(x, g + h + 1, z, c2);
    fields.topH[i] = g + h + 1; fields.topColor[i] = c1;
  }
}
CHANGAN.ringWall = ring;

function buildCityGate(ctx, g) {
  const { CFG, store, fields } = ctx;
  const P = CHANGAN.PAL;
  const T = CFG.WALL;
  // 门洞布置：以门中心为轴，doors 个门洞（宽2）+ 间隔墩（宽2）
  const openW = 2, pierW = 2;
  const total = g.doors * openW + (g.doors - 1) * pierW;
  const half = Math.floor(total / 2);
  const horiz = g.axis === 'NS'; // 门开在东西向墙带上（沿 x 展开）
  const wx0 = horiz ? g.x - half - 3 : g.x - 1;
  const wx1 = horiz ? g.x + half + 3 : g.x + T;
  const wz0 = horiz ? g.z - 1 : g.z - half - 3;
  const wz1 = horiz ? g.z + T : g.z + half + 3;
  // 墩台（包砖）：抬升墙带并加宽
  for (let x = wx0; x <= wx1; x++) for (let z = wz0; z <= wz1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    const gy = fields.groundH[i];
    for (let y = 1; y <= CFG.Y.WALL_H + 1; y++) store.set(x, gy + y, z, y % 2 ? P.brickPave : P.rammedDark);
    fields.topH[i] = gy + CFG.Y.WALL_H + 1; fields.topColor[i] = P.brickPave;
  }
  // 门洞：打通墩台全厚（留门枕石门框）
  let cursor = -half;
  g.openings = [];
  for (let d = 0; d < g.doors; d++) {
    const o0 = cursor, o1 = cursor + openW - 1;
    for (let o = o0; o <= o1; o++) {
      for (let d2 = 0; d2 < T; d2++) {
        const x = horiz ? g.x + o : g.x + d2;
        const z = horiz ? g.z + d2 : g.z + o;
        const i = CHANGAN.fieldIndex(x, z);
        const gy = fields.groundH[i];
        for (let y = 1; y <= CFG.Y.WALL_H + 1; y++) store.del(x, gy + y, z);
        store.set(x, gy, z, P.brickPave); // 门道石铺
        fields.topH[i] = gy; fields.topColor[i] = P.brickPave;
      }
    }
    g.openings.push(horiz ? [g.x + o0, g.z] : [g.x, g.z + o0]);
    cursor += openW + pierW;
  }
  // 城楼基座标记（S7 原型库在其上建重楼）
  g.towerBase = { x0: wx0, z0: wz0, x1: wx1, z1: wz1 };
  ctx.counters.gates0 = (ctx.counters.gates0 || 0) + 1;
}
