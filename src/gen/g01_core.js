// g01_core.js — 核心：环境无关的种子/噪声/体素存储 + 尺度口径表 + 预算 + 调色板 + 108坊表
// 本文件在浏览器 Worker 与 Node 冒烟测试中运行同一份源码，禁止依赖 DOM/THREE。
'use strict';

// ---------------------------------------------------------------- 环境与种子
const CHANGAN = {};
CHANGAN.version = 'M1-骨架';

// 全局种子派生：hash(seed, tag) → 32 位子种子；全程禁止裸 Math.random()
function hashSeed(seed, tag) {
  let h = seed >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = Math.imul(h ^ tag.charCodeAt(i), 16777619);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
// mulberry32 确定性随机流
function rngOf(seed, tag) {
  let a = hashSeed(seed, tag);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rint(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); } // 含端点
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// 确定性 value noise（格点哈希 + 双线性平滑），fBm 与 domain warp 供地形使用
const _vnK = new Int32Array(8192);
const _vnV = new Float32Array(8192);
function vnoise(seed, x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const h = (X, Z) => {
    const key = (Math.imul(seed, 374761393) ^ Math.imul(X, 668265263) ^ Math.imul(Z, 1274126177)) | 0;
    const slot = key & 8191;
    if (_vnK[slot] === key) return _vnV[slot];
    let n = Math.imul(X, 374761393) ^ Math.imul(Z, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    const v = ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    _vnK[slot] = key; _vnV[slot] = v;
    return v;
  };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return h(xi, zi) * (1 - u) * (1 - v) + h(xi + 1, zi) * u * (1 - v) +
         h(xi, zi + 1) * (1 - u) * v + h(xi + 1, zi + 1) * u * v;
}
function fbm(seed, x, z, oct, lac, gain) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(seed + i * 1013, x * freq, z * freq);
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- 体素存储（31 位键 + Map 稀疏）
// 键布局：x∈[-512,511] 11位 | z∈[-512,511] 11位 | y∈[0,511] 9位
function packV(x, y, z) { return ((x + 512) << 20) | ((z + 512) << 9) | y; }
function unpackX(k) { return ((k >>> 20) & 0x7ff) - 512; }
function unpackZ(k) { return ((k >>> 9) & 0x7ff) - 512; }
function unpackY(k) { return k & 0x1ff; }

// VoxStore：世界唯一权威体素库。写入即覆盖；附带特征计数。
class VoxStore {
  constructor() { this.map = new Map(); }
  get count() { return this.map.size; }
  set(x, y, z, c) {
    if (y < 0 || y > 511) return;
    this.map.set(((x + 512) << 20) | ((z + 512) << 9) | y, c);
  }
  get(x, y, z) { return this.map.get(((x + 512) << 20) | ((z + 512) << 9) | y) | 0; }
  has(x, y, z) { return this.map.has(((x + 512) << 20) | ((z + 512) << 9) | y); }
  del(x, y, z) { this.map.delete(((x + 512) << 20) | ((z + 512) << 9) | y); }
  fill(x0, y0, z0, x1, y1, z1, c) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1) | 0, yb = Math.max(y0, y1) | 0;
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    if (ya > 511 || yb < 0) return;
    const y0c = ya < 0 ? 0 : ya, y1c = yb > 511 ? 511 : yb;
    const map = this.map;
    for (let x = xa; x <= xb; x++) {
      const xk = (x + 512) << 20;
      for (let z = za; z <= zb; z++) {
        const zk = xk | ((z + 512) << 9);
        for (let y = y0c; y <= y1c; y++) map.set(zk | y, c);
      }
    }
  }
  // 仅填充顶/底面壳（省体素）
  shell(x0, y0, z0, x1, y1, z1, c) {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const za = Math.min(z0, z1), zb = Math.max(z0, z1);
    for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) { this.set(x, ya, z, c); this.set(x, yb, z, c); }
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) { this.set(x, y, za, c); this.set(x, y, zb, c); }
    for (let z = za; z <= zb; z++) for (let y = ya; y <= yb; y++) { this.set(xa, y, z, c); this.set(xb, y, z, c); }
  }
}

