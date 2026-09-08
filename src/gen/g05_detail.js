// g05_detail.js — S4/S7 三大内与地标精建、S8 五渠水系、S9 生活细节、S10 封壳
'use strict';
(function () {
const proto = CHANGAN.proto;
const platform = (...a) => CHANGAN.platform(...a);

// ================================================================ S7 三大内
// 宫殿区整平：殿庭建于同一台地（皇城/宫城/大明宫/兴庆宫），杜绝微观起伏导致的浮空
function flattenRect(ctx, x0, z0, x1, z1) {
  const { store, fields } = ctx;
  const hs = [];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) hs.push(fields.groundH[CHANGAN.fieldIndex(x, z)]);
  hs.sort((a, b) => a - b);
  const base = hs[Math.floor(hs.length / 2)];
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (fields.road[i] || fields.water[i]) continue;
    if (fields.topH[i] < fields.groundH[i]) continue; // 已开挖处不动
    const g = fields.groundH[i];
    if (g === base) continue;
    // 整平阶段本 rect 内只有地表与街道点缀，清空原列再置新面（防留孤饰）
    for (let y = g + 1; y <= fields.topH[i]; y++) store.del(x, y, z);
    store.del(x, g, z);
    store.set(x, base, z, PAL.brickPave);
    fields.groundH[i] = base; fields.topH[i] = base; fields.topColor[i] = PAL.brickPave;
  }
  return base;
}
CHANGAN.stagePalaces = function (ctx) {
  const { CFG } = ctx;
  const bPalace = flattenRect(ctx, CFG.PALACE.x0, CFG.PALACE.z0, CFG.PALACE.x1, CFG.PALACE.z1);
  const bImperial = flattenRect(ctx, CFG.IMPERIAL.x0, CFG.IMPERIAL.z0, CFG.IMPERIAL.x1, CFG.IMPERIAL.z1);
  const bDaming = flattenRect(ctx, CFG.DAMING.x0, CFG.DAMING.z0, CFG.DAMING.x1, CFG.DAMING.z1);
  flattenRect(ctx, 226, -30, 286, 32); // 兴庆宫
  ctx.basePalace = bPalace; ctx.baseImperial = bImperial; ctx.baseDaming = bDaming;
  // 整平后筑宫墙与宫门（宫墙替代郭墙段）
  CHANGAN.ringWall(CFG.PALACE, CFG.Y.GONG_WALL_H, PAL.rammed, PAL.zhuDeep, ctx);
  CHANGAN.ringWall(CFG.IMPERIAL, CFG.Y.GONG_WALL_H, PAL.rammed, PAL.zhuDeep, ctx);
  CHANGAN.ringWall(CFG.DAMING, 3, PAL.rammed, PAL.zhuDeep, ctx);
  for (const g of ctx.gates) if (!g.city) buildCityGate(ctx, g);
  buildGongCheng(ctx);      // 太极宫（西内）
  buildHuangCheng(ctx);     // 皇城百司 + 左祖右社
  buildDaMing(ctx);         // 大明宫（东内）
  buildXingQing(ctx);       // 兴庆宫（南内）
  buildJiaCheng(ctx);       // 夹城复道
  proto.yuanqiu(ctx, 60, 330, groundAt(ctx, 60, 330)); // 圜丘（南郊，明德门东约 1km 口径）
  // 四角角楼
  const C = CFG.CITY;
  proto.cornerTower(ctx, C.x0 - 2, C.z0 - 2, groundAt(ctx, C.x0, C.z0) + CFG.Y.WALL_H);
  proto.cornerTower(ctx, C.x1 + 2, C.z0 - 2, groundAt(ctx, C.x1, C.z0) + CFG.Y.WALL_H);
  proto.cornerTower(ctx, C.x0 - 2, C.z1 + 2, groundAt(ctx, C.x0, C.z1) + CFG.Y.WALL_H);
  proto.cornerTower(ctx, C.x1 + 2, C.z1 + 2, groundAt(ctx, C.x1, C.z1) + CFG.Y.WALL_H);
  // 城门重楼：P0 明德/丹凤/承天走独立builder，其余普通郭城门走通用门楼（普通级）
  for (const g of ctx.gates) {
    if (g.name === '明德门') CHANGAN.buildMingdeGate(ctx, g);
    else if (g.name === '丹凤门') CHANGAN.buildDanfengGate(ctx, g);
    else if (g.name === '承天门') CHANGAN.buildChengtianGate(ctx, g);
    else proto.gateTower(ctx, g);
  }
};
function groundAt(ctx, x, z) { return ctx.fields.groundH[CHANGAN.fieldIndex(x, z)]; }

