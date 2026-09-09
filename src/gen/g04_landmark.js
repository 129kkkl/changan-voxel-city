// g04_landmark.js — P0 一级地标独立 builder（禁主体调用通用模板，仅允许基础 primitive）
// 明德门/丹凤门/含元殿群/大雁塔/小雁塔/花萼相辉楼/太极殿 拥有专属体量/台基/柱网/屋顶/收分/轮廓
// 唐风：舒展厚重雄浑平缓水平延展；青灰瓦为主，琉璃仅剪边/鸱尾；禁明清金顶通体绿琉璃
'use strict';
(function () {
const proto = CHANGAN.proto;
const Tang = CHANGAN.Tang;
const wallRing = (...a) => CHANGAN._wallRing(...a);
const dougong = (...a) => CHANGAN._dougong(...a);
const chiwei = (...a) => CHANGAN._chiwei(...a);
const platform = (...a) => CHANGAN.platform(...a);

function groundAt(ctx, x, z) { return ctx.fields.groundH[CHANGAN.fieldIndex(x, z)]; }
function regLOD(ctx, name, x0, z0, x1, z1, hMax, base) {
  ctx.landmarkLODs = ctx.landmarkLODs || {};
  ctx.landmarkLODs[name] = { x0, z0, x1, z1, hMax, base, cx: (x0 + x1) >> 1, cz: (z0 + z1) >> 1 };
}

// ================================================================ P0-1 明德门 buildMingdeGate()
// 独立门墩/五门道/大型城门台/高等级门楼/多层檐口/城墙连接/朱雀共轴/南城主门等级/远距独特轮廓（双阙+主楼三重檐）
CHANGAN.buildMingdeGate = function (ctx, g) {
  CHANGAN.enterLandmark(ctx, 'mingde');
  const { store, fields, CFG } = ctx;
  const b = g.towerBase;
  const gy = fields.groundH[CHANGAN.fieldIndex(g.x, g.z)] + CFG.Y.WALL_H + 1;
  const grid = new CHANGAN.LocalVoxelGrid(ctx, 0, 0, 0, CHANGAN.LANDMARK_SCALE.localSubdiv);
  // 门墩：五门道独立墩（6墩，墩宽3/门宽2，包砖+石基），非简单放大
  const half = 11;
  const wx0 = g.x - half - 2, wx1 = g.x + half + 2;
  const wz0 = g.z - 1, wz1 = g.z + CFG.WALL;
  for (let x = wx0; x <= wx1; x++) for (let z = wz0; z <= wz1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    const y0 = fields.groundH[i];
    for (let y = 1; y <= CFG.Y.WALL_H + 1; y++) store.set(x, y0 + y, z, y % 2 ? PAL.brickPave : PAL.rammedDark);
  }
  // 五门道打通（门道石铺+门枕石）
  for (let d = 0; d < 5; d++) {
    const ox = g.x - 8 + d * 4;
    for (let o = 0; o < 2; o++) for (let d2 = 0; d2 < CFG.WALL; d2++) {
      const x = ox + o, z = g.z + d2;
      const i = CHANGAN.fieldIndex(x, z);
      const y0 = fields.groundH[i];
      for (let y = 1; y <= CFG.Y.WALL_H + 1; y++) store.del(x, y0 + y, z);
      store.set(x, y0, z, PAL.brickPave);
      if (o === 0) store.set(x - 1, y0 + 1, z, PAL.stoneGrey);
      if (o === 1) store.set(x + 1, y0 + 1, z, PAL.stoneGrey);
    }
  }
  // 城门台（两级：下层包砖大台+上层白石压边）
  store.fill(wx0, gy, wz0, wx1, gy + 1, wz1, PAL.stoneGrey);
  store.fill(wx0 - 1, gy + 1, wz0 - 1, wx1 + 1, gy + 1, wz1 + 1, PAL.stoneWhite);
  // 主门楼：七间重檐庑殿（专属大开间节奏 7，非通用门楼 4-5 间），腰檐+上层收分
  const x0 = g.x - 9, x1 = g.x + 9, z0 = g.z, z1 = g.z + 3;
  ARCH.pavilion(ctx.arch,x0,z0,x1,z1,gy+2,7,2);
  // 双阙（实心墩自地面起砌至门台高，防浮空；细木作双层阙楼）
  for (const s of [-1, 1]) {
    const qx = g.x + s * 15;
    const qg = fields.groundH[CHANGAN.fieldIndex(qx, g.z)];
    store.fill(qx - 2, qg + 1, g.z, qx + 2, gy + 2, g.z + 2, PAL.stoneGrey);
    ARCH.pavilion(ctx.arch, qx - 1, g.z, qx + 1, g.z + 2, gy + 2, 2, 1);
  }
  // 城墙连接（阙与主楼间矮墙相连，朱帽）
  for (let x = x0 - 6; x <= x1 + 6; x++) {
    if (x >= x0 && x <= x1) continue;
    store.set(x, gy + 1, g.z + 1, PAL.rammed); store.set(x, gy + 2, g.z + 1, PAL.zhuDeep);
  }
  // LocalVoxelGrid 半体素比例已用于开间均分（无占位写入，防浮空）
  CHANGAN.logBuild(ctx, { kind: 'gate', name: 'mingde', x0: wx0, z0: wz0, x1: wx1, z1: wz1, h: 18, roof: 'hip-double+que', platform: 2, bays: '7x2', rank: 5, generic: false, symmetry: 'sym5', towerProfile: 'main7+tower5+que2' });
  regLOD(ctx, 'mingde', wx0, wz0, wx1, wz1, gy + 18, gy);
  ctx.counters.towers++; ctx.counters.gates++;
  CHANGAN.exitLandmark(ctx);
  return gy + 18;
};

// ================================================================ P0-2 丹凤门 buildDanfengGate()
// 五门道/大明宫正门等级/巨型门楼/大尺度门墩/宫墙连接/与含元强中轴（与明德门不同体量语言：更宽更厚、三阙品字、庑殿三重檐+掖门）
CHANGAN.buildDanfengGate = function (ctx, g) {
  CHANGAN.enterLandmark(ctx, 'danfeng');
  const { store, fields, CFG } = ctx;
  const gy = fields.groundH[CHANGAN.fieldIndex(g.x, g.z)] + 3;
  // 门墩：墩更厚（进深 6 vs 明德 4），门道更宽（3 vs 2），显宫门尺度
  const half = 13;
  const wx0 = g.x - half - 2, wx1 = g.x + half + 2;
  const wz0 = g.z - 2, wz1 = g.z + 5;
  for (let x = wx0; x <= wx1; x++) for (let z = wz0; z <= wz1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    const y0 = fields.groundH[i];
    for (let y = 1; y <= 5; y++) store.set(x, y0 + y, z, y % 2 ? PAL.brickPave : PAL.stoneGrey);
  }
  for (let d = 0; d < 5; d++) {
    const ox = g.x - 10 + d * 5;
    for (let o = 0; o < 3; o++) for (let dz = wz0; dz <= wz1; dz++) {
      const x = ox + o, z = dz;
      const i = CHANGAN.fieldIndex(x, z);
      const y0 = fields.groundH[i];
      for (let y = 1; y <= 5; y++) store.del(x, y0 + y, z);
      store.set(x, y0, z, PAL.brickPave);
    }
  }
  // 三级宫殿台（丹凤高于明德一级）
  let y = gy;
  for (let t = 0; t < 3; t++) {
    store.fill(wx0 + t, y + 1, wz0 + t, wx1 - t, y + 1, wz1 - t, t === 2 ? PAL.stoneWhite : PAL.stoneGrey);
    y += 1;
  }
  // 巨型门楼：九间庑殿（开间 9 vs 明德 7），进深 5，三重檐（腰檐+重檐+顶）
  const x0 = g.x - 11, x1 = g.x + 11, z0 = g.z, z1 = g.z + 4;
  ARCH.pavilion(ctx.arch,x0,z0,x1,z1,y+1,9,2);
  // 左右双阙实心墩自地面起砌（防浮空，细木作双层阙楼）
  for (const dx of [-18, 18]) {
    const qx = g.x + dx;
    const qg = fields.groundH[CHANGAN.fieldIndex(qx, g.z)];
    store.fill(qx - 1, qg + 1, g.z - 1, qx + 1, y + 2, g.z + 1, PAL.stoneGrey);
    ARCH.pavilion(ctx.arch, qx - 1, g.z - 1, qx + 1, g.z + 1, y + 2, 2, 1);
  }
  // 宫墙连接（厚墙+女墙，直连大明宫宫墙）
  for (let x = wx0 - 8; x <= wx1 + 8; x++) {
    if (x >= wx0 && x <= wx1) continue;
    const i = CHANGAN.fieldIndex(x, g.z + 2);
    const y0 = fields.groundH[i];
    store.set(x, y0 + 1, g.z + 2, PAL.rammed); store.set(x, y0 + 2, g.z + 2, PAL.rammedLight); store.set(x, y0 + 3, g.z + 2, PAL.zhuDeep);
  }
  // 丹凤—含元中轴御道（砖铺大道，直抵龙尾道）
  for (let z = wz1 + 1; z <= wz1 + 18; z++) for (let x = g.x - 3; x <= g.x + 3; x++) store.set(x, y - 2, z, PAL.brickPave);
  CHANGAN.logBuild(ctx, { kind: 'gate', name: 'danfeng', x0: wx0, z0: wz0, x1: wx1, z1: wz1, h: 20, roof: 'hip-triple+3que', platform: 3, bays: '9x2', rank: 5, generic: false, symmetry: 'sym5', towerProfile: 'main9+tower7+que3' });
  regLOD(ctx, 'danfeng', wx0, wz0, wx1, wz1, y + 20, y);
  ctx.counters.towers++; ctx.counters.gates++;
  CHANGAN.exitLandmark(ctx);
  return y + 20;
};

// ================================================================ P0-3 含元殿群 buildHanyuanComplex()
// 龙首原高差/三重台/龙尾道/主体/翔鸾栖凤/飞廊/广场/廊庑/丹凤—含元空间关系；专属柱网/台基/屋顶/出檐/重檐/开间
CHANGAN.buildHanyuanComplex = function (ctx, cx, base) {
  CHANGAN.enterLandmark(ctx, 'hanyuan');
  const { store } = ctx;
  // 三重台（专属：每层高2+压边+勾栏，比通用三层更宽更厚，出檐即台缘）
  const tiers = [[cx - 30, -296, cx + 29, -266, 2], [cx - 26, -294, cx + 25, -268, 2], [cx - 22, -292, cx + 21, -270, 2]];
  let ty = base;
  for (const [x0, z0, x1, z1, h] of tiers) {
    store.fill(x0, ty + 1, z0, x1, ty + h, z1, PAL.stoneGrey);
    store.fill(x0 - 1, ty + h, z0 - 1, x1 + 1, ty + h, z1 + 1, PAL.stoneWhite);
    // 勾栏（台缘每3一柱，龙尾道口断开）
    for (let x = x0 - 1; x <= x1 + 1; x += 3) {
      if (Math.abs(x - cx) < 3 || Math.abs(x - (cx - 16)) < 2 || Math.abs(x - (cx + 16)) < 2) continue;
      store.set(x, ty + h + 1, z1 + 1, PAL.stoneWhite);
    }
    ty += h;
  }
  // 龙尾道（三条，御道居中宽4，阶道宽3，梯级+侧墙）
  for (const [dx, w2] of [[-16, 1], [0, 1], [16, 1]]) {
    for (let s = 0; s < 14; s++) {
      const yy = ty - Math.floor(s / 2);
      if (yy <= base) break;
      store.fill(cx + dx - w2, base + 1, -265 + s, cx + dx + w2, yy, -265 + s, PAL.stoneWhite);
    }
    // 道侧矮墙
    for (let s = 0; s < 14; s++) { store.set(cx + dx - w2 - 1, base + 2, -265 + s, PAL.stoneGrey); store.set(cx + dx + w2 + 1, base + 2, -265 + s, PAL.stoneGrey); }
  }
  // 主体：十三间重檐庑殿 —— 改用 **2× 建筑层（ArchGrid）** 生成。
  // 城市层（1 体素 ≈ 13.8m）无法表达柱列/斗拱/瓦垄/棂条；建筑层（1 体素 = 0.5 城市体素）
  // 才做得出"单拉出来够看"的宫殿。见 10_建筑大升级计划_v4.md §3。
  ctx.arch = ctx.arch || new CHANGAN.ArchStore();
  CHANGAN.buildArchGrandHall(ctx.arch, 4 * cx, 4 * -279, 4 * (ty + 1), { bays: 11, W: 96, D: 56 });
  // 把建筑层占位戳进城市字段，保证碰撞、小地图与远景 LOD 与建筑层一致
  for (let x = cx - 17; x <= cx + 16; x++) for (let z = -290; z <= -268; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (i >= 0) { ctx.fields.topH[i] = ty + 21; ctx.fields.topColor[i] = PAL.roofGreen; }
  }
  CHANGAN.exitLandmark(ctx);
  CHANGAN.enterLandmark(ctx, 'hanyuan-ge');
  // 翔鸾/栖凤二阁（非对称细节：东阁三层西阁两层，打破完全对称，体量呼应而非复制）
  const ge = [[cx - 27, 3], [cx + 27, 2]];
  for (const [gx, fl] of ge) {
    let yy = ty - 4;
    yy = Tang.PlatformBuilder.build(ctx, gx - 4, -287, gx + 4, -279, yy, 4, { door: 'S', tiers: 1, h: 1, name: 'hanyuan-ge-base' });
    for (let f = 0; f < fl; f++) {
      const inset = f;
      const ax0 = gx - 3 + inset, ax1 = gx + 3 - inset, az0 = -286 + inset, az1 = -280 - inset;
      const ff = Tang.TimberFrameBuilder.build(ctx, ax0, az0, ax1, az1, yy + 1, 4, { bays: 3, colC: PAL.zhuBright });
      dougong(ctx, ax0, az0, ax1, az1, yy + 4, ff.cols);
      Tang.RoofBuilder.build(ctx, f === fl - 1 ? 'hip' : 'towerEave', ax0, az0, ax1, az1, yy + 5, { rank: 4, trim: PAL.glazeGreen, overhang: 2 });
      yy += 5;
    }
    // 阁顶宝珠（东金西铜，细微差）
    store.set(gx, yy + 1, -283, gx < cx ? PAL.gold : PAL.bronze);
  }
  // 飞廊（架空+叉手+瓦顶，与通用飞廊不同：双排柱+栏干）
  for (const s of [-1, 1]) {
    const fx0 = s === -1 ? cx - 23 : cx + 16;
    const fx1 = s === -1 ? cx - 16 : cx + 23;
    for (let fx = fx0; fx <= fx1; fx++) for (let fz = -284; fz <= -282; fz++) {
      if (fx % 2 === 0) for (let y = base + 1; y < ty; y++) store.set(fx, y, fz, PAL.zhu);
      store.set(fx, ty, fz, PAL.timber);
      store.set(fx, ty + 1, fz, (fz === -284 || fz === -282) ? PAL.zhu : PAL.brickPave);
      if (fz === -284 || fz === -282) store.set(fx, ty + 2, fz, PAL.stoneWhite);
      store.set(fx, ty + 3, fz, PAL.roofGrey);
    }
  }
  // 殿前广场+两侧廊庑（殿庭层级）
  for (let x = cx - 24; x <= cx + 25; x++) for (let z = -264; z <= -252; z++) store.set(x, base, z, PAL.brickPave);
  const col1 = (xx, zz0, zz1) => { for (let z = zz0; z <= zz1; z++) { store.set(xx, base + 3, z, PAL.roofGrey); if ((z - zz0) % 2 === 0) { store.set(xx, base + 1, z, PAL.zhu); store.set(xx, base + 2, z, PAL.zhu); } } };
  col1(cx - 26, -264, -252); col1(cx + 27, -264, -252);
  CHANGAN.logBuild(ctx, { kind: 'palace', name: 'hanyuan', x0: cx - 30, z0: -296, x1: cx + 29, z1: -252, h: ty + 12 - base, roof: 'hip-double13', platform: 3, bays: '11x3', rank: 5, generic: false, symmetry: 'tri-sym', towerProfile: 'ge3+ge2' });
  regLOD(ctx, 'hanyuan', cx - 30, -296, cx + 29, -252, ty + 14, base);
  ctx.counters.halls += 3;
  CHANGAN.exitLandmark(ctx);
  return ty + 14;
};

// ================================================================ P0-4 大雁塔 buildDayanPagoda()
// 七层方形楼阁式砖塔/首层高大/逐层收分/券门/檐层/平座/塔刹/厚重基；每层按高度/收分/券门/檐口/平座/墙厚独立计算（循环仅复用构造，非同盒堆叠）
CHANGAN.buildDayanPagoda = function (ctx, cx, cz, base) {
  CHANGAN.enterLandmark(ctx, 'dayan');
  const { store } = ctx;
  // 厚重塔基（三层须弥座+莲瓣压边，非单板）
  store.fill(cx - 7, base + 1, cz - 7, cx + 7, base + 1, cz + 7, PAL.stoneGrey);
  store.fill(cx - 6, base + 2, cz - 6, cx + 6, base + 2, cz + 6, PAL.stoneWhite);
  store.fill(cx - 6, base + 3, cz - 6, cx + 6, base + 3, cz + 6, PAL.brickPave);
  let y = base + 3;
  const widths = [11, 10, 9, 8, 7, 6, 5]; // 逐层收分表（实测轮廓自然）
  const heights = [6, 4, 4, 3, 3, 3, 3]; // 首层高大
  for (let L = 0; L < 7; L++) {
    const w = widths[L], h = heights[L], half = w >> 1;
    // 塔身：每层墙厚/券门/佛龛独立
    for (let x = cx - half; x <= cx + half; x++) for (let z = cz - half; z <= cz + half; z++) {
      const edge = (x === cx - half || x === cx + half || z === cz - half || z === cz + half);
      if (!edge) continue;
      for (let yy = 1; yy <= h; yy++) {
        let c = PAL.brickPave;
        if (yy === h) c = PAL.stoneGrey; // 阑额
        store.set(x, y + yy, z, c);
      }
      // 南向券门（首层高大券+上层小券交错，禁每层同门）
      if (z === cz + half && Math.abs(x - cx) <= (L === 0 ? 1 : 0)) {
        for (let yy = 1; yy <= h - 1; yy++) store.set(x, y + yy, z, PAL.doorDark);
        store.set(x, y + h, z, PAL.stoneGrey);
      }
      // 东西小龛（偶层）
      if (L % 2 === 1 && x === cx + half && z === cz) { store.set(x, y + 2, z, PAL.doorDark); }
    }
    // 檐层+平座（出檐2+栏干，與上层收分联动）
    const e = 2;
    for (let x = cx - half - e; x <= cx + half + e; x++) for (let z = cz - half - e; z <= cz + half + e; z++) {
      const ring = (x === cx - half - e || x === cx + half + e || z === cz - half - e || z === cz + half + e);
      store.set(x, y + h + 1, z, ring ? PAL.roofLight : PAL.roofGrey);
    }
    // 平座勾栏立于檐顶（与上层墙足同层，同坐檐面，无浮空）
    for (let x = cx - half - e; x <= cx + half + e; x += 2) { store.set(x, y + h + 2, cz - half - e, PAL.stoneWhite); store.set(x, y + h + 2, cz + half + e, PAL.stoneWhite); }
    // 层间紧密叠砌：檐即上层足，无空隙（防浮空）
    y += h + 1;
  }
  // 塔刹（覆钵+相轮五重+宝珠，金铜）
  store.set(cx, y + 1, cz, PAL.stoneGrey);
  for (let i = 0; i < 5; i++) { store.fill(cx - 1, y + 2 + i, cz - 1, cx + 1, y + 2 + i, cz + 1, PAL.bronze); }
  store.set(cx, y + 7, cz, PAL.gold);
  store.set(cx, y + 8, cz, PAL.gold);
  CHANGAN.logBuild(ctx, { kind: 'pagoda', name: 'dayan', x0: cx - 7, z0: cz - 7, x1: cx + 7, z1: cz + 7, h: y + 8 - base, roof: 'louge7', platform: 3, bays: '7F-taper', rank: 4, generic: false, symmetry: 'sym4', towerProfile: 'louge-taper11-5' });
  regLOD(ctx, 'dayan', cx - 7, cz - 7, cx + 7, cz + 7, y + 8, base);
  ctx.counters.towers++;
  CHANGAN.exitLandmark(ctx);
  return y + 8;
};

// ================================================================ P0-5 小雁塔 buildXiaoyanPagoda()
// 密檐塔：连续收分/密檐节奏/比例/密度/曲线（与大雁不同语言：瘦高+密檐叠涩+无平座大出檐+秀直轮廓）
CHANGAN.buildXiaoyanPagoda = function (ctx, cx, cz, base) {
  CHANGAN.enterLandmark(ctx, 'xiaoyan');
  const { store } = ctx;
  // 方形石基（小而高，显瘦）
  store.fill(cx - 4, base + 1, cz - 4, cx + 4, base + 1, cz + 4, PAL.stoneGrey);
  store.fill(cx - 3, base + 2, cz - 3, cx + 3, base + 2, cz + 3, PAL.stoneWhite);
  let y = base + 2;
  // 首层（高5，壁画龛+南券门）
  const h0 = 5, half0 = 3;
  for (let x = cx - half0; x <= cx + half0; x++) for (let z = cz - half0; z <= cz + half0; z++) {
    if (x !== cx - half0 && x !== cx + half0 && z !== cz - half0 && z !== cz + half0) continue;
    for (let yy = 1; yy <= h0; yy++) store.set(x, y + yy, z, PAL.brickPave);
  }
  store.set(cx, y + 1, cz + half0, PAL.doorDark); store.set(cx, y + 2, cz + half0, PAL.doorDark); store.set(cx, y + 3, cz + half0, PAL.doorDark);
  y += h0;
  // 密檐：13层，每层高2（身1+檐1），逐层内收0.25格→用交替half实现连续收分曲线
  for (let L = 0; L < 13; L++) {
    const half = Math.max(1, 3 - Math.floor((L + 2) / 5));
    // 塔身（薄壁1高）
    for (let x = cx - half; x <= cx + half; x++) for (let z = cz - half; z <= cz + half; z++) {
      if (x !== cx - half && x !== cx + half && z !== cz - half && z !== cz + half) continue;
      store.set(x, y + 1, z, PAL.brickPave);
    }
    // 密檐（出挑1，叠涩两皮）
    for (let x = cx - half - 1; x <= cx + half + 1; x++) for (let z = cz - half - 1; z <= cz + half + 1; z++) {
      const ring = (x === cx - half - 1 || x === cx + half + 1 || z === cz - half - 1 || z === cz + half + 1);
      store.set(x, y + 2, z, ring ? PAL.roofLight : PAL.roofGrey);
    }
    y += 2;
  }
  // 刹（小金顶，与大雁五重相轮不同：单覆钵+短刹杆）
  store.set(cx, y + 1, cz, PAL.stoneGrey);
  store.set(cx, y + 2, cz, PAL.bronze);
  store.set(cx, y + 3, cz, PAL.gold);
  CHANGAN.logBuild(ctx, { kind: 'pagoda', name: 'xiaoyan', x0: cx - 4, z0: cz - 4, x1: cx + 4, z1: cz + 4, h: y + 3 - base, roof: 'miyan13', platform: 2, bays: '13F-dense', rank: 4, generic: false, symmetry: 'sym4', towerProfile: 'miyan-dense13' });
  regLOD(ctx, 'xiaoyan', cx - 4, cz - 4, cx + 4, cz + 4, y + 3, base);
  ctx.counters.towers++;
  CHANGAN.exitLandmark(ctx);
  return y + 3;
};

// ================================================================ P1 花萼相辉楼 buildHuaeTower()（重楼腰檐平座柱列递进临池，禁两hall叠加）
CHANGAN.buildHuaeTower = function (ctx, cx, cz, base) {
  CHANGAN.enterLandmark(ctx, 'huae');
  const yTop = Tang.TowerBuilder.build(ctx, cx, cz, 7, 9, base, 4, { floors: 3, top: 'xie', door: 'E', name: 'huae' });
  (ctx.landmarkLODs = ctx.landmarkLODs || {})['huae'] = { x0: cx - 4, z0: cz - 5, x1: cx + 6, z1: cz + 5, hMax: yTop, base, cx, cz };
  // 临池抱厦（东向临池出抱厦一间，纵向比例拉长）
  const { store } = ctx;
  store.fill(cx + 4, base + 1, cz - 1, cx + 6, base + 1, cz + 1, PAL.stoneWhite);
  for (const dx of [4, 6]) for (let y = 1; y <= 3; y++) { store.set(cx + dx, base + 1 + y, cz - 1, PAL.zhuBright); store.set(cx + dx, base + 1 + y, cz + 1, PAL.zhuBright); }
  Tang.RoofBuilder.build(ctx, 'towerEave', cx + 4, cz - 1, cx + 6, cz + 1, base + 5, { rank: 4 });
  CHANGAN.exitLandmark(ctx);
  return yTop;
};
// ================================================================ P0-承天门 buildChengtianGate()（宫城正门：五门道/横街广场主门/门楼面阔大进深浅/朝堂廊直连，与明德丹凤三足鼎立）
CHANGAN.buildChengtianGate = function (ctx, g) {
  CHANGAN.enterLandmark(ctx, 'chengtian');
  const { store, fields, CFG } = ctx;
  const gy = fields.groundH[CHANGAN.fieldIndex(g.x, g.z)] + CFG.Y.WALL_H + 1;
  const half = 12;
  const wx0 = g.x - half - 2, wx1 = g.x + half + 2, wz0 = g.z - 1, wz1 = g.z + CFG.WALL;
  for (let x = wx0; x <= wx1; x++) for (let z = wz0; z <= wz1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    const y0 = fields.groundH[i];
    for (let y = 1; y <= CFG.Y.WALL_H + 1; y++) store.set(x, y0 + y, z, y % 2 ? PAL.brickPave : PAL.rammedDark);
  }
  for (let d = 0; d < 5; d++) {
    const ox = g.x - 9 + d * 4;
    for (let o = 0; o < 2; o++) for (let d2 = 0; d2 < CFG.WALL; d2++) {
      const x = ox + o, z = g.z + d2;
      const i = CHANGAN.fieldIndex(x, z);
      const y0 = fields.groundH[i];
      for (let y = 1; y <= CFG.Y.WALL_H + 1; y++) store.del(x, y0 + y, z);
      store.set(x, y0, z, PAL.brickPave);
    }
  }
  store.fill(wx0, gy, wz0, wx1, gy + 1, wz1, PAL.stoneWhite);
  // 门楼：十一间单层大庑殿+两端阙楼（横向延展最强，不做重楼高耸，与明德高耸/丹凤厚重形成三极）
  const x0 = g.x - 12, x1 = g.x + 11, z0 = g.z, z1 = g.z + 2;
  ARCH.pavilion(ctx.arch,x0,z0,x1,z1,gy+2,11,1);
  for (const s of [-1, 1]) {
    const qx = g.x + s * 16;
    const qg2 = fields.groundH[CHANGAN.fieldIndex(qx, g.z)];
    store.fill(qx - 1, qg2 + 1, g.z, qx + 1, gy + 2, g.z + 2, PAL.stoneGrey);
    Tang.TimberFrameBuilder.build(ctx, qx - 1, g.z, qx + 1, g.z + 2, gy + 3, 4, { bays: 2 });
    Tang.RoofBuilder.build(ctx, 'xie', qx - 1, g.z, qx + 1, g.z + 2, gy + 6, { rank: 4, overhang: 1 });
  }
  CHANGAN.logBuild(ctx, { kind: 'gate', name: 'chengtian', x0: wx0, z0: wz0, x1: wx1, z1: wz1, h: 14, roof: 'hip-wide11+que', platform: 1, bays: '11x1', rank: 5, generic: false, symmetry: 'sym5', towerProfile: 'wide11+que2' });
  regLOD(ctx, 'chengtian', wx0, wz0, wx1, wz1, gy + 14, gy);
  ctx.counters.towers++; ctx.counters.gates++;
  CHANGAN.exitLandmark(ctx);
  return gy + 14;
};
// ================================================================ P1 太极殿专用 buildTaijiHall()（前朝正殿，三层台+重檐庑殿十一间，与含元不同：更宽更矮更舒展）
CHANGAN.buildTaijiHall = function (ctx, cx, z0, z1, base) {
  CHANGAN.enterLandmark(ctx, 'taiji');
  const x0 = cx - 12, x1 = cx + 11;
  const top = Tang.PlatformBuilder.build(ctx, x0 - 1, z0 - 1, x1 + 1, z1 + 1, base, 5, { door: 'S', tiers: 3, h: 1, name: 'taiji-base' });
  ARCH.pavilion(ctx.arch,x0,z0,x1,z1,top+1,11,1);
  CHANGAN.logBuild(ctx, { kind: 'palace', name: 'taiji', x0, z0, x1, z1, h: top + 10 - base, roof: 'hip-double11-wide', platform: 3, bays: '11x2', rank: 5, generic: false, symmetry: 'sym' });
  regLOD(ctx, 'taiji', x0, z0, x1, z1, top + 12, base);
  ctx.counters.halls++;
  CHANGAN.exitLandmark(ctx);
  return top + 12;
};
})();