// ---------------------------------------------------------------- 尺度与口径表（M0 冻结；1 体素≈13.8m 水平，竖向为箱庭夸张口径，见 SPEC.md）
const CFG = {
  // 世界与外郭城
  WORLD: { x0: -400, x1: 399, z0: -368, z1: 367, H: 64 },
  CITY:  { x0: -352, x1: 351, z0: -336, z1: 287 },          // 外郭城内缘（不含墙带）
  WALL: 4,                                                  // 城墙带厚（外扩）
  AXIS_X: [-5, 4],                                          // 朱雀大街/中轴 x 区间（10 体素≈138m，口径：155m 取 11 体素太宽，取 10）
  // 三重城（北居中）
  PALACE: { x0: -102, x1: 101, z0: -336, z1: -237 },        // 宫城·太极宫（北墙即外郭北墙中段）
  HENGJIE: { z0: -236, z1: -221 },                          // 宫皇横街（≈220m 大朝广场，取 16 体素）
  IMPERIAL:{ x0: -102, x1: 101, z0: -220, z1: -97 },        // 皇城（百司）
  HUANG_NAN_JIE: { z0: -96, z1: -91 },                      // 皇城南横街（6 体素）
  DAMING: { x0: 112, x1: 316, z0: -368, z1: -247 },         // 大明宫（东北外凸，踞龙首原）
  // 坊区网格：皇城以南 9 排；朱雀街两侧各 6 列（C1/C2 小坊二门一字街，C3-C6 大坊四门十字街）
  ROWS: [
    [-90, -54], [-48, -12], [-6, 30], [36, 72], [78, 114],
    [120, 156], [162, 198], [204, 240], [246, 282],
  ],
  COLS_E: [[8, 48], [54, 97], [103, 159], [165, 222], [228, 284], [290, 347]],   // 街东 C1..C6（C1 让出御道沟槐走廊）
  COLS_W: [[-48, -8], [-97, -54], [-159, -103], [-222, -165], [-284, -228], [-347, -290]],
  SHUN_CHENG: 3,                                            // 顺城街宽
  // 高程（箱庭竖向夸张口径）
  Y: {
    BASE: 4,            // 全城基准地面
    WALL_H: 4,          // 外郭城墙身高（另加女墙 1）
    GATE_TOWER: 7,      // 城楼两层高
    WARD_WALL_H: 3,
    GONG_WALL_H: 4,     // 宫城/皇城墙
    HANYUAN_TAI: 6,     // 含元殿三层大台
    DAYANTA: 22, XIAOYANTA: 16,
  },
  // 街道宽度（体素；保持相对层级：御道>横街>六街>顺城>坊内>巷曲）
  STREET: { ZHUQUE: 10, HENGJIE: 16, GATE8: 8, MAIN: 5, SHUN: 3, WARD_CROSS: 2, LANE: 1 },
  // 预算（M1 冻结，事后不得上调）
  BUDGET: {
    voxSoft: 2400000, voxHard: 2800000,
    drawCalls: 240,
    actors: { high: 900, mid: 550, low: 280 },
    boats: { high: 12, mid: 8, low: 5 },
    camels: { high: 42, mid: 28, low: 14 },
    coldStartSec: 25, peakMemGB: 1.6,
  },
  CHUNK: 128,          // 渲染分块（坊块级剔除粒度）
  LOD_DIST: 320,       // 中距切换简易块
  FAR_DIST: 1500,
};