// ---------------------------------------------------------------- 宫殿内墙与门殿构件（宫城/皇城内部院落分隔）
// 内墙线：高 3 夯土朱帽，gapAt 处留 3 宽门洞
function innerWall(ctx, x0, z0, x1, z1, base, gapAt) {
  const { store } = ctx;
  const alongX = (z0 === z1);
  for (let t = 0; ; t++) {
    const x = alongX ? x0 + t : x0, z = alongX ? z0 : z0 + t;
    if (alongX && x > x1) break;
    if (!alongX && z > z1) break;
    if (gapAt && Math.abs((alongX ? x : z) - gapAt) <= 1) continue;
    store.set(x, base + 1, z, PAL.rammed);
    store.set(x, base + 2, z, PAL.rammedLight);
    store.set(x, base + 3, z, PAL.zhuDeep);
  }
}
// 门殿（过厅）：石台基上开敞柱厅，南北贯通，歇山顶——宫殿轴线上的"门"
function gateHall(ctx, x0, z0, x1, z1, base) {
  const { store } = ctx;
  platform(ctx, x0, z0, x1, z1, base, 1, PAL.stoneWhite, 'S');
  const cx = (x0 + x1) >> 1;
  for (let x = x0; x <= x1; x++) {
    if (Math.abs(x - cx) <= 1) continue; // 中门通道
    for (let y = 2; y <= 4; y++) { store.set(x, base + 1 + y - 1, z0, PAL.zhu); store.set(x, base + 1 + y - 1, z1, PAL.zhu); }
  }
  for (const z of [z0, z1]) for (let x = x0; x <= x1; x++) { store.set(x, base + 5, z, PAL.zhu); } // 额枋
  proto.roof(ctx, 'xie', x0, z0, x1, z1, base + 6, { main: PAL.roofGrey, lip: PAL.roofLight, overhang: 1 });
  ctx.counters.gates++;
}

