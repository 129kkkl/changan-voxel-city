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
  // 城外郊野：北濒渭水、南望终南山自然起伏余脉、东控关洛、西引丝路
  // 1. 北面渭水低滩与主河床（z < -340）
  if (z < -354) return 1;                                   // 渭水主河槽
  if (z < -340) return 2 + (z + 354) * 0.14;                 // 漫滩阶地缓坡

  // 2. 南面终南山余脉（z > 336）
  // 彻底消除人工阶梯山！设计平缓起伏、山脊自然衔接的南山远景，东西边缘柔和隐于旷野
  if (z > 336) {
    const u = (z - 336) / (CFG.WORLD.z1 - 336); // 0.0 ~ 1.0
    // 渐进曲线：近处极其平缓（坡度 < 0.2），远端自然升起至山脊
    const rise = Math.pow(u, 2.3) * 8.5;
    // 自然山峦山脊波（多波长叠加）
    const ridgeNoise = CHANGAN.fbm(seed + 89, x * 0.015, z * 0.015, 3, 2, 0.5) * 4.5;
    const peakWave = Math.sin(x * 0.022 + 0.6) * 2.6 + Math.cos(x * 0.045 + 1.2) * 1.4;
    let hillH = rise + Math.pow(u, 1.3) * (ridgeNoise + peakWave);
    // 东西世界边缘柔和收拢，避免世界边缘露出刀削般垂直截面
    let edgeFade = 1.0;
    if (x < -330) edgeFade = Math.max(0, (x - CFG.WORLD.x0) / 70);
    else if (x > 330) edgeFade = Math.max(0, (CFG.WORLD.x1 - x) / 69);
    edgeFade = edgeFade * edgeFade * (3 - 2 * edgeFade);
    hillH *= edgeFade;
    return 3.5 + hillH;
  }

  // 3. 广阔平原（关中农田微地形）
  return 3.5 + CHANGAN.fbm(seed + 7, x * 0.025, z * 0.025, 2, 2, 0.5) * 0.7;
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
      if (!inCity) {
        // --- 城外全域环境地表分类 ---
        if (z < -340) {
          // 北面渭水与河滩湿地
          if (z < -354) {
            c = PAL.weiWater;
            fields.water[i] = 3;
          } else {
            c = (CHANGAN.fbm(seed + 15, x * 0.08, z * 0.08, 2, 2, 0.5) > 0.45) ? PAL.riverSand : PAL.moss;
          }
        } else if (z > 336) {
          // 南面终南山余脉植被与岩壁（消除单一灰色与无纹理块体）
          if (y >= 8) {
            c = (CHANGAN.fbm(seed + 17, x * 0.04, z * 0.04, 2, 2, 0.5) > 0.45) ? PAL.mountainFar : PAL.pineGreen;
          } else if (y >= 5) {
            c = (CHANGAN.fbm(seed + 19, x * 0.04, z * 0.04, 2, 2, 0.5) > 0.42) ? PAL.pineGreen : PAL.grass;
          } else {
            c = (CHANGAN.fbm(seed + 21, x * 0.05, z * 0.05, 2, 2, 0.5) > 0.48) ? PAL.grass : PAL.fieldEarth;
          }
        } else {
          // 广袤关中农田与郊野系统：规整农田畦垄块 + 田埂 + 灌溉微水网 + 草甸
          const gx = Math.floor((x + 600) / 20);
          const gz = Math.floor((z + 600) / 16);
          const cellX = (x + 600) % 20;
          const cellZ = (z + 600) % 16;
          const isRidge = (cellX === 0 || cellZ === 0);
          if (isRidge) {
            c = ((gx + gz) % 2 === 0) ? PAL.loessDeep : PAL.grass;
          } else {
            const stripe = (gz % 2 === 0) ? (cellZ % 3) : (cellX % 3);
            const patchType = (gx * 7 + gz * 13 + (seed & 7)) % 4;
            if (patchType === 0) {
              // 熟麦/金粟垄
              c = (stripe === 0) ? PAL.withered : (stripe === 1 ? PAL.fieldEarth : PAL.loessLight);
            } else if (patchType === 1) {
              // 绿苗田
              c = (stripe === 0) ? PAL.grass : (stripe === 1 ? PAL.fieldEarth : PAL.moss);
            } else if (patchType === 2) {
              // 菜圃与桑麻田
              c = (stripe === 0) ? PAL.moss : PAL.fieldEarth;
            } else {
              // 郊野绿地与草甸
              c = (CHANGAN.fbm(seed + 31, x * 0.06, z * 0.06, 2, 2, 0.5) > 0.48) ? PAL.grass : PAL.fieldEarth;
            }
          }
        }
      } else {
        // 城内基底：乐游原高地略带青草，城郭边缘略带草斑
        const isLeyou = (x >= 210 && x <= 340 && z >= 95 && z <= 235);
        if (isLeyou && CHANGAN.fbm(seed + 47, x * 0.05, z * 0.05, 2, 2, 0.5) > 0.55) {
          c = PAL.grass;
        } else {
          c = PAL.loess;
        }
      }

      // 保证地表垂直连续坚实（下填至基底或 y-2），防止台阶和斜坡处露出空洞
      const yBottom = Math.max(1, y - 2);
      for (let yy = yBottom; yy < y; yy++) {
        map.set(xk | ((z + 512) << 9) | yy, PAL.loessDeep);
      }
      map.set(xk | ((z + 512) << 9) | y, c);
      fields.topColor[i] = c;
    }
    if ((x & 63) === 0) ctx.progress('terrain', (x - W.x0) / (W.x1 - W.x0));
  }
};