// ---------------------------------------------------------------- 尺度系统（P0重构：城市/建筑/地标三级分离，禁全城统一细分十倍）
// CITY_SCALE: 地形/坊墙/城墙/大街/渠系/总体布局 — 大尺度低成本体素
// ARCH_SCALE: 普通民宅/府第/店铺/官署/普通寺院 — 常规体素+柱网语法
// LANDMARK_SCALE: 宫殿/主要城门/佛塔/皇家寺院/重要楼阁 — 最高细节预算+局部高分辨率坐标
const CITY_SCALE = { name: 'CITY_SCALE', voxelM: 13.8, domain: 'terrain/wardWall/cityWall/street/canal/layout', detailBudget: 'low', localSubdiv: 1 };
const ARCH_SCALE = { name: 'ARCH_SCALE', voxelM: 13.8, domain: 'house/mansion/shop/office/ordinaryTemple', detailBudget: 'normal', localSubdiv: 1 };
const LANDMARK_SCALE = { name: 'LANDMARK_SCALE', voxelM: 13.8, domain: 'palace/gate/pagoda/royalTemple/tower', detailBudget: 'high', localSubdiv: 2 };
// 性能策略：贪心网格化+分块+LOD+视锥剔除已在 g06/a01 实现；一级地标质量 > 普通建筑 > 微装饰
// 局部高分辨率坐标：地标内部以 local 单位设计（localSubdiv=2，即半体素精度），再量化到世界体素
class LocalVoxelGrid {
  constructor(ctx, ox, oy, oz, subdiv) {
    this.ctx = ctx; this.ox = ox; this.oy = oy; this.oz = oz; this.s = subdiv || 2;
  }
  w(lx, ly, lz) { return [this.ox + Math.round(lx / this.s), this.oy + Math.round(ly / this.s), this.oz + Math.round(lz / this.s)]; }
  set(lx, ly, lz, c) { const w = this.w(lx, ly, lz); this.ctx.store.set(w[0], w[1], w[2], c); }
  fill(lx0, ly0, lz0, lx1, ly1, lz1, c) {
    const a = this.w(Math.min(lx0, lx1), Math.min(ly0, ly1), Math.min(lz0, lz1));
    const b = this.w(Math.max(lx0, lx1), Math.max(ly0, ly1), Math.max(lz0, lz1));
    this.ctx.store.fill(a[0], a[1], a[2], b[0], b[1], b[2], c);
  }
}
class LocalTransform {
  constructor(ox, oz, rotY) { this.ox = ox; this.oz = oz; this.rotY = rotY || 0; }
  apply(lx, lz) {
    if (this.rotY === 0) return [this.ox + lx, this.oz + lz];
    if (this.rotY === 1) return [this.ox - lz, this.oz + lx];
    if (this.rotY === 2) return [this.ox - lx, this.oz - lz];
    return [this.ox + lz, this.oz - lx];
  }
}
// ---------------------------------------------------------------- 建筑视觉等级系统 Rank 0-5（等级首先来自形制/比例/尺度/空间组织，禁只改颜色）
// Rank5 皇家大殿/大门 | Rank4 宫殿/皇家寺院/大佛塔 | Rank3 大型官署/王府/大寺 | Rank2 豪宅/普通寺观/市楼 | Rank1 住宅/店铺/作坊 | Rank0 棚屋/附属房
const RANK_SPEC = {
  5: { platformTiers: 3, platformH: 3, wallH: 5, bays: 11, depthBays: 4, colDia: 1, bayW: 3, eave: 3, roof: 'hip-double', ridge: 'glaze', deco: 'gold', gateW: 5, courtW: 30 },
  4: { platformTiers: 2, platformH: 2, wallH: 4, bays: 7, depthBays: 3, colDia: 1, bayW: 3, eave: 2, roof: 'hip', ridge: 'glaze', deco: 'glaze', gateW: 3, courtW: 22 },
  3: { platformTiers: 1, platformH: 1, wallH: 4, bays: 5, depthBays: 3, colDia: 1, bayW: 2, eave: 2, roof: 'xie', ridge: 'dark', deco: 'none', gateW: 3, courtW: 16 },
  2: { platformTiers: 1, platformH: 1, wallH: 3, bays: 3, depthBays: 2, colDia: 1, bayW: 2, eave: 1, roof: 'xie', ridge: 'dark', deco: 'none', gateW: 2, courtW: 12 },
  1: { platformTiers: 0, platformH: 0, wallH: 3, bays: 3, depthBays: 2, colDia: 1, bayW: 2, eave: 1, roof: 'xuan', ridge: 'dark', deco: 'none', gateW: 1, courtW: 9 },
  0: { platformTiers: 0, platformH: 0, wallH: 2, bays: 1, depthBays: 1, colDia: 1, bayW: 2, eave: 1, roof: 'gable', ridge: 'dark', deco: 'none', gateW: 1, courtW: 5 },
};
function rankSpec(rank) { return RANK_SPEC[Math.max(0, Math.min(5, rank | 0))] || RANK_SPEC[1]; }
// 旧通用原型去留审计结论（冻结）：
// 保留为底层primitive: proto.roof(重构后仅作屋面铺砌)/wallRing/dougong/chiwei/platform/colonnade/enclose
// 适合拆分: proto.hall→TangHallBuilder(按rank分支)/proto.temple→Small/Medium/Royal/Pagoda/Monastery五语法/proto.shop→Shop系
// 适合废弃作为地标主体: proto.gateTower/proto.pagodaLouge/proto.pagodaMiyan/proto.manor/proto.office/proto.courtyard 禁再用于一级地标主体
// 只允许用于普通建筑: proto.hall/courtyard/manor/office/temple/shop( rank<=3 )
// 不允许再用于一级地标: 明德门/丹凤门/含元殿/大雁塔/小雁塔/花萼相辉楼/太极殿 主体禁调 proto.hall/gateTower/temple/pagoda*
const PROTO_POLICY = {
  hall: 'ordinary-only(rank<=3), banned for P0 landmark body',
  roof: 'primitive kept, must go via TangRoofBuilder',
  courtyard: 'ordinary-only, banned for landmark',
  manor: 'ordinary-only, banned for landmark',
  office: 'ordinary-only, banned for landmark',
  temple: 'ordinary-only, split into 5 grammars, banned for royal temple body',
  pagodaLouge: 'deprecated as final scheme, replaced by buildDayanPagoda',
  pagodaMiyan: 'deprecated as final scheme, replaced by buildXiaoyanPagoda',
  gateTower: 'ordinary-only, banned for P0 gate body',
};