// ---------------------------------------------------------------- 太极宫：承天门→嘉德门→太极殿→朱明门→两仪殿→甘露殿；东宫、掖庭；北御苑
function buildGongCheng(ctx) {
  const { CFG, store } = ctx;
  const P = CFG.PALACE;
  const base = ctx.basePalace;
  const cx = -1;

  // ---- 中轴院落序列（殿庭以横墙与门殿分隔，层层递进）
  // 承天门内前庭（朝堂）：开阔砖庭 + 东西廊庑
  paveRect(ctx, cx - 16, -254, cx + 15, -241, base);
  proto.colonnade(ctx, cx - 18, -253, cx - 18, -242, base);
  proto.colonnade(ctx, cx + 17, -253, cx + 17, -242, base);
  // 嘉德门（横墙 + 门殿）
  innerWall(ctx, -40, -256, 38, -256, base, cx);
  gateHall(ctx, cx - 5, -258, cx + 4, -256, base);
  // 太极殿庭：殿前广场 + 两侧廊庑
  paveRect(ctx, cx - 16, -284, cx + 15, -267, base);
  proto.colonnade(ctx, cx - 18, -284, cx - 18, -260, base);
  proto.colonnade(ctx, cx + 17, -284, cx + 17, -260, base);
  // 太极殿（前朝正殿：专用builder，三层台+重檐庑殿十一间，宽矮舒展以别含元高耸；禁proto.hall主体）
  CHANGAN.buildTaijiHall(ctx, cx, -295, -287, base);
  // 朱明门
  innerWall(ctx, -40, -299, 38, -299, base, cx);
  gateHall(ctx, cx - 5, -301, cx + 4, -299, base);
  // 两仪殿庭（内朝）+ 两仪殿
  paveRect(ctx, cx - 12, -311, cx + 11, -302, base);
  proto.colonnade(ctx, cx - 14, -311, cx - 14, -303, base);
  proto.colonnade(ctx, cx + 13, -311, cx + 13, -303, base);
  proto.hall(ctx, cx - 8, -318, cx + 7, -313, base, { roof: 'hip', platform: 1, trim: PAL.glazeGreen, door: 'S' });
  // 甘露门 + 甘露殿（寝区）
  innerWall(ctx, -40, -320, 38, -320, base, cx);
  gateHall(ctx, cx - 4, -322, cx + 3, -320, base);
  proto.hall(ctx, cx - 6, -330, cx + 5, -325, base, { roof: 'xie', platform: 1, trim: PAL.glazeGreen, door: 'S' });
  // 中轴院落与东西宫的纵向分隔墙
  innerWall(ctx, -42, -331, -42, -240, base, -277);
  innerWall(ctx, 40, -331, 40, -240, base, -277);

  // ---- 东宫（宫城东部独立宫区：围墙 + 门 + 前后殿 + 崇文馆）
  ringCompound(ctx, 44, -310, 94, -244, base, { face: 'W', gz: -277 });
  proto.hall(ctx, 54, -296, 64, -290, base, { roof: 'xie', platform: 1, col: PAL.zhuBright, door: 'S', trim: PAL.glazeGreen });
  proto.hall(ctx, 56, -306, 62, -301, base, { roof: 'xuan', platform: 1, door: 'S' });
  proto.hall(ctx, 74, -296, 84, -291, base, { roof: 'xie', platform: 1, door: 'S' }); // 崇文馆
  proto.colonnade(ctx, 52, -286, 66, -286, base);
  paveRect(ctx, 52, -288, 86, -276, base);
  proto.tree(ctx, 70, -270, base, 'huai', CHANGAN.rngOf(ctx.seed, 'donggong'));
  proto.tree(ctx, 88, -252, base, 'pine', CHANGAN.rngOf(ctx.seed, 'donggong2'));

  // ---- 掖庭宫（宫城西部：围墙 + 局署小殿群）
  ringCompound(ctx, -94, -310, -46, -244, base, { face: 'E', gz: -277 });
  proto.hall(ctx, -84, -296, -74, -291, base, { roof: 'xie', platform: 1, door: 'S' });
  proto.hall(ctx, -84, -272, -76, -268, base, { roof: 'xuan', door: 'S', wallH: 3 });
  proto.hall(ctx, -66, -272, -58, -268, base, { roof: 'xuan', door: 'S', wallH: 3 });
  paveRect(ctx, -88, -288, -52, -276, base);

  // ---- 北御苑：池 + 亭 + 林木（玄武门内侧高坡地；北让顺城街一行）
  pond(ctx, 48, -333, 64, -331, base - 1, PAL.pondWater);
  proto.pavilion(ctx, 70, -332, base, 'big');
  const rngT = CHANGAN.rngOf(ctx.seed, 'yuyuan');
  for (let k = 0; k < 8; k++) {
    const x = CHANGAN.rint(rngT, -94, 94), z = CHANGAN.rint(rngT, -335, -331);
    if (Math.abs(x - cx) < 9) continue; // 让开玄武门坡道
    const ti = CHANGAN.fieldIndex(x, z);
    if (ctx.fields.road[ti] || ctx.fields.water[ti]) continue; // 让开顺城街
    if (ctx.fields.topH[ti] !== ctx.fields.groundH[ti]) continue;
    proto.tree(ctx, x, z, ctx.fields.groundH[ti], rngT() < 0.6 ? 'pine' : 'huai', rngT);
  }
  // 玄武门坡道（地势高，政变之地：加厚门观表达）
  for (let s = 0; s < 8; s++) store.fill(cx - 6, base - s % 2, P.z0 + 1 + s, cx + 5, base - s % 2, P.z0 + 1 + s, PAL.brickPave);
  ctx.counters.temples++;
}
// 砖铺殿庭
function paveRect(ctx, x0, z0, x1, z1, base) {
  const { store, fields } = ctx;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (fields.water[i]) continue;
    if (fields.topH[i] !== fields.groundH[i]) continue;
    store.set(x, base, z, PAL.brickPave); fields.topColor[i] = PAL.brickPave;
  }
}
// 独立院落围合（东宫/掖庭/太庙等用）：三面墙 + 门洞
function ringCompound(ctx, x0, z0, x1, z1, base, gate) {
  const { store } = ctx;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
    if (gate && gate.face === 'W' && x === x0 && Math.abs(z - gate.gz) <= 1) continue;
    if (gate && gate.face === 'E' && x === x1 && Math.abs(z - gate.gz) <= 1) continue;
    if (gate && gate.face === 'S' && z === z1 && Math.abs(x - gate.gx) <= 1) continue;
    store.set(x, base + 1, z, PAL.rammed);
    store.set(x, base + 2, z, PAL.rammedLight);
    store.set(x, base + 3, z, PAL.zhuDeep);
  }
}