// ---------------------------------------------------------------- S2 礼制骨架：街网掩膜与街级
function markStreetMask(ctx) {
  const { CFG, fields } = ctx;
  const W = CFG.WORLD;
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

  // --- 城外放射状交通干道网络（打破"城外空无一物、道路撞墙断头"） ---
  // 南出明德门御道（南郊官道直贯南郊，通向圜丘与终南原野）
  setRect(CFG.AXIS_X[0], CFG.CITY.z1 + 1, CFG.AXIS_X[1], 345, 1);
  // 南出安化门、启夏门次干道
  setRect(-162, CFG.CITY.z1 + 1, -158, 335, 4);
  setRect(159, CFG.CITY.z1 + 1, 163, 335, 4);
  // 西出开远门、金光门丝路干道（向西贯通至世界西缘）
  setRect(W.x0, -11, CFG.CITY.x0 - 1, -7, 3);
  setRect(W.x0, 73, CFG.CITY.x0 - 1, 77, 3);
  setRect(W.x0, 199, CFG.CITY.x0 - 1, 203, 4);
  // 东出通化门、春明门、延兴门关洛干道（向东贯通至世界东缘）
  setRect(CFG.CITY.x1 + 1, -11, W.x1, -7, 3);
  setRect(CFG.CITY.x1 + 1, 73, W.x1, 77, 3);
  setRect(CFG.CITY.x1 + 1, 199, W.x1, 202, 4);
  // 北出玄武门与大明宫北通渭道
  setRect(-3, -353, 2, CFG.CITY.z0 - 1, 4);
  setRect(212, -353, 216, CFG.CITY.z0 - 1, 4);
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
      let c = PAL.loess;
      if (lv === 1) {
        // 御道（朱雀大街）：中央 4 格天子御道平整浅夯土，两侧官道黄土夯筑
        const isCenterAxis = (x >= -2 && x <= 1);
        c = isCenterAxis ? PAL.rammedLight : (Math.abs(x) >= 4 ? PAL.loessDeep : PAL.loess);
      } else if (lv === 2) {
        // 横街（大朝广场横街）：大尺度整体夯土
        c = (z >= CFG.HENGJIE.z0 + 4 && z <= CFG.HENGJIE.z1 - 4) ? PAL.rammedLight : PAL.loess;
      } else if (lv === 3) {
        // 门前街衢
        c = PAL.loessLight;
      } else {
        // 六街与顺城街
        c = PAL.loess;
      }
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
  // ---- 马面（墙台）：沿外郭城墙每 24 格外凸 2 格、高出 2 格。
  // 无马面的长墙在鸟瞰诊断里被判为"一堵无门窗无马面的灰色板墙"；马面给夯土长墙节奏与天际线锚点。
  const addButtress = (bx, bz, ox, oz) => {
    const base = store.get(bx, fields.groundH[CHANGAN.fieldIndex(bx, bz)] + H, bz);
    if (!base) return; // 该处无墙（宫城/大明宫让位段）
    for (let d = 0; d <= 2; d++) {
      for (let s = -1; s <= 1; s++) {
        const px = bx + ox * d + (ox === 0 ? s : 0);
        const pz = bz + oz * d + (oz === 0 ? s : 0);
        const i = CHANGAN.fieldIndex(px, pz);
        if (i < 0 || i >= fields.groundH.length) continue;
        const g = fields.groundH[i];
        for (let y = 1; y <= H + 2; y++) store.set(px, g + y, pz, y % 3 === 0 ? P.rammedDark : P.rammed);
        fields.topH[i] = g + H + 2; fields.topColor[i] = P.rammedDark;
      }
    }
  };
  for (let x = CFG.CITY.x0; x <= CFG.CITY.x1; x += 24) {
    addButtress(x, CFG.CITY.z1 + T, 0, 1);   // 南墙外凸
    addButtress(x, CFG.CITY.z0 - T, 0, -1);  // 北墙外凸
  }
  for (let z = CFG.CITY.z0; z <= CFG.CITY.z1; z += 24) {
    addButtress(CFG.CITY.x1 + T, z, 1, 0);   // 东墙外凸
    addButtress(CFG.CITY.x0 - T, z, -1, 0);  // 西墙外凸
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