// ---------------------------------------------------------------- 调色板（固化色表，禁止现场取色；group 决定材质类：opaque/water/glow）
const PALETTE_DEF = [
  ['loessDeep',   '#7d6845', 'opaque'], // 黄土深
  ['loess',       '#9a8258', 'opaque'], // 黄土（地表主色）
  ['loessLight',  '#b39a72', 'opaque'], // 黄土浅
  ['rammedDark',  '#9a8560', 'opaque'], // 夯土深
  ['rammed',      '#b49c71', 'opaque'], // 夯土（坊墙/城墙）
  ['rammedLight', '#cbb489', 'opaque'], // 夯土浅
  ['grass',       '#7e9156', 'opaque'], // 草
  ['moss',        '#5f7444', 'opaque'], // 苔（沟边/林下）
  ['fieldEarth',  '#8f7a52', 'opaque'], // 田土（郊野）
  ['riverSand',   '#b3a172', 'opaque'], // 河滩
  ['plaster',     '#ede4cf', 'opaque'], // 粉墙米白
  ['plasterWarm', '#e2d5b8', 'opaque'], // 粉墙暖白
  ['zhu',         '#b23a27', 'opaque'], // 朱红（柱额门窗）
  ['zhuDeep',     '#8c2d1f', 'opaque'], // 土朱
  ['zhuBright',   '#cf5032', 'opaque'], // 朱亮
  ['timber',      '#6d4a2f', 'opaque'], // 木
  ['timberDark',  '#4c311e', 'opaque'], // 木深
  ['roofGrey',    '#4a5358', 'opaque'], // 青灰瓦
  ['roofLight',   '#6a747c', 'opaque'], // 瓦亮
  ['roofDark',    '#32383c', 'opaque'], // 瓦暗
  ['glazeGreen',  '#3f7d5a', 'opaque'], // 琉璃绿（仅剪边/鸱尾）
  ['glazeBlue',   '#3a6d8f', 'opaque'], // 琉璃蓝（仅剪边/鸱尾）
  ['gold',        '#c9a227', 'opaque'], // 金（极小面积）
  ['bronze',      '#8a6a3a', 'opaque'], // 铜
  ['iron',        '#3d4145', 'opaque'], // 铁
  ['brickPave',   '#9c9180', 'opaque'], // 砖铺（市/殿庭）
  ['stoneGrey',   '#7d7f7a', 'opaque'], // 石
  ['stoneWhite',  '#d8d2c0', 'opaque'], // 白石（台阶/勾栏）
  ['canalWater',  '#5e8f86', 'water'],  // 渠水浊青
  ['pondWater',   '#4f9d97', 'water'],  // 池水清碧
  ['weiWater',    '#9a9c68', 'water'],  // 渭水苍黄
  ['qujiangWater','#57a3a8', 'water'],  // 曲江
  ['huaiGreen',   '#3d5a2e', 'opaque'], // 槐
  ['huaiLight',   '#54743c', 'opaque'], // 槐亮
  ['willowGreen', '#82a55c', 'opaque'], // 柳
  ['pineGreen',   '#365a3e', 'opaque'], // 松
  ['bambooGreen', '#5f9151', 'opaque'], // 竹
  ['wutongGreen', '#6f8f4f', 'opaque'], // 梧桐
  ['withered',    '#b3a05f', 'opaque'], // 枯草
  ['apricotPink', '#e5c3c9', 'opaque'], // 杏花
  ['peonyRed',    '#c25a6e', 'opaque'], // 牡丹
  ['lantern',     '#ff9a3c', 'glow'],   // 灯笼暖橙
  ['candle',      '#ffc86e', 'glow'],   // 烛
  ['flagRed',     '#c0392b', 'opaque'], // 旗红
  ['flagBlue',    '#3a6b9a', 'opaque'], // 旗蓝
  ['flagYellow',  '#d8a93c', 'opaque'], // 旗黄
  ['flagGreen',   '#4a8f5a', 'opaque'], // 旗绿
  ['flagPurple',  '#7a4a8a', 'opaque'], // 旗紫
  ['clothCream',  '#eee0bf', 'opaque'], // 绢
  ['clothHu',     '#b0693a', 'opaque'], // 胡毯
  ['skin',        '#c9916a', 'opaque'], // 肤色
  ['robePurple',  '#5f3a75', 'opaque'], // 紫袍（三品以上）
  ['robeFei',     '#a83a32', 'opaque'], // 绯袍（四五品）
  ['robeGreen',   '#4a7a44', 'opaque'], // 绿袍（六七品）
  ['robeQing',    '#3a5a7d', 'opaque'], // 青袍（八九品）
  ['commonHemp',  '#8a7a5f', 'opaque'], // 短褐（庶民）
  ['monkRobe',    '#c9762a', 'opaque'], // 袈裟
  ['armor',       '#4a4e55', 'opaque'], // 甲胄（金吾卫）
  ['skirtRu',     '#c85a6a', 'opaque'], // 襦裙
  ['camelFur',    '#b08a5a', 'opaque'], // 驼
  ['horseBrown',  '#6a4a3a', 'opaque'], // 马
  ['oxGrey',      '#5f5648', 'opaque'], // 牛
  ['mountainFar', '#8fa3b8', 'opaque'], // 终南山剪影
  ['doorDark',    '#3a2a1c', 'opaque'], // 板门
  ['paperWhite',  '#f2ead8', 'opaque'], // 纸幡
];
const PAL = {}; PALETTE_DEF.forEach((d, i) => { PAL[d[0]] = i + 1; }); // 体素值 1..N，0=空
const PAL_GROUP = PALETTE_DEF.map(d => d[2]);