// ---------------------------------------------------------------- 皇城：承天门街 + 两横街 + 百司衙署街区 + 左祖右社
function buildHuangCheng(ctx) {
  const { CFG, store, fields } = ctx;
  const R = CFG.IMPERIAL;
  const base = ctx.baseImperial;
  // 承天门街（纵贯皇城，御道级砖街）
  for (let x = -4; x <= 2; x++) for (let z = R.z0 + 1; z <= R.z1 - 1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    store.set(x, base, z, PAL.brickPave); fields.topColor[i] = PAL.brickPave; fields.road[i] = 6;
  }
  // 两条横街（分皇城为三带）
  for (const zs of [[-190, -187], [-140, -137]]) {
    for (let x = R.x0 + 1; x <= R.x1 - 1; x++) for (let z = zs[0]; z <= zs[1]; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      store.set(x, base, z, PAL.brickPave); fields.topColor[i] = PAL.brickPave; fields.road[i] = 6;
    }
  }
  // 百司衙署：沿街布置的围墙院落建筑群（门屋-正堂-后堂-廊庑），体量沿带有别
  const offices = [
    // 北带（中书、门下、尚书省所在，近宫城）：两座大衙
    { x0: 8, z0: -218, x1: 50, z1: -192, face: 'W' },
    { x0: 56, z0: -218, x1: 96, z1: -192, face: 'S' },
    { x0: -50, z0: -218, x1: -8, z1: -192, face: 'E' },
    { x0: -96, z0: -218, x1: -56, z1: -192, face: 'S' },
    // 中带（六部九寺）：各两座稍小衙署
    { x0: 8, z0: -184, x1: 48, z1: -144, face: 'W' },
    { x0: 54, z0: -184, x1: 96, z1: -144, face: 'W' },
    { x0: -48, z0: -184, x1: -8, z1: -144, face: 'E' },
    { x0: -96, z0: -184, x1: -54, z1: -144, face: 'E' },
  ];
  for (const o of offices) {
    // 皇城百司改用 **建筑层官署语法**（外垣+仪门+重檐大堂+廊庑+后堂），
    // 不再复用坊内民居的 proto.office（评审判"皇城跟复制粘贴的小房子一模一样"）。
    CHANGAN.buildArchOffice(ctx, o.x0, o.z0, o.x1, o.z1, base,
      CHANGAN.rngOf(ctx.seed, 'office-' + o.x0), o.face, o.z0 <= -192 ? 4 : 3);
  }
  // 左祖右社：太庙在东、太社在西（南带，临承天门街两侧，带琉璃剪边示礼制等级）
  CHANGAN.buildArchOffice(ctx, 12, -134, 56, -100, base, CHANGAN.rngOf(ctx.seed, 'taimiao'), 'W', 4);
  CHANGAN.buildArchOffice(ctx, -56, -134, -12, -100, base, CHANGAN.rngOf(ctx.seed, 'taishe'), 'E', 4);
  // 太庙正殿加琉璃剪边标识（于 office 正堂顶上加琉璃脊饰）
  proto.hall(ctx, 28, -134, 40, -128, base, { roof: 'xie', platform: 2, trim: PAL.glazeGreen, col: PAL.zhuBright, door: 'S' });
  proto.hall(ctx, -40, -134, -28, -128, base, { roof: 'xie', platform: 2, trim: PAL.glazeGreen, col: PAL.zhuBright, door: 'S' });
  // 沿街槐行（皇城无民居，街以槐荫为景）
  const rng = CHANGAN.rngOf(ctx.seed, 'huangcheng');
  for (let z = -214; z <= -104; z += 9) {
    for (const x of [-6, 4]) {
      const i = CHANGAN.fieldIndex(x, z);
      if (fields.topH[i] === fields.groundH[i] && !fields.road[i]) proto.tree(ctx, x, z, base, 'huai', rng);
    }
  }
  // 含光门过水涵洞 + 铁栅栏（考古细节）：皇城西墙下
  const hg = ctx.gates.find(g => g.name === '含光门');
  if (hg) {
    const x = hg.x, z = hg.z + 6;
    store.fill(x, base - 1, z, x + 1, base - 1, z + 3, PAL.canalWater);
    for (let k = 0; k < 4; k++) store.set(x + 1, base, z + k, PAL.iron); // 铁栅栏
  }
  ctx.counters.temples += 2;
}

// ---------------------------------------------------------------- 大明宫：丹凤门→含元殿（三层大台+龙尾道+二阁）→宣政→紫宸；太液池蓬莱；麟德殿
function buildDaMing(ctx) {
  const { CFG, store } = ctx;
  const D = CFG.DAMING;
  const base = ctx.baseDaming;
  const cx = 208;
  // 含元殿群：独立builder（含三重台/龙尾道/主体十三间/二阁非对称/飞廊/广场/廊庑；禁proto.hall主体）
  CHANGAN.buildHanyuanComplex(ctx, cx, base);

  // 宣政殿、紫宸殿（中轴北上，各自成院：围墙 + 南门 + 廊庑）
  ringCompound(ctx, cx - 14, -326, cx + 13, -306, base, { face: 'S', gx: cx });
  proto.hall(ctx, cx - 9, -322, cx + 8, -312, base, { roof: 'hip', platform: 2, trim: PAL.glazeGreen, door: 'S' });
  proto.colonnade(ctx, cx - 12, -310, cx - 12, -324, base);
  proto.colonnade(ctx, cx + 11, -310, cx + 11, -324, base);
  ringCompound(ctx, cx - 11, -346, cx + 10, -330, base, { face: 'S', gx: cx });
  proto.hall(ctx, cx - 7, -342, cx + 6, -334, base, { roof: 'xie', platform: 1, trim: PAL.glazeGreen, door: 'S' });
  // 麟德殿（西部宴饮区：前后勾连大殿简化）
  proto.hall(ctx, D.x0 + 12, -330, D.x0 + 30, -318, base, { roof: 'xie', platform: 2, trim: PAL.glazeBlue, door: 'E' });
  proto.hall(ctx, D.x0 + 14, -316, D.x0 + 28, -308, base, { roof: 'xie', platform: 1, door: 'E' });
  // 太液池（蓬莱池）+ 蓬莱山 + 环池回廊
  pond(ctx, 244, -362, 296, -322, base - 1, PAL.pondWater);
  // 蓬莱山（池中岛，大顶台承亭）
  const ix = 270, iz = -342;
  for (let r = 6; r >= 2; r--) {
    const y = base + (6 - r);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r) store.set(ix + dx, y, iz + dz, r % 2 ? PAL.loessDeep : PAL.stoneGrey);
  }
  proto.tree(ctx, ix - 1, iz - 1, base + 4, 'pine', CHANGAN.rngOf(ctx.seed, 'penglai'));
  proto.pavilion(ctx, ix + 1, iz + 1, base + 3, 'small');
  // 环池回廊（东岸一段）
  for (let z = -356; z <= -328; z++) {
    store.set(299, base + 1, z, PAL.zhu); store.set(299, base + 2, z, PAL.timber); store.set(299, base + 3, z, PAL.roofGrey);
  }
  ctx.counters.temples++;
}

// ---------------------------------------------------------------- 兴庆宫：龙池 + 花萼相辉楼 + 勤政务本楼 + 沉香亭（非对称）
function buildXingQing(ctx) {
  const { store } = ctx;
  // 宫域：隆庆坊整坊 + 永嘉坊南半
  const x0 = 226, x1 = 286, z0 = -30, z1 = 32;
  const base = groundAt(ctx, 256, 0);
  // 宫墙（非对称，区别于另两内）
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
    if (z === z1 && Math.abs(x - 256) <= 2) continue; // 南宫门
    const i = CHANGAN.fieldIndex(x, z);
    for (let y = 1; y <= 3; y++) store.set(x, groundAt(ctx, x, z) + y, z, y % 2 ? PAL.rammed : PAL.zhuDeep);
  }
  // 龙池（兴庆池，宫南）
  pond(ctx, 238, 6, 272, 24, base - 1, PAL.pondWater);
  // 花萼相辉楼（独立重楼builder：腰檐平座柱列递进临池，禁两hall叠加）
  CHANGAN.buildHuaeTower(ctx, 233, 12, base);
  // 勤政务本楼（宫南墙内临街）
  platform(ctx, 245, 26, 255, 31, base, 1, PAL.stoneGrey);
  proto.hall(ctx, 246, 27, 254, 30, base + 1, { roof: 'xie', platform: 0, col: PAL.zhuBright, door: 'S', windows: true });
  // 沉香亭（池北）
  proto.pavilion(ctx, 256, 2, base, 'big');
  // 北部宫殿区：兴庆殿、南薰殿（池北中轴院落）
  ringCompound(ctx, 232, -27, 282, -12, base, { face: 'S', gx: 256 });
  proto.hall(ctx, 248, -26, 264, -20, base, { roof: 'xie', platform: 1, col: PAL.zhuBright, trim: PAL.glazeGreen, door: 'S' }); // 南薰殿
  proto.hall(ctx, 234, -24, 244, -19, base, { roof: 'xie', platform: 1, door: 'S' }); // 兴庆殿
  proto.colonnade(ctx, 234, -14, 280, -14, base);
  // 龙池岸柳（疏密不一，不围池均摆）
  const rngXq = CHANGAN.rngOf(ctx.seed, 'longchi');
  for (const [wx, wz] of [[236, 8], [274, 12], [250, 26], [264, 26], [242, 4], [268, 4]]) {
    const i = CHANGAN.fieldIndex(wx, wz);
    if (!ctx.fields.water[i] && ctx.fields.topH[i] === ctx.fields.groundH[i]) proto.tree(ctx, wx, wz, base, 'willow', rngXq);
  }
  // 东北隅殿院
  proto.hall(ctx, 268, -26, 282, -18, base, { roof: 'xie', platform: 1, trim: PAL.glazeGreen, door: 'S' });
  ctx.counters.temples++;
}