// ---------------------------------------------------------------- 108 坊表（M0 交付；conf: 2=确证 1=有据约略 0=推定补位，见 SPEC.md 口径说明）
// 结构: [名, 详写级(0概括/1肌理/2详写), 核心内容, conf]
const WARD_NAMES_E = {
  1: ['兴道',1,'朱雀街东首坊',1], 2: ['开化',2,'荐福寺',2], 3: ['安仁',2,'荐福寺浮图院·小雁塔',2],
  4: ['光福',1,'—',1], 5: ['靖善',2,'大兴善寺（占一坊）',2], 6: ['兰陵',1,'—',1],
  7: ['开明',1,'—',0], 8: ['保宁',1,'—',1], 9: ['安义',1,'—',1],
  10: ['务本',2,'国子监·孔庙',2], 11: ['崇义',1,'—',1], 12: ['长兴',1,'—',1],
  13: ['永乐',1,'—',1], 14: ['靖安',1,'—',1], 15: ['安善',1,'—',1],
  16: ['大业',1,'—',0], 17: ['昌乐',1,'—',1], 18: ['安德',1,'—',1],
  19: ['永兴',2,'魏徵宅',2], 20: ['崇仁',2,'乐器作坊·邸店·昼夜灯火',2], 21: ['平康',2,'北里·举子聚集',2],
  22: ['宣阳',1,'—',1], 23: ['亲仁',2,'郭子仪汾阳王府（占坊四分之一）',2], 24: ['永宁',1,'—',1],
  25: ['永崇',1,'—',1], 26: ['昭国',1,'—',1], 27: ['修行',1,'—',1],
  28: ['大宁',1,'—',1], 29: ['胜业',1,'兴庆宫西邻',1], 30: ['宣平',1,'—',1],
  31: ['道政',2,'东市北邻·胡汉杂居',1], 32: ['东市',2,'都会市（占二坊之地）',2], 33: ['东市',0,'',2],
  34: ['常乐',2,'—',1], 35: ['靖恭',1,'—',1], 36: ['晋昌',2,'大慈恩寺·大雁塔',2],
  37: ['兴宁',1,'—',1], 38: ['永嘉',2,'南半入兴庆宫',1], 39: ['隆庆',2,'兴庆宫（南内）',2],
  40: ['安兴',1,'—',0], 41: ['升平',1,'—',1], 42: ['新昌',2,'青龙寺·乐游原',2],
  43: ['升道',2,'乐游原游赏地',1], 44: ['立政',1,'—',1], 45: ['敦化',1,'—',1],
  46: ['长乐',1,'—',1], 47: ['永福',1,'十六王宅',1], 48: ['崇让',1,'—',0],
  49: ['广化',1,'—',0], 50: ['丰安',1,'—',0], 51: ['临晋',1,'—',0],
  52: ['永和',1,'—',0], 53: ['芙蓉',1,'芙蓉园（禁苑）',2], 54: ['曲江',1,'曲江池',2],
};
const WARD_NAMES_W = {
  1: ['光德',1,'—',1], 2: ['善和',1,'—',1], 3: ['延康',2,'西明寺',2],
  4: ['昭行',1,'—',0], 5: ['崇业',2,'玄都观',2], 6: ['永阳',1,'—',1],
  7: ['丰乐',1,'—',1], 8: ['大安',1,'—',1], 9: ['居安',1,'—',0],
  10: ['崇贤',1,'—',1], 11: ['太平',1,'—',1], 12: ['通义',1,'—',1],
  13: ['长寿',1,'—',1], 14: ['嘉会',1,'—',1], 15: ['永平',1,'—',1],
  16: ['普宁',1,'—',1], 17: ['修真',1,'—',1], 18: ['怀德',1,'—',1],
  19: ['兴化',2,'何家村窖藏之地·贵戚宅',2], 20: ['延寿',1,'金银珠玉铺',1], 21: ['崇化',1,'—',1],
  22: ['布政',2,'胡祆祠',2], 23: ['醴泉',1,'波斯胡寺·近西市',1], 24: ['居德',1,'—',1],
  25: ['义宁',2,'胡客聚居·景教',2], 26: ['颁政',1,'—',1], 27: ['辅兴',2,'胡麻饼名店',1],
  28: ['安定',1,'—',1], 29: ['休祥',1,'—',1], 30: ['金城',1,'—',1],
  31: ['灵化',1,'—',1], 32: ['西市',2,'利人市/金市（占二坊之地）',2], 33: ['西市',0,'',2],
  34: ['怀远',1,'—',1], 35: ['丰邑',1,'—',1], 36: ['待贤',1,'—',1],
  37: ['崇德',1,'—',1], 38: ['群贤',1,'—',1], 39: ['道德',1,'—',1],
  40: ['光行',1,'—',0], 41: ['和平',1,'—',1], 42: ['安业',1,'—',1],
  43: ['永达',1,'—',0], 44: ['淳和',1,'—',1], 45: ['永安',1,'—',0],
  46: ['修德',1,'—',1], 47: ['广恩',1,'—',0], 48: ['灵应',1,'—',0],
  49: ['永光',1,'—',0], 50: ['敦行',1,'—',0], 51: ['景行',1,'—',0],
  52: ['咸宁',1,'—',0], 53: ['通善',1,'—',0], 54: ['延祚',1,'—',0],
};