// ---------------------------------------------------------------- 夹城复道：大明宫—兴庆宫—芙蓉园的封闭御道（贴东城墙内侧）
function buildJiaCheng(ctx) {
  const { store } = ctx;
  const x = 342;
  for (let z = -247; z <= 250; z++) {
    const base = groundAt(ctx, x, z);
    // 双墙夹道（西墙+东墙），顶覆廊板，每隔一段留望楼
    for (const dx of [0, 4]) {
      const i = CHANGAN.fieldIndex(x + dx, z);
      if (ctx.fields.road[i] > 0 || ctx.fields.water[i]) continue; // 穿街留洞
      store.set(x + dx, base + 1, z, PAL.rammed);
      store.set(x + dx, base + 2, z, PAL.rammedLight);
      if (z % 2 === 0) store.set(x + dx, base + 3, z, PAL.roofGrey);
    }
    if (z % 60 === 0) proto.cornerTower(ctx, x + 2, z, base + 3);
  }
  // 支道西入兴庆宫
  for (let xx = 288; xx <= 342; xx++) {
    const base = groundAt(ctx, xx, 12);
    store.set(xx, base + 1, 12, PAL.rammed); store.set(xx, base + 2, 12, PAL.rammedLight);
  }
}

// ================================================================ S8 水系（五渠成网、自流、有桥）
// 通用挖渠：沿折线开槽，水面 = 地表-1，沟床 = 地表-2；遇街架桥、遇坊墙开闸
function canal(ctx, pts, width, waterC) {
  const { store, fields } = ctx;
  const cells = new Set();
  for (let s = 0; s < pts.length - 1; s++) {
    let [x0, z0] = pts[s], [x1, z1] = pts[s + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 2 + 1;
    for (let t = 0; t <= steps; t++) {
      const x = Math.round(x0 + (x1 - x0) * t / steps), z = Math.round(z0 + (z1 - z0) * t / steps);
      for (let dx = -((width - 1) >> 1); dx <= (width >> 1); dx++) for (let dz = -((width - 1) >> 1); dz <= (width >> 1); dz++) {
        cells.add((x + dx) * 100000 + (z + dz));
      }
    }
  }
  for (const key of cells) {
    const x = Math.round(key / 100000), z = key - Math.round(key / 100000) * 100000;
    const i = CHANGAN.fieldIndex(x, z);
    if (i < 0 || i >= fields.road.length) continue;
    if (fields.road[i]) {
      // 跨街：石梁桥（桥面与街平）
      const g = fields.groundH[i];
      store.set(x, g, z, PAL.stoneWhite);
      fields.topColor[i] = PAL.stoneWhite;
      continue;
    }
    const g = fields.groundH[i];
    // 有建筑处不开渠：查fields与实体体素双保险（well/pavilion等未维护topH时仍能避让，防浮空）
    let hasAbove = fields.topH[i] > g;
    if (!hasAbove) { for (let yy = g + 1; yy <= g + 12; yy++) { if (store.get(x, yy, z)) { hasAbove = true; break; } } }
    if (hasAbove) continue;
    store.del(x, g, z);
    store.set(x, g - 2, z, PAL.loessDeep);
    store.set(x, g - 1, z, waterC || PAL.canalWater);
    fields.topH[i] = g - 1; fields.topColor[i] = waterC || PAL.canalWater;
    fields.water[i] = 1;
  }
}
function pond(ctx, x0, z0, x1, z1, waterY, waterC) {
  const { store, fields } = ctx;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    const g = fields.groundH[i];
    if (fields.topH[i] > g && fields.topColor[i] !== PAL.loess) continue;
    store.del(x, g, z);
    for (let y = waterY; y < g; y++) store.set(x, y, z, PAL.loessDeep);
    store.set(x, waterY, z, waterC);
    fields.topH[i] = waterY; fields.topColor[i] = waterC; fields.water[i] = 2;
  }
}
CHANGAN.pond = pond;
CHANGAN.canal = canal;

CHANGAN.stageWater = function (ctx) {
  const { store, fields, CFG } = ctx;
  const W = CFG.WORLD;
  // 渭水（城外北界一带）
  for (let x = W.x0; x <= W.x1; x++) for (let z = -366; z <= -358; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    store.del(x, fields.groundH[i], z);
    store.set(x, 0, z, PAL.riverSand); store.set(x, 1, z, PAL.weiWater);
    fields.topH[i] = 1; fields.topColor[i] = PAL.weiWater; fields.water[i] = 3;
  }
  // 龙首渠：自东入城 → 兴庆池 → 北折入大明宫太液池
  canal(ctx, [[352, -140], [300, -90], [280, -40], [268, -16]], 2);
  canal(ctx, [[268, -16], [262, -120], [262, -240], [268, -320]], 2);
  // 清明渠：自西入城，纵贯九坊入宫城
  canal(ctx, [[-352, 130], [-240, 130], [-160, 130], [-108, 110], [-108, -96], [-108, -236]], 2);
  // 永安渠：自西入城，经西市西侧北折（漕运）
  canal(ctx, [[-352, 190], [-260, 186], [-232, 170], [-232, 120]], 2);
  // 漕渠：西市卸货支渠（接永安渠入海池）
  canal(ctx, [[-232, 128], [-214, 118]], 1);
  // 黄渠：引潏水东南行，补曲江池
  canal(ctx, [[330, 360], [322, 300], [320, 260]], 2);
  // 曲江池（芙蓉园水域，东南角）
  pond(ctx, 292, 206, 346, 246, groundAt(ctx, 320, 226) - 1, PAL.qujiangWater);
  pond(ctx, 296, 250, 340, 280, groundAt(ctx, 320, 265) - 1, PAL.qujiangWater);
  // 曲江池小岛（堆山承亭）+ 紫云楼（南岸陆地地标楼）
  {
    const bx = 320, bz = 226, waterY = groundAt(ctx, 320, 226) - 1;
    for (let r = 5; r >= 2; r--) {
      const y = waterY + 1 + (5 - r);
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r) store.set(bx + dx, y, bz + dz, r % 2 ? PAL.loessDeep : PAL.stoneGrey);
    }
    proto.pavilion(ctx, bx, bz, waterY + 3, 'big');
    proto.tree(ctx, bx - 2, bz + 1, waterY + 4, 'apricot', CHANGAN.rngOf(ctx.seed, 'qujiang-isl'));
  }
  const { store: st } = ctx;
  st.fill(296, groundAt(ctx, 300, 244) + 1, 244, 304, groundAt(ctx, 300, 244) + 4, 250, PAL.zhu);
  proto.roof(ctx, 'xie', 296, 244, 304, 250, groundAt(ctx, 300, 244) + 5, { trim: PAL.glazeGreen });
  // 杏园（曲江西岸，小片杏树）
  const rng = CHANGAN.rngOf(ctx.seed, 'xingyuan');
  for (let k = 0; k < 8; k++) proto.tree(ctx, CHANGAN.rint(rng, 282, 290), CHANGAN.rint(rng, 220, 250), undefined, 'apricot', rng);
  ctx.progress('water', 1);
};