// 由行列生成 108 坊位表：plot id 1..108；两市各占 r4/r5 两位（id 32/33 表示同一市的两块）
function buildWardTable() {
  const wards = [];
  for (const side of ['E', 'W']) {
    const names = side === 'E' ? WARD_NAMES_E : WARD_NAMES_W;
    const cols = side === 'E' ? CFG.COLS_E : CFG.COLS_W;
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 9; r++) {
        const seq = c * 9 + r + 1;
        const [name, detail, content, conf] = names[seq];
        const small = c < 2;                       // 皇城南四列小坊：只开东西二门、一字横街
        const isMarket = (c === 3 && (r === 4 || r === 5)); // 两市各占 r4+r5 两坊之地，春明门街在市北贯通
        wards.push({
          id: wards.length + 1,
          side, col: c, row: r,
          name, detail, content, conf, small,
          type: isMarket ? 'market' : 'ward',
          marketHalf: isMarket ? (r === 4 ? 'N' : 'S') : null,
          x0: cols[c][0], x1: cols[c][1], z0: CFG.ROWS[r][0], z1: CFG.ROWS[r][1],
          gates: small ? ['E', 'W'] : ['N', 'S', 'E', 'W'],
        });
      }
    }
  }
  return wards;
}

// ---------------------------------------------------------------- 特征计数与签名去重
function makeCounters() {
  return {
    buildings: 0, houses: 0, temples: 0, towers: 0, gates: 0, trees: 0,
    shops: 0, wells: 0, bridges: 0, boats: 0, lamps: 0, pavilions: 0, halls: 0,
    protoSign: new Set(),
  };
}
// 参数签名：同原型同位置参数组合必须唯一，杜绝复制感
function signUnique(counters, sig) {
  if (counters.protoSign.has(sig)) return false;
  counters.protoSign.add(sig);
  return true;
}