// ================================================================ S9 生活细节：街道槐行、柳岸、灯笼、南郊素净
CHANGAN.stageDetail = function (ctx) {
  const { fields, CFG } = ctx;
  const rng = CHANGAN.rngOf(ctx.seed, 'detail');
  const W = CFG.WORLD;
  // 槐行：御道沟外列槐（青槐夹道，不占坊地）
  const rows = [
    { x0: CFG.AXIS_X[0] - 2, x1: CFG.AXIS_X[0] - 2, z0: CFG.CITY.z0 + 6, z1: CFG.CITY.z1 - 6, step: 7 },
    { x0: CFG.AXIS_X[1] + 2, x1: CFG.AXIS_X[1] + 2, z0: CFG.CITY.z0 + 6, z1: CFG.CITY.z1 - 6, step: 7 },
    { x0: CFG.CITY.x0 + 6, x1: CFG.CITY.x1 - 6, z0: CFG.HENGJIE.z0 - 4, z1: CFG.HENGJIE.z0 - 4, step: 8 },
    { x0: CFG.CITY.x0 + 6, x1: CFG.CITY.x1 - 6, z0: CFG.HENGJIE.z1 + 4, z1: CFG.HENGJIE.z1 + 4, step: 8 },
  ];
  for (const r of rows) {
    if (r.x0 === r.x1) for (let z = r.z0; z <= r.z1; z += r.step) tryTree(ctx, r.x0, z, 'huai', rng);
    else for (let x = r.x0; x <= r.x1; x += r.step) tryTree(ctx, x, r.z0, 'huai', rng);
  }
  // 地面铺装纹理：街道用 4×4 石板分格，广场/空地用夯土明暗斑
  // 评审判"底层地面是无纹理纯色平板，占画面最大面积，持续制造正射贴图感"。
  {
    const { store } = ctx;
    const GROUND_C = new Set([PAL.loess, PAL.loessLight, PAL.loessDeep, PAL.brickPave, PAL.fieldEarth, PAL.riverSand, PAL.rammedLight]);
    for (let x = W.x0; x <= W.x1; x++) for (let z = W.z0; z <= W.z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (fields.water[i]) continue;
      if (fields.topH[i] !== fields.groundH[i]) continue;   // 被建筑/树压住的地面不动
      const tc = fields.topColor[i];
      if (!GROUND_C.has(tc)) continue;
      const g = fields.groundH[i];
      let c;
      if (fields.road[i]) {
        const lv = fields.road[i];
        if (lv === 1) {
          // 御道：中央天子白灰道，两旁平实夯土
          const isCenter = (x >= -2 && x <= 1);
          c = isCenter ? PAL.rammedLight : PAL.loess;
        } else if (lv <= 3) {
          // 主要干道与横街：整体连续夯土，柔和低对比微差
          c = (((x >> 4) + (z >> 4)) & 1) ? PAL.loessLight : PAL.loess;
        } else {
          // 坊内十字街与巷曲：质朴素土
          c = PAL.loess;
        }
      } else {
        // 广场与坊内地坪：统一沉稳底色，殿庭广场用平整青砖，普通坊内用浅夯土
        const inPlaza = (z >= CFG.HENGJIE.z0 && z <= CFG.HENGJIE.z1) || (z <= -260 && z >= -290 && Math.abs(x - 208) <= 40);
        c = inPlaza ? PAL.brickPave : PAL.loess;
      }
      store.set(x, g, z, c);
      fields.topColor[i] = c;
    }
  }
  // 渠岸柳
  for (let x = W.x0; x <= W.x1; x += 5) for (let z = W.z0; z <= W.z1; z += 5) {
    const i = CHANGAN.fieldIndex(x, z);
    if (fields.water[i] === 1) tryTree(ctx, x + 2, z + 1, 'willow', rng) || tryTree(ctx, x - 2, z - 1, 'willow', rng);
  }
  // 坊门、市门灯笼（挂门柱顶，暮后点亮：glow 材质）
  for (const d of ctx.doors) {
    const { store } = ctx;
    // 门柱在门洞外侧一格：NS 门沿 x、EW 门沿 z
    const px = d.axis === 'NS' ? d.cells[0][0] - 1 : d.cells[0][0];
    const pz = d.axis === 'NS' ? d.cells[0][1] : d.cells[0][1] - 1;
    store.set(px, d.base + 5, pz, PAL.lantern);
    ctx.counters.lamps++;
  }
  // 城里散点井台（十字街坊口）
  for (const w of ctx.wards) {
    if (w.type !== 'ward' || w.small) continue;
    if (w.base == null || CHANGAN.customWardOccupies(w)) continue; // 宫殿园林占用坊不设
    const rng2 = CHANGAN.rngOf(ctx.seed, 'well-' + w.id);
    if (rng2() < 0.5) {
      const cx = (w.x0 + w.x1) >> 1, cz = (w.z0 + w.z1) >> 1;
      if (CHANGAN.areaFree(ctx, cx + 3, cz + 3, 2, 2)) proto.well(ctx, cx + 3, cz + 3, w.base);
    }
  }
  ctx.progress('detail', 1);
};
function tryTree(ctx, x, z, kind, rng) {
  const { fields } = ctx;
  const i = CHANGAN.fieldIndex(x, z);
  if (i < 0 || i >= fields.road.length) return false;
  if (fields.road[i] || fields.water[i]) return false;
  if (fields.topH[i] !== fields.groundH[i]) return false;
  proto.tree(ctx, x, z, fields.groundH[i], kind, rng);
  return true;
}

// ================================================================ S10 封壳与字段刷新
CHANGAN.stageSeal = function (ctx) {
  const { store, fields } = ctx;
  // 体内无需剔除（全程壳式建造）；此处刷新 topH/topColor（建造期部分 pass 未维护）
  fields.topH.fill(-1);
  for (const [k, c] of store.map) {
    const x = CHANGAN.unpackX(k), y = CHANGAN.unpackY(k), z = CHANGAN.unpackZ(k);
    const i = CHANGAN.fieldIndex(x, z);
    if (y > fields.topH[i]) { fields.topH[i] = y; fields.topColor[i] = c; }
  }
  ctx.progress('seal', 1);
};
})();