// ---------------------------------------------------------------- 导出
CHANGAN.hashSeed = hashSeed;
CHANGAN.rngOf = rngOf;
CHANGAN.rint = rint;
CHANGAN.pick = pick;
CHANGAN.vnoise = vnoise;
CHANGAN.fbm = fbm;
CHANGAN.packV = packV; CHANGAN.unpackX = unpackX; CHANGAN.unpackY = unpackY; CHANGAN.unpackZ = unpackZ;
CHANGAN.VoxStore = VoxStore;
CHANGAN.CFG = CFG;
CHANGAN.CITY_SCALE = CITY_SCALE; CHANGAN.ARCH_SCALE = ARCH_SCALE; CHANGAN.LANDMARK_SCALE = LANDMARK_SCALE;
CHANGAN.LocalVoxelGrid = LocalVoxelGrid; CHANGAN.LocalTransform = LocalTransform;
CHANGAN.RANK_SPEC = RANK_SPEC; CHANGAN.rankSpec = rankSpec; CHANGAN.PROTO_POLICY = PROTO_POLICY;
CHANGAN.PAL = PAL; CHANGAN.PAL_DEF = PALETTE_DEF; CHANGAN.PAL_GROUP = PAL_GROUP;
CHANGAN.buildWardTable = buildWardTable;
CHANGAN.makeCounters = makeCounters;
CHANGAN.signUnique = signUnique;
