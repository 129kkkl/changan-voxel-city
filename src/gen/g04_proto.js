// g04_proto.js — 唐代建筑原型库与构件语法重构
// 遵循唐代木构大木作规制：举折平缓、出檐深远、真开间柱网、内凹直棂窗、柱头出挑斗栱、内卷弯月鸱吻、通透院落与门道
'use strict';
CHANGAN.proto = {};
CHANGAN.Tang = {};
CHANGAN.buildLog = null;
CHANGAN.logBuild = function (ctx, e) {
  ctx.buildLog = ctx.buildLog || [];
  // e: {kind,name,x0,z0,x1,z1,h,roof,platform,bays,rank,generic,symmetry}
  const w = (e.x1 - e.x0 + 1), d = (e.z1 - e.z0 + 1), h = e.h || 1;
  e.footprintRatio = +(w / Math.max(1, d)).toFixed(2);
  e.heightRatio = +(h / Math.max(1, Math.max(w, d))).toFixed(2);
  e.roofProfile = e.roof || 'none';
  e.platformProfile = 't' + (e.platform || 0);
  e.towerProfile = e.towerProfile || 'none';
  e.bayPattern = e.bays || '0x0';
  e.symmetryMode = e.symmetry || 'sym';
  const s = (e.name || e.kind) + '|' + e.footprintRatio + '|' + e.heightRatio + '|' + e.roofProfile + '|' + e.platformProfile + '|' + e.bayPattern;
  let hh = 2166136261;
  for (let i = 0; i < s.length; i++) { hh ^= s.charCodeAt(i); hh = Math.imul(hh, 16777619); }
  e.silhouetteHash = (hh >>> 0).toString(16);
  ctx.buildLog.push(e);
  return e;
};
(function () {
const proto = CHANGAN.proto;
const Tang = CHANGAN.Tang;
// ================================================================ Tang 基础构件重构（职责必须存在，命名可不同但此处按任务书命名）
// 唐风约束：舒展/厚重/雄浑/平缓/水平延展；禁紫禁城/明清/大唐不夜城/日式/影视假唐风；禁高等级统一夸张绿金琉璃顶（仅剪边/鸱尾点缀）
// --- TangPlatformBuilder: 夯土台/砖石台基/一二三级宫殿台/阶梯/踏道/龙尾道/压边/勾栏抽象
Tang.PlatformBuilder = {
  build(ctx, x0, z0, x1, z1, base, rank, opts) {
    opts = opts || {};
    const spec = CHANGAN.rankSpec(rank == null ? 1 : rank);
    const tiers = opts.tiers != null ? opts.tiers : (spec.platformTiers || 0);
    const h = opts.h != null ? opts.h : Math.max(1, spec.platformH || 1);
    const door = opts.door || 'S';
    const { store } = ctx;
    if (tiers <= 1) {
      // 普通夯土台/砖石台基：单层，石压边+踏道
      const top = CHANGAN.platform(ctx, x0, z0, x1, z1, base, h, opts.c, door);
      CHANGAN.logBuild(ctx, { kind: 'platform', name: opts.name || 'platform', x0, z0, x1, z1, h, roof: 'none', platform: h, bays: '0x0', rank: rank || 1, generic: false, symmetry: 'sym' });
      return top;
    }
    // 二/三级宫殿台：逐层内收，每层压边+勾栏，踏道贯通
    let y = base;
    const cx = (x0 + x1) >> 1;
    for (let t = 0; t < tiers; t++) {
      const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;
      if (ix1 <= ix0 || iz1 <= iz0) break;
      for (let yy = 1; yy <= h; yy++) {
        const isTop = (yy === h);
        for (let x = ix0 - 1; x <= ix1 + 1; x++) for (let z = iz0 - 1; z <= iz1 + 1; z++) {
          const edge = (x === ix0 - 1 || x === ix1 + 1 || z === iz0 - 1 || z === iz1 + 1);
          const col = isTop ? (edge ? PAL.stoneWhite : (PAL.brickPave)) : (edge ? PAL.stoneGrey : PAL.rammedDark);
          store.set(x, y + yy, z, col);
        }
      }
      y += h;
      // 勾栏抽象（每层压边立柱，门位断开）
      for (let x = ix0 - 1; x <= ix1 + 1; x += 3) {
        if (door !== 'S' || Math.abs(x - cx) > 2) store.set(x, y + 1, iz1 + 1, PAL.stoneWhite);
        if (door !== 'N' || Math.abs(x - cx) > 2) store.set(x, y + 1, iz0 - 1, PAL.stoneWhite);
      }
    }
    // 踏道/龙尾道：opts.ramp='long' 时做三条龙尾道式长坡道，否则单踏道
    if (opts.ramp === 'long') {
      const cz = (z0 + z1) >> 1;
      for (const dx of [-Math.floor((x1 - x0) / 4), 0, Math.floor((x1 - x0) / 4)]) {
        for (let s = 0; s < (tiers * h + 4); s++) {
          const yy = y - Math.floor(s / 2);
          if (yy <= base) break;
          store.fill(cx + dx - 1, base + 1, z1 + 2 + s, cx + dx + 1, yy, z1 + 2 + s, PAL.stoneWhite);
        }
      }
    } else {
      const top = y;
      const hh = top - base;
      // 踏道实心砌筑（每级自地面起砌，无悬空；防浮空审计）
      if (door === 'S') for (let s = 0; s < hh; s++) store.fill(cx - 1, base + 1, z1 + 2 + (hh - 1 - s), cx + 1, base + s + 1, z1 + 2 + (hh - 1 - s), PAL.stoneWhite);
      else if (door === 'N') for (let s = 0; s < hh; s++) store.fill(cx - 1, base + 1, z0 - 2 - (hh - 1 - s), cx + 1, base + s + 1, z0 - 2 - (hh - 1 - s), PAL.stoneWhite);
    }
    CHANGAN.logBuild(ctx, { kind: 'platform', name: opts.name || 'palace-platform', x0, z0, x1, z1, h: y - base, roof: 'none', platform: tiers, bays: '0x0', rank: rank || 5, generic: false, symmetry: 'sym' });
    return y;
  }
};
// --- TangTimberFrameBuilder: 柱列/柱网/开间/进深/额枋/梁架视觉层/斗栱抽象/廊柱/门廊/重楼柱网（柱网托起屋顶，非墙盒顶帽）
Tang.TimberFrameBuilder = {
  // 返回 cols[]，并落额枋+斗栱挑出；opts: {bayW, colC, dougong:true, veranda:false, tower2:false}
  build(ctx, x0, z0, x1, z1, yBase, rank, opts) {
    opts = opts || {};
    const spec = CHANGAN.rankSpec(rank == null ? 1 : rank);
    const { store } = ctx;
    const w = x1 - x0 + 1;
    const bays = opts.bays || Math.min(spec.bays, Math.max(1, Math.floor(w / (opts.bayW || spec.bayW || 2))));
    // 按开间均分布柱（真开间节奏，非等距条纹）
    const colX = [];
    for (let b = 0; b <= bays; b++) colX.push(Math.round(x0 + (x1 - x0) * b / Math.max(1, bays)));
    const uniqX = Array.from(new Set(colX)).sort((a, b) => a - b);
    const cols = [];
    const colC = opts.colC || (rank >= 4 ? PAL.zhuBright : PAL.zhu);
    const frameH = opts.frameH || (rank >= 4 ? 4 : 3);
    // 檐柱+内柱（进深方向廊柱）
    for (const x of uniqX) { cols.push({ x, z: z0 }); cols.push({ x, z: z1 }); }
    const cz = (z0 + z1) >> 1;
    if (z1 - z0 >= 6) { for (const x of uniqX) cols.push({ x, z: cz }); }
    // 落柱（柱径 rank 影响：高等级双柱并立转角）
    for (const p of cols) for (let y = 0; y < frameH; y++) store.set(p.x, yBase + y, p.z, colC);
    if (rank >= 5) {
      for (const cx of [x0, x1]) for (const cz2 of [z0, z1]) {
        store.set(cx + (cx === x0 ? 1 : -1), yBase, cz2, colC);
        store.set(cx + (cx === x0 ? 1 : -1), yBase + 1, cz2, colC);
      }
    }
    // 额枋环贯+梁架视觉层（内收一格的梁栿暗示）
    for (let x = x0; x <= x1; x++) { store.set(x, yBase + frameH - 1, z0, colC); store.set(x, yBase + frameH - 1, z1, colC); }
    for (let z = z0; z <= z1; z++) { store.set(x0, yBase + frameH - 1, z, colC); store.set(x1, yBase + frameH - 1, z, colC); }
    // 斗栱抽象：柱头华栱挑出+补间小斗（阴影间隙即檐下深远感来源）
    for (const p of cols) {
      if (p.z === z0) store.set(p.x, yBase + frameH - 1, z0 - 1, PAL.zhuBright);
      if (p.z === z1) store.set(p.x, yBase + frameH - 1, z1 + 1, PAL.zhuBright);
    }
    // 门廊：门位前出抱厦两柱
    if (opts.veranda) {
      const cx = (x0 + x1) >> 1;
      for (const dx of [-2, 2]) { for (let y = 0; y < frameH - 1; y++) store.set(cx + dx, yBase + y, z1 + 1, colC); }
      for (let x = cx - 2; x <= cx + 2; x++) store.set(x, yBase + frameH - 1, z1 + 1, colC);
    }
    return { cols, bays, bayPattern: bays + 'x' + (z1 - z0 >= 6 ? 2 : 1) };
  }
};
// --- TangRoofBuilder: hip庑殿/xie歇山/xuan悬山/gable简化民居/jian攒尖/doubleEave/towerEave/pagodaEave（坡度/脊/垂脊/戗脊/檐口/出檐/起翘/鸱尾/等级）
Tang.RoofBuilder = {
  build(ctx, type, x0, z0, x1, z1, y, opts) {
    opts = opts || {};
    const rank = opts.rank == null ? 1 : opts.rank;
    // 等级→形制约束：高等级禁悬山/民居顶；低等级禁庑殿重檐与琉璃
    let t = type;
    if (rank >= 4 && (t === 'xuan' || t === 'gable')) t = 'xie';
    if (rank <= 1 && (t === 'hip' || t === 'doubleEave')) t = 'xuan';
    if (t === 'gable') t = 'xuan'; // 简化民居即悬山减饰
    if (t === 'doubleEave') {
      // 重檐必须有真实楼身：下层为单层檐裙（不起坡），上层屋顶抬高留出楼身带，禁互穿。
      const { store } = ctx;
      const ex0 = x0 - 2, ex1 = x1 + 2, ez0 = z0 - 2, ez1 = z1 + 2;
      for (let x = ex0; x <= ex1; x++) for (let z = ez0; z <= ez1; z++) {
        const ring = (x === ex0 || x === ex1 || z === ez0 || z === ez1);
        if (!ring) continue;
        store.set(x, y, z, PAL.roofLight);
      }
      const top = proto.roof(ctx, rank >= 5 ? 'hip' : 'xie', x0, z0, x1, z1, y + 3, Object.assign({}, opts, { overhang: 1 }));
      return top;
    }
    if (t === 'towerEave') {
      // 楼阁腰檐：单层小出檐+平座栏干意象（薄板+角翘）
      const top = proto.roof(ctx, 'xie', x0, z0, x1, z1, y, Object.assign({}, opts, { overhang: 2 }));
      return top;
    }
    if (t === 'pagodaEave') {
      const top = proto.roof(ctx, 'jian', x0, z0, x1, z1, y, Object.assign({}, opts, { overhang: 1 }));
      return top;
    }
    // 唐式约束：青灰为主，琉璃仅剪边/鸱尾（rank>=4 才允许 trim glaze），禁通体绿金顶
    const o2 = Object.assign({}, opts);
    if (rank < 4 && o2.trim && (o2.trim === PAL.glazeGreen || o2.trim === PAL.glazeBlue || o2.trim === PAL.gold)) delete o2.trim;
    if (o2.main === PAL.glazeGreen || o2.main === PAL.glazeBlue) o2.main = PAL.roofGrey;
    return proto.roof(ctx, t, x0, z0, x1, z1, y, o2);
  }
};
// --- TangGateBuilder: 门墩/门道/门楼/城墙连接/轴线（P0 专用，不调 proto.gateTower）
Tang.GateBuilder = {
  arch(ctx, x, y, z, axis, w, c) {
    const { store } = ctx;
    if (axis === 'NS') for (let dx = -w; dx <= w; dx++) { store.set(x + dx, y, z, c); }
    else for (let dz = -w; dz <= w; dz++) { store.set(x, y, z + dz, c); }
  }
};
// --- TangHallBuilder: 专属柱网/台基/屋顶比例/出檐/重檐/开间节奏（P0/P1 地标经此，不经 proto.hall）
Tang.HallBuilder = {
  build(ctx, x0, z0, x1, z1, base, rank, opts) {
    opts = opts || {};
    const door = opts.door || 'S';
    const top = Tang.PlatformBuilder.build(ctx, x0, z0, x1, z1, base, rank, { door, tiers: rank >= 5 ? 3 : rank >= 4 ? 2 : 1, h: rank >= 4 ? 1 : 1, name: opts.name });
    const frame = Tang.TimberFrameBuilder.build(ctx, x0, z0, x1, z1, top + 1, rank, { bays: opts.bays, colC: opts.colC, veranda: opts.veranda });
    // 墙体退后半格、柱网外露（柱网托起屋顶）：墙仅砌柱间下半，上半为直棂窗带+额枋
    const wallH = opts.wallH || CHANGAN.rankSpec(rank).wallH;
    const wallC = opts.wallC || PAL.plaster;
    // 用 wallRing 但柱已立：此处补墙板（柱位跳过以保柱网可读）。
    // 门洞：门所在边居中留真实门洞（只剩顶层额枋），与台基踏道相接；其余柱间下部为粉壁。
    const { store } = ctx;
    const mcx = (x0 + x1) >> 1, mcz = (z0 + z1) >> 1;
    const wSpan = x1 - x0 + 1, dSpan = z1 - z0 + 1;
    const doorHalf = Math.max(0, Math.min(1, Math.floor(Math.min(wSpan, dSpan) / 9)));
    const isDoorCell = (x, z) => {
      if (door === 'S' && z === z1 && Math.abs(x - mcx) <= doorHalf) return true;
      if (door === 'N' && z === z0 && Math.abs(x - mcx) <= doorHalf) return true;
      if (door === 'E' && x === x1 && Math.abs(z - mcz) <= doorHalf) return true;
      if (door === 'W' && x === x0 && Math.abs(z - mcz) <= doorHalf) return true;
      return false;
    };
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      const isCol = frame.cols.some(p => p.x === x && p.z === z);
      if (isCol) continue;
      if (isDoorCell(x, z)) {
        for (let y = top + 1; y < top + 1 + wallH; y++) {
          if (y === top + wallH) { store.set(x, y, z, opts.colC || PAL.zhu); continue; }
          // 门洞留空：与踏道/庭院砖地直接相接
        }
        continue;
      }
      for (let y = top + 1; y < top + 1 + wallH; y++) {
        if (y === top + wallH) { store.set(x, y, z, opts.colC || PAL.zhu); continue; }
        store.set(x, y, z, wallC);
      }
    }
    const roofType = opts.roof || CHANGAN.rankSpec(rank).roof.split('-')[0];
    const ry = Tang.RoofBuilder.build(ctx, roofType, x0, z0, x1, z1, top + 1 + wallH, Object.assign({}, opts, { rank }));
    CHANGAN.logBuild(ctx, { kind: 'hall', name: opts.name || 'tang-hall', x0, z0, x1, z1, h: ry - base, roof: roofType, platform: rank >= 5 ? 3 : rank >= 4 ? 2 : 1, bays: frame.bayPattern, rank, generic: false, symmetry: 'sym' });
    (ctx.counters.halls = (ctx.counters.halls || 0) + 1);
    return ry;
  }
};
// --- TangTowerBuilder: 重楼/腰檐/平座/柱列/楼层递进（禁两hall叠加冒充重楼）
Tang.TowerBuilder = {
  build(ctx, cx, cz, w, d, base, rank, opts) {
    opts = opts || {};
    const { store } = ctx;
    const floors = opts.floors || (rank >= 5 ? 3 : 2);
    let y = base;
    // 塔基（砖石高台， rank 决定层级）
    y = Tang.PlatformBuilder.build(ctx, cx - ((w >> 1) + 1), cz - ((d >> 1) + 1), cx + ((w >> 1) + 1), cz + ((d >> 1) + 1), y, rank, { door: opts.door || 'S', name: opts.name + '-base' });
    for (let f = 0; f < floors; f++) {
      const inset = f;
      const x0 = cx - (w >> 1) + inset, x1 = cx + (w >> 1) - inset;
      const z0 = cz - (d >> 1) + inset, z1 = cz + (d >> 1) - inset;
      const fr = Tang.TimberFrameBuilder.build(ctx, x0, z0, x1, z1, y + 1, rank, { colC: PAL.zhuBright });
      // 腰檐+平座：栏干与檐口同层（侧向相连，无悬空）
      Tang.RoofBuilder.build(ctx, 'towerEave', x0, z0, x1, z1, y + 1 + CHANGAN.rankSpec(rank).wallH, { rank, main: PAL.roofGrey, lip: PAL.roofLight });
      for (let x = x0 - 2; x <= x1 + 2; x += 2) { store.set(x, y + 1 + CHANGAN.rankSpec(rank).wallH, z1 + 2, PAL.stoneWhite); store.set(x, y + 1 + CHANGAN.rankSpec(rank).wallH, z0 - 2, PAL.stoneWhite); }
      y += CHANGAN.rankSpec(rank).wallH + 1;
      if (f === floors - 1) {
        // 顶层攒尖/歇山收分+宝珠（楼阁轮廓纵向比例：顶层内收）
        Tang.RoofBuilder.build(ctx, opts.top || 'jian', x0, z0, x1, z1, y, { rank, finial: PAL.gold });
        y += 3;
      }
    }
    CHANGAN.logBuild(ctx, { kind: 'tower', name: opts.name || 'tang-tower', x0: cx - (w >> 1), z0: cz - (d >> 1), x1: cx + (w >> 1), z1: cz + (d >> 1), h: y - base, roof: 'tower', platform: 1, bays: w + 'x' + d, rank, generic: false, symmetry: 'sym', towerProfile: floors + 'F' });
    return y;
  }
};
// --- TangCompoundBuilder: 院落围合/轴线/廊庑/空间压缩释放（前朝/中朝/内朝递进）
Tang.CompoundBuilder = {
  wall(ctx, x0, z0, x1, z1, base, facing, opts) { return proto.enclose(ctx, x0, z0, x1, z1, base, facing, opts); },
  court(ctx, x0, z0, x1, z1, base, opts) {
    const { store } = ctx;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) store.set(x, base, z, PAL.brickPave);
  }
};

// --- 地标唯一性护栏：主体禁调通用模板（允许内部使用基础primitive wallRing/roof/platform/colonnade/enclose）
CHANGAN.enterLandmark = function (ctx, name) { ctx._landmarkStack = ctx._landmarkStack || []; ctx._landmarkStack.push(name); };
CHANGAN.exitLandmark = function (ctx) { (ctx._landmarkStack || []).pop(); };
CHANGAN._noteGeneric = function (ctx, fn) {
  if (ctx._landmarkStack && ctx._landmarkStack.length) {
    ctx.genericViolations = ctx.genericViolations || [];
    ctx.genericViolations.push(ctx._landmarkStack[ctx._landmarkStack.length - 1] + ':' + fn);
  }
  // 普通建筑签名：记录调用以供去重审计
  CHANGAN.logBuild(ctx, { kind: 'generic', name: fn, x0: 0, z0: 0, x1: 0, z1: 0, h: 1, roof: fn, platform: 0, bays: '0x0', rank: 1, generic: true, symmetry: 'sym' });
};
// ================================================================ 基础构件：台基、柱网、斗栱、鸱吻
CHANGAN.platform = null;

// 1. 台基（石/砖，带开门方向踏道与石压边）
function platform(ctx, x0, z0, x1, z1, base, h, c, door) {
  const { store } = ctx;
  h = Math.max(1, h || 1);
  door = door || 'S';
  const floorC = c || PAL.brickPave;
  const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;

  // 台基基座（灰石实心垫底 + 白石包边 + 顶层砖铺）
  for (let y = 1; y <= h; y++) {
    const isTop = (y === h);
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        const edge = (x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1);
        const col = isTop ? (edge ? PAL.stoneWhite : floorC) : (edge ? PAL.stoneGrey : PAL.rammedDark);
        store.set(x, base + y, z, col);
      }
    }
  }

  const top = base + h;
  // 踏道实心砌筑（每级自地面起砌，防浮空）
  if (door === 'S') {
    for (let s = 0; s < h; s++) {
      store.fill(cx - 1, base + 1, z1 + 2 + (h - 1 - s), cx + 1, base + s + 1, z1 + 2 + (h - 1 - s), PAL.stoneWhite);
    }
  } else if (door === 'N') {
    for (let s = 0; s < h; s++) {
      store.fill(cx - 1, base + 1, z0 - 2 - (h - 1 - s), cx + 1, base + s + 1, z0 - 2 - (h - 1 - s), PAL.stoneWhite);
    }
  } else if (door === 'E') {
    for (let s = 0; s < h; s++) {
      store.fill(x1 + 2 + (h - 1 - s), base + 1, cz - 1, x1 + 2 + (h - 1 - s), base + s + 1, cz + 1, PAL.stoneWhite);
    }
  } else if (door === 'W') {
    for (let s = 0; s < h; s++) {
      store.fill(x0 - 2 - (h - 1 - s), base + 1, cz - 1, x0 - 2 - (h - 1 - s), base + s + 1, cz + 1, PAL.stoneWhite);
    }
  }

  // 平台边缘勾栏立柱（大台基）
  if (h >= 2) {
    for (let x = x0 - 1; x <= x1 + 1; x += 3) {
      if (door !== 'S' || Math.abs(x - cx) > 2) store.set(x, top + 1, z1 + 1, PAL.stoneWhite);
      if (door !== 'N' || Math.abs(x - cx) > 2) store.set(x, top + 1, z0 - 1, PAL.stoneWhite);
    }
    for (let z = z0 - 1; z <= z1 + 1; z += 3) {
      if (door !== 'E' || Math.abs(z - cz) > 2) store.set(x1 + 1, top + 1, z, PAL.stoneWhite);
      if (door !== 'W' || Math.abs(z - cz) > 2) store.set(x0 - 1, top + 1, z, PAL.stoneWhite);
    }
  }

  return top;
}
CHANGAN.platform = platform;
CHANGAN._wallRing = null; CHANGAN._dougong = null; CHANGAN._chiwei = null;

// 2. 盛唐弯月鸱吻：基座稳固、背部隆起、尾梢内卷，饰以鎏金或琉璃
function chiwei(ctx, x, y, z, axis, palace, dir) {
  const { store } = ctx;
  const c = palace ? PAL.glazeGreen : PAL.roofDark;
  const trimC = palace ? PAL.gold : (palace ? PAL.glazeGreen : PAL.roofLight);
  const d = dir || 1; // 1: 向正向内卷, -1: 向负向内卷

  if (axis === 'x') {
    store.set(x, y + 1, z, c); store.set(x + d, y + 1, z, c);
    store.set(x, y + 2, z, c); store.set(x + d, y + 2, z, c);
    store.set(x, y + 3, z, c); store.set(x + d, y + 3, z, trimC);
    store.set(x + d, y + 4, z, trimC);
  } else {
    store.set(x, y + 1, z, c); store.set(x, y + 1, z + d, c);
    store.set(x, y + 2, z, c); store.set(x, y + 2, z + d, c);
    store.set(x, y + 3, z, c); store.set(x, y + 3, z + d, trimC);
    store.set(x, y + 4, z + d, trimC);
  }
}

// 3. 斗栱出挑：柱头铺作与补间铺作向外挑出承托檐檩，形成深远出挑与阴影间隙
function dougong(ctx, x0, z0, x1, z1, y, cols) {
  const { store } = ctx;
  // 环墙连续额枋（朱红）
  for (let x = x0; x <= x1; x++) { store.set(x, y, z0, PAL.zhu); store.set(x, y, z1, PAL.zhu); }
  for (let z = z0; z <= z1; z++) { store.set(x0, y, z, PAL.zhu); store.set(x1, y, z, PAL.zhu); }

  // 柱头出挑（华栱挑出 1 格，朱亮显眼）
  if (cols && cols.length) {
    for (const p of cols) {
      if (p.z === z0) store.set(p.x, y, z0 - 1, PAL.zhuBright);
      if (p.z === z1) store.set(p.x, y, z1 + 1, PAL.zhuBright);
      if (p.x === x0) store.set(x0 - 1, y, p.z, PAL.zhuBright);
      if (p.x === x1) store.set(x1 + 1, y, p.z, PAL.zhuBright);
    }
  } else {
    for (let x = x0; x <= x1; x += 3) {
      store.set(x, y, z0 - 1, PAL.zhuBright);
      store.set(x, y, z1 + 1, PAL.zhuBright);
    }
    for (let z = z0; z <= z1; z += 3) {
      store.set(x0 - 1, y, z, PAL.zhuBright);
      store.set(x1 + 1, y, z, PAL.zhuBright);
    }
  }
}

// 4. 墙体与立面系统：按开间布置朱红立柱、白粉墙板、直棂窗与板门，消除条纹色块
function wallRing(ctx, x0, z0, x1, z1, y0, h, wallC, colC, opts) {
  const { store } = ctx;
  opts = opts || {};
  wallC = wallC || PAL.plaster;
  colC = colC || PAL.zhu;
  const doorSide = opts.door || 'S';
  const cols = [];

  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;

  // 开间计算
  let colX = [];
  if (w <= 6) {
    colX = [x0, x1];
    if (w >= 5) colX = [x0, cx, x1];
  } else if (w <= 10) {
    const bay = Math.floor(w / 3);
    colX = [x0, x0 + bay, x1 - bay, x1];
  } else if (w <= 16) {
    const bay = Math.floor(w / 4);
    colX = [x0, x0 + bay, cx, x1 - bay, x1];
  } else {
    const bay = Math.floor(w / 6);
    colX = [x0, x0 + bay, x0 + 2 * bay, x1 - 2 * bay, x1 - bay, x1];
  }
  colX = Array.from(new Set(colX)).sort((a, b) => a - b);
  let colZ = [];
  if (d <= 5) {
    colZ = [z0, z1];
  } else if (d <= 9) {
    colZ = [z0, cz, z1];
  } else {
    const bayZ = Math.floor(d / 3);
    colZ = [z0, z0 + bayZ, z1 - bayZ, z1];
  }
  colZ = Array.from(new Set(colZ)).sort((a, b) => a - b);

  for (const x of colX) { cols.push({ x, z: z0 }); cols.push({ x, z: z1 }); }
  for (const z of colZ) { cols.push({ x: x0, z }); cols.push({ x: x1, z }); }

  // 窗洞位置：取柱间开间正中（间宽>=3 才开窗，间宽>=5 开双格宽窗），门位另行留洞。
  // 上轮按 (x-x0)%3 节奏恰好落在柱列上导致整面无洞；本轮按真实开间取中，保证每面必有洞。
  const winX = new Set();
  for (let bi = 0; bi + 1 < colX.length; bi++) {
    const a = colX[bi], b = colX[bi + 1], gap = b - a;
    if (gap < 3) continue;
    const mid = (a + b) >> 1;
    winX.add(mid);
    if (gap >= 5) winX.add(mid + 1);
  }

  const isCol = (x, z) => {
    if ((x === x0 || x === x1) && (z === z0 || z === z1)) return true;
    if (z === z0 || z === z1) return colX.includes(x);
    if (x === x0 || x === x1) return colZ.includes(z);
    return false;
  };

  const isDoorPos = (x, z) => {
    if (doorSide === 'S' && z === z1 && Math.abs(x - cx) <= (w >= 9 ? 1 : 0)) return true;
    if (doorSide === 'N' && z === z0 && Math.abs(x - cx) <= (w >= 9 ? 1 : 0)) return true;
    if (doorSide === 'E' && x === x1 && Math.abs(z - cz) <= (d >= 9 ? 1 : 0)) return true;
    if (doorSide === 'W' && x === x0 && Math.abs(z - cz) <= (d >= 9 ? 1 : 0)) return true;
    return false;
  };

  // 檐下墙板内收一格：柱列留在外皮、墙板退到内皮，下碱与额枋仍在外皮。
  // 这样近景能看见"柱凸出于墙"与一条真实的檐下阴影缝，墙面不再是一整块平面。
  // 仅在房身 >= 5×5 时启用，避免小房子被掏空成亭子。
  const recessOn = opts.recess === true && (x1 - x0) >= 5 && (z1 - z0) >= 5;
  const wallAt = (x, z, y) => {
    if (!recessOn || y >= y0 + h - 1) return [x, z];
    if (z === z0) return [x, z + 1];
    if (z === z1) return [x, z - 1];
    if (x === x0) return [x + 1, z];
    if (x === x1) return [x - 1, z];
    return [x, z];
  };
  const putWall = (x, z, y, c) => {
    const p = wallAt(x, z, y);
    store.set(p[0], y, p[1], c);
    // 下碱层内外同时砌：内收墙板由此落地支承（否则触发"无浮空"致命审计），
    // 同时在外皮形成一圈台明/下碱，正是唐代墙身的读法。
    if (y === y0 && (p[0] !== x || p[1] !== z)) store.set(x, y, z, c);
  };

  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const edge = (x === x0 || x === x1 || z === z0 || z === z1);
      if (!edge) continue;

      const column = isCol(x, z);
      const isDoor = isDoorPos(x, z);

      for (let y = y0; y < y0 + h; y++) {
        // 门位
        if (isDoor) {
          if (opts.openDoor) {
            if (y === y0 + h - 1) store.set(x, y, z, colC); // 门楣额枋
            continue; // 留空通行（内皮同样不砌，形成真实门洞深度）
          } else {
            if (y < y0 + h - 1) putWall(x, z, y, PAL.doorDark);
            else store.set(x, y, z, colC);
            continue;
          }
        }

        // 柱子
        if (column) {
          store.set(x, y, z, colC);
          continue;
        }

        // 顶层额枋横贯
        if (y === y0 + h - 1) {
          store.set(x, y, z, colC);
          continue;
        }

        // 直棂窗：开间居中真实洞口（留空只剩上下枋，深度即整层墙厚），余段为粉壁；
        // 山墙不开窗。上一轮“逐格交替木条”在常用机位缩成黑色噪点，本轮按真实开间
        // 取中（winX），保证每面必有洞，中景可读、近景有深度。
        if (opts.windows !== false && y >= y0 + 1 && y <= y0 + h - 2) {
          const isMainSide = (z === z0 || z === z1);
          if (isMainSide) {
            if (winX.has(x)) {
              continue; // 真实窗洞：留空（对面墙/庭院即背衬，近处见深度）
            }
            putWall(x, z, y, wallC);
            continue;
          }
        }

        // 默认粉壁
        putWall(x, z, y, wallC);
      }
    }
  }

  return cols;
}
CHANGAN._wallRing = wallRing; CHANGAN._dougong = dougong; CHANGAN._chiwei = chiwei;

// ================================================================ 屋顶生成体系（悬山/攒尖/歇山/庑殿，举折平缓，深远出檐）
proto.roof = function (ctx, type, x0, z0, x1, z1, y, opts) {
  opts = opts || {};
  const { store } = ctx;
  // 类型学普查：屋顶形制 × 跨度档 × 层数档
  const cnt = ctx.counters;
  cnt['roof_' + type] = (cnt['roof_' + type] || 0) + 1;
  cnt['roofspan_' + Math.min(24, x1 - x0 + 1)] = (cnt['roofspan_' + Math.min(24, x1 - x0 + 1)] || 0) + 1;
  const main = opts.main || PAL.roofGrey;
  const lip = opts.lip || PAL.roofLight;
  const trim = opts.trim;
  const ridgeC = PAL.roofDark;

  // 深远出檐：出檐必须明确挑出墙身/柱列之外，才能在墙面留下檐下阴影带。
  let over = opts.overhang == null ? ((x1 - x0) >= 10 ? 3 : ((x1 - x0) >= 4 ? 2 : 1)) : opts.overhang;
  // 屋面跨度兜底：半跨 <3 时屋面只有 2 层台阶，必读成平顶（实测 71% 的屋面落在这一档）。
  // 小建筑靠加大出檐把屋面撑到至少 7 格宽，宁可有深檐也不能没有坡。
  {
    const s0 = Math.min(x1 - x0 + 1, z1 - z0 + 1);
    if (s0 + 2 * over < 7) over = Math.min(4, Math.ceil((7 - s0) / 2));
  }
  const ex0 = x0 - over, ex1 = x1 + over, ez0 = z0 - over, ez1 = z1 + over;
  const w = ex1 - ex0 + 1, d = ez1 - ez0 + 1;
  const alongX = (w >= d);

  const cx = (ex0 + ex1) >> 1, cz = (ez0 + ez1) >> 1;
  const minSpan = alongX ? d : w;
  const halfSpan = Math.max(1, Math.floor((minSpan - 1) / 2));
  cnt['roofmin_' + Math.min(24, minSpan)] = (cnt['roofmin_' + Math.min(24, minSpan)] || 0) + 1;
  cnt['roofhalf_' + Math.min(12, halfSpan)] = (cnt['roofhalf_' + Math.min(12, halfSpan)] || 0) + 1;

  // 举折平缓 + 真坡度：层数取半跨（上限 5），每层内收 1~2 格。
  // 上轮"2 层大平板 + 一条脊"是屋顶看起来像水泥平板的直接原因；本轮改为
  // 层数 = 半跨（封顶 5），内收按举折曲线（檐口缓、近脊陡）分配，保证：
  //   ① 最大层间内收 <= 2 格，不出现整面墙式跳变；
  //   ② 顶层收到脊线宽度（悬山/庑殿/歇山都能闭合成脊），正脊才真正落在屋面上。
  // 举折 + 真坡度：**每层内收 1 格、层数 = 半跨**，这是体素屋顶唯一能读出"坡"的写法。
  // 上轮层数被压到 2~4 层、每层内收 2~3 格，结果是"两张平板叠一条脊"，
  // 近景法医式检查判定"所有体块顶部都是纯平顶"。本轮把层数上限提到 8，
  // 保证 5 格以内的小屋顶也是 1 格一级的连续台阶（45° 体素坡），中景即可读出屋盖。
  const pitch = opts.pitch == null ? 1 : Math.max(0.75, Math.min(1, opts.pitch));
  const layers = Math.max(2, Math.min(8, Math.round(halfSpan * pitch)));
  // 归一化到 layers-1，保证顶层一定收到脊线宽度（悬山/庑殿/歇山都能闭合成脊）
  const insetOf = L => Math.round(halfSpan * Math.pow(L / Math.max(1, layers - 1), 1.12));

  // 瓦垄：屋面按垄分色（一格垄 + 一格沟），远看是瓦面、近看有垄。
  // 上轮屋面是纯色平板，这是"屋顶像水泥板"最直接的来源。沟色用 roofGroove 而非 roofDark，
  // 避免远处出现摩尔纹与"花掉"。
  const tileC = (x, z) => (((alongX ? x : z) & 1) ? main : PAL.roofGroove);

  // 檐下椽头带：出檐外圈的下皮压木色，并按 (x+z) 奇偶交替深浅，形成可辨的椽头节奏。
  // 行人平视时看到的是檐底，原来檐底与瓦面同色，读作一块悬着的灰板。
  {
    const sy = y - 1;
    const rc = (x, z) => (((x + z) & 1) ? PAL.timber : PAL.timberDark);
    for (let x = ex0; x <= ex1; x++) { store.set(x, sy, ez0, rc(x, ez0)); store.set(x, sy, ez1, rc(x, ez1)); }
    for (let z = ez0; z <= ez1; z++) { store.set(ex0, sy, z, rc(ex0, z)); store.set(ex1, sy, z, rc(ex1, z)); }
  }

  // -------------------------------- 1. 悬山顶 (xuan)
  if (type === 'xuan') {
    for (let L = 0; L < layers; L++) {
      const yy = y + L;
      const step = insetOf(L);
      const za = alongX ? ez0 + step : ez0;
      const zb = alongX ? ez1 - step : ez1;
      const xa = alongX ? ex0 : ex0 + step;
      const xb = alongX ? ex1 : ex1 - step;

      if (alongX) {
        for (let x = ex0; x <= ex1; x++) {
          for (let z = za; z <= zb; z++) {
            const isEave = (z === za || z === zb);
            const isEdge = (x === ex0 || x === ex1);
            let c = tileC(x, z);
            if (L === 0 && isEave) c = lip;
            if (isEdge) c = (L === 0) ? lip : (trim || main);
            store.set(x, yy, z, c);
          }
        }
        // 山面封堵
        for (const sx of [ex0 + 1, ex1 - 1]) {
          for (let z = za; z <= zb; z++) {
            store.set(sx, yy, z, (z === za || z === zb) ? PAL.timberDark : PAL.plasterWarm);
          }
        }
      } else {
        for (let z = ez0; z <= ez1; z++) {
          for (let x = xa; x <= xb; x++) {
            const isEave = (x === xa || x === xb);
            const isEdge = (z === ez0 || z === ez1);
            let c = tileC(x, z);
            if (L === 0 && isEave) c = lip;
            if (isEdge) c = (L === 0) ? lip : (trim || main);
            store.set(x, yy, z, c);
          }
        }
        for (const sz of [ez0 + 1, ez1 - 1]) {
          for (let x = xa; x <= xb; x++) {
            store.set(x, yy, sz, (x === xa || x === xb) ? PAL.timberDark : PAL.plasterWarm);
          }
        }
      }
    }

    const ry = y + layers;
    if (alongX) {
      for (let x = ex0; x <= ex1; x++) {
        store.set(x, ry - 1, cz, ridgeC);
        store.set(x, ry, cz, ridgeC);
      }
      store.set(ex0, ry + 1, cz, ridgeC);
      store.set(ex1, ry + 1, cz, ridgeC);
    } else {
      for (let z = ez0; z <= ez1; z++) {
        store.set(cx, ry - 1, z, ridgeC);
        store.set(cx, ry, z, ridgeC);
      }
      store.set(cx, ry + 1, ez0, ridgeC);
      store.set(cx, ry + 1, ez1, ridgeC);
    }
    return ry + 1;
  }

  // -------------------------------- 2. 攒尖顶 (jian)
  if (type === 'jian') {
    for (let L = 0; L < layers; L++) {
      const yy = y + L;
      const step = insetOf(L);
      const xa = ex0 + step, xb = ex1 - step;
      const za = ez0 + step, zb = ez1 - step;
      if (xa > xb || za > zb) break;

      for (let x = xa; x <= xb; x++) {
        for (let z = za; z <= zb; z++) {
          const ring = (x === xa || x === xb || z === za || z === zb);
          let c = tileC(x, z);
          if (L === 0 && ring) c = lip;
          if (trim && (L === 0 || L === layers - 1) && ring) c = trim;
          store.set(x, yy, z, c);
        }
      }
      if (L === 0) {
        store.set(xa, yy + 1, za, lip); store.set(xb, yy + 1, za, lip);
        store.set(xa, yy + 1, zb, lip); store.set(xb, yy + 1, zb, lip);
      }
    }
    const ry = y + layers;
    store.set(cx, ry, cz, PAL.stoneGrey);
    store.set(cx, ry + 1, cz, opts.finial || PAL.gold);
    return ry + 1;
  }

  // -------------------------------- 3. 歇山顶 (xie) 与 4. 庑殿顶 (hip)
  const isXie = (type === 'xie');
  const xieSplit = Math.max(1, Math.floor(layers * 0.45));

  let topY = y;
  let lastXa = ex0, lastXb = ex1, lastZa = ez0, lastZb = ez1;

  for (let L = 0; L < layers; L++) {
    const yy = y + L;
    topY = yy;

    const stepZ = insetOf(L);
    const za = ez0 + stepZ, zb = ez1 - stepZ;

    let xa, xb;
    if (isXie && L >= xieSplit) {
      const fixedStepX = insetOf(xieSplit);
      xa = alongX ? ex0 + fixedStepX : ex0 + stepZ;
      xb = alongX ? ex1 - fixedStepX : ex1 - stepZ;
    } else {
      const stepX = insetOf(L);
      xa = ex0 + stepX;
      xb = ex1 - stepX;
    }

    if (xa > xb || za > zb) break;
    lastXa = xa; lastXb = xb; lastZa = za; lastZb = zb;

    for (let x = xa; x <= xb; x++) {
      for (let z = za; z <= zb; z++) {
        const ring = (x === xa || x === xb || z === za || z === zb);
        let c = tileC(x, z);
        if (L === 0 && ring) c = lip;
        if (trim && (L === 0 || L === layers - 1) && ring) c = trim;

        // 歇山山花内部板壁
        if (isXie && L >= xieSplit && alongX && (x === xa || x === xb)) {
          c = (z === za || z === zb) ? PAL.timberDark : PAL.plasterWarm;
        }

        store.set(x, yy, z, c);
      }
    }

    // 翼角反宇
    if (L === 0) {
      store.set(xa, yy + 1, za, lip); store.set(xb, yy + 1, za, lip);
      store.set(xa, yy + 1, zb, lip); store.set(xb, yy + 1, zb, lip);
    }
  }

  // 正脊与鸱吻
  const ry = topY + 1;
  if (alongX) {
    const rxA = Math.min(lastXa, lastXb);
    const rxB = Math.max(lastXa, lastXb);
    for (let x = rxA; x <= rxB; x++) {
      store.set(x, ry - 1, cz, ridgeC);
      store.set(x, ry, cz, ridgeC);
    }
    chiwei(ctx, rxA, ry, cz, 'x', !!trim, 1);
    chiwei(ctx, rxB, ry, cz, 'x', !!trim, -1);
  } else {
    const rzA = Math.min(lastZa, lastZb);
    const rzB = Math.max(lastZa, lastZb);
    for (let z = rzA; z <= rzB; z++) {
      store.set(cx, ry - 1, z, ridgeC);
      store.set(cx, ry, z, ridgeC);
    }
    chiwei(ctx, cx, ry, rzA, 'z', !!trim, 1);
    chiwei(ctx, cx, ry, rzB, 'z', !!trim, -1);
  }

  return ry + 4;
};

// ================================================================ 通用殿堂（台基 + 开间柱网 + 柱头斗栱 + 屋顶）
proto.hall = function (ctx, x0, z0, x1, z1, base, opts) {
  // 退化地块保护：1~2 格宽/深会在近景变成"孤零零的灰色薄鳍"（法医检查已确认为最丑之处）。
  // 小于 3×3 直接不生成，宁可留空也不留一根墙片。
  if (x1 - x0 < 3 || z1 - z0 < 3) return base;
  CHANGAN._noteGeneric(ctx, 'proto.hall');
  opts = opts || {};
  const { store } = ctx;
  const wallH = opts.wallH || 4;
  const doorSide = opts.door || 'S';

  // 1. 台基
  const top = opts.platform ? platform(ctx, x0, z0, x1, z1, base, opts.platform, opts.platformC, doorSide) : base;

  // 室内地面铺砖
  if (x1 - x0 >= 2 && z1 - z0 >= 2) {
    store.fill(x0 + 1, top, z0 + 1, x1 - 1, top, z1 - 1, PAL.brickPave);
  }

  // 2. 开间立面与柱网
  const cols = wallRing(ctx, x0, z0, x1, z1, top + 1, wallH, opts.wall || PAL.plaster, opts.col || PAL.zhu, {
    door: doorSide,
    windows: opts.windows !== false,
    openDoor: !!opts.openDoor,
    recess: opts.recess !== false,
  });

  // 3. 柱头出跳斗栱
  dougong(ctx, x0, z0, x1, z1, top + wallH, cols);

  // 4. 屋顶
  const over = opts.overhang != null ? opts.overhang : ((x1 - x0) >= 10 ? 3 : ((x1 - x0) >= 6 ? 2 : 1));
  const ry = proto.roof(ctx, opts.roof || 'xuan', x0, z0, x1, z1, top + wallH + 1, Object.assign({}, opts, { overhang: over }));

  // 重檐腰檐（doubleEave）：单层檐裙 + 真实楼身空带，禁两张屋顶互穿。
  // 上轮此处在墙身中部再铺一整张 hip 顶，檐层插入主屋顶造成互穿；本轮改为
  // 薄檐裙（仅一周檐口环，不起坡），与主屋顶之间留出 >=2 格楼身墙段可读。
  if (opts.doubleEave) {
    const midY = top + Math.max(2, Math.floor(wallH / 2));
    const ex0 = x0 - 2, ex1 = x1 + 2, ez0 = z0 - 2, ez1 = z1 + 2;
    for (let x = ex0; x <= ex1; x++) for (let z = ez0; z <= ez1; z++) {
      const ring = (x === ex0 || x === ex1 || z === ez0 || z === ez1);
      if (!ring) continue;
      store.set(x, midY, z, (opts.lip !== undefined && (x === ex0 || x === ex1 || z === ez0 || z === ez1)) ? PAL.roofLight : (opts.main || PAL.roofGrey));
    }
    // 檐角起翘点（四角高 1，不另起坡）
    store.set(ex0, midY + 1, ez0, PAL.roofLight); store.set(ex1, midY + 1, ez0, PAL.roofLight);
    store.set(ex0, midY + 1, ez1, PAL.roofLight); store.set(ex1, midY + 1, ez1, PAL.roofLight);
  }

  ctx.counters.halls++;
  ctx.counters['hallw_' + Math.min(24, x1 - x0 + 1)] = (ctx.counters['hallw_' + Math.min(24, x1 - x0 + 1)] || 0) + 1;
  ctx.counters['hallh_' + Math.min(12, wallH)] = (ctx.counters['hallh_' + Math.min(12, wallH)] || 0) + 1;
  return ry;
};

// ================================================================ 围合构件：院落/建筑群共用外墙（facing 决定院门朝向）
// facing: 'S' 南门居中 | 'N' 北墙偏西角门 | 'E' 东门居中 | 'W' 西门居中。返回门位描述。
// opts.h: 墙身层数（默认 3 + 瓦帽 = 总高 4）。普通小宅传 {h:2} 降为总高 3，保证
// 漫游不只见高墙、仍保留围合；府第寺观衙署保持默认高度以保层级。
function enclose(ctx, x0, z0, x1, z1, base, facing, opts) {
  const { store } = ctx;
  opts = opts || {};
  const courses = opts.h === 2 ? 2 : 3;
  const wallCs = courses === 2 ? [PAL.rammed, PAL.rammedLight] : [PAL.rammedDark, PAL.rammed, PAL.rammedLight];
  const wallC0 = opts.wall0 || wallCs[0], wallC1 = opts.wall || wallCs[courses === 2 ? 1 : 1], wallC2 = opts.wall2 || wallCs[courses === 2 ? 1 : 2];
  const capC = opts.cap === undefined ? PAL.roofGrey : opts.cap;
  const wallTop = base + courses, capY = base + courses + 1;
  const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
  let gx, gz, gAxis;
  if (facing === 'N') { gx = x0 + 2; gz = z0; gAxis = 'NS'; }
  else if (facing === 'E') { gx = x1; gz = cz; gAxis = 'EW'; }
  else if (facing === 'W') { gx = x0; gz = cz; gAxis = 'EW'; }
  else { facing = 'S'; gx = cx; gz = z1; gAxis = 'NS'; }
  const isGate = (x, z) => gAxis === 'NS' ? (z === gz && Math.abs(x - gx) <= 1) : (x === gx && Math.abs(z - gz) <= 1);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      if (isGate(x, z)) continue;
      store.set(x, base + 1, z, wallC0);
      if (courses >= 2) store.set(x, base + 2, z, wallC1);
      if (courses >= 3) store.set(x, base + 3, z, wallC2);
      if (capC) {
        // 瓦顶压边：压顶一格向外挑出，脊线用瓦暗色。
        // 原做法只在墙顶铺一格同色瓦，近景读作"城垛/水泥压顶"；挑出一格才有瓦檐剪影与投影。
        const ox = x === x0 ? -1 : x === x1 ? 1 : 0;
        const oz = z === z0 ? -1 : z === z1 ? 1 : 0;
        store.set(x, capY, z, PAL.roofDark);
        if (ox) store.set(x + ox, capY, z, capC);
        if (oz) store.set(x, capY, z + oz, capC);
      }
    }
  }
  // 门柱与门楣瓦（高度随墙身走，门楣与瓦帽同层）
  const posts = gAxis === 'NS' ? [[gx - 2, gz], [gx + 2, gz]] : [[gx, gz - 2], [gx, gz + 2]];
  for (const [px, pz] of posts) for (let y = 1; y <= courses; y++) store.set(px, base + y, pz, PAL.zhu);
  for (let s = -1; s <= 1; s++) store.set(gAxis === 'NS' ? gx + s : gx, capY, gAxis === 'NS' ? gz : gz + s, capC || PAL.roofGrey);
  return { gx, gz, gAxis, facing };
}

// 通透廊庑：单列朱柱 + 连续瓦顶（柱距 2，顶板与柱连通落地）
function colonnade(ctx, x0, z0, x1, z1, base) {
  const { store } = ctx;
  const alongX = (x1 - x0) >= (z1 - z0);
  if (alongX) {
    for (let x = x0; x <= x1; x++) {
      store.set(x, base + 3, z0, PAL.roofGrey);
      if ((x - x0) % 2 === 0) { store.set(x, base + 1, z0, PAL.zhu); store.set(x, base + 2, z0, PAL.zhu); }
    }
  } else {
    for (let z = z0; z <= z1; z++) {
      store.set(x0, base + 3, z, PAL.roofGrey);
      if ((z - z0) % 2 === 0) { store.set(x0, base + 1, z, PAL.zhu); store.set(x0, base + 2, z, PAL.zhu); }
    }
  }
}
proto.colonnade = colonnade;
proto.enclose = enclose;

// ================================================================ 院落空间（ResidencePlan组件组合：院墙/门屋/正房/厢/后寝/跨院/仓厨/井园/廊）
// 主房恒坐北朝南；院门朝所临街巷（facing）。先有Plan再施工，禁整栋复制只改宽。
proto.courtyard = function (ctx, x0, z0, w, d, base, level, rng, facing, plan) {
  CHANGAN._noteGeneric(ctx, 'proto.courtyard');
  const { store } = ctx;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
  const g = enclose(ctx, x0, z0, x1, z1, base, facing || 'S', { h: level === 0 ? 2 : 3 });

  // 院心砖道：自门入院，折向正房
  if (g.gAxis === 'NS') {
    for (let z = z0 + 1; z <= z1 - 1; z++) store.set(g.gx, base, z, PAL.brickPave);
    if (g.facing === 'N') for (let x = g.gx; x <= cx; x++) store.set(x, base, cz, PAL.brickPave);
  } else {
    const xa = Math.min(g.gx, cx);
    for (let x = xa; x <= Math.max(g.gx, cx); x++) if (x > x0 && x < x1) store.set(x, base, g.gz, PAL.brickPave);
    for (let z = z0 + 1; z <= g.gz; z++) store.set(cx, base, z, PAL.brickPave);
  }
  // 院落地坪：浅夯土满铺（原按 %11 点状撒色，实测坊内 71% 裸黄土都落在院落矩形内，
  // 是"坊内发空、地面脏"的直接来源）。已铺的砖道不被覆盖。
  for (let x = x0 + 1; x <= x1 - 1; x++) for (let z = z0 + 1; z <= z1 - 1; z++) {
    if (store.get(x, base, z) !== PAL.brickPave) store.set(x, base, z, PAL.loessLight);
  }

  CHANGAN.signUnique(ctx.counters, 'cy' + w + 'x' + d + 'l' + level + 'x' + x0 + 'z' + z0);
  plan = plan || { mainHallBays: 3, wingMode: 'none', rearHall: false, garden: false, well: false, gateType: '屋宇' };

  // 正房（居北，坐北朝南；开间按Plan.mainHallBays）；北墙开角门时让出西侧通道
  const shift = (g.facing === 'N') ? 3 : 2;
  if (level === 0) {
    const mainD = Math.max(3, Math.min(5, Math.floor(d * 0.42)));
    // 普通民居也要有屋顶形制差异：悬山为主，混入歇山/攒尖，墙高 2~3 随机。
    // 全城 86% 墙高=3、58% 悬山是"千篇一律"的直接来源。
    const t0 = rng();
    const roof0 = t0 < 0.55 ? 'xuan' : (t0 < 0.85 ? 'xie' : 'jian');
    proto.hall(ctx, x0 + shift, z0 + 1, x1 - 2, z0 + mainD, base, {
      roof: roof0, door: 'S', wallH: rng() < 0.35 ? 2 : 3, overhang: 1, windows: true, openDoor: true,
      pitch: 0.88 + rng() * 0.12,
      wall: rng() < 0.4 ? PAL.plasterWarm : PAL.plaster,
    });
    if (plan.well && w >= 10 && d >= 10) proto.well(ctx, x0 + 2, z1 - 4, base);
    else if (rng() < 0.35) proto.tree(ctx, x1 - 2, z1 - 2, base, rng() < 0.5 ? 'apricot' : 'elm', rng);
    if (plan.garden) { store.set(x1 - 2, base, z1 - 2, PAL.grass); proto.tree(ctx, x1 - 3, z1 - 3, base, 'elm', rng); }
  } else if (level === 1) {
    const mainD = Math.max(4, Math.min(6, Math.floor(d * 0.40)));
    const t1 = rng();
    const roof1 = t1 < 0.3 ? 'xuan' : (t1 < 0.8 ? 'xie' : 'hip');
    proto.hall(ctx, x0 + shift, z0 + 1, x1 - 2, z0 + mainD, base, {
      roof: roof1, door: 'S', platform: 1, wallH: rng() < 0.4 ? 3 : 4, overhang: 1, openDoor: true,
      pitch: 0.85 + rng() * 0.15,
    });
    // 厢房按Plan.wingMode：W/E/both/none（非随机单厢，破复制感）
    const buildWing = (side) => {
      const wx0 = (side === 'W') ? x0 + 2 : x1 - 4;
      const wx1 = (side === 'W') ? x0 + 4 : x1 - 2;
      if (wx1 - wx0 < 2 || z1 - (z0 + mainD + 2) < 3) return;
      proto.hall(ctx, wx0, z0 + mainD + 2, wx1, z1 - 2, base, { roof: rng() < 0.7 ? 'xuan' : 'xie', door: side === 'W' ? 'E' : 'W', wallH: 2 + (rng() < 0.5 ? 1 : 0), overhang: 1, windows: false, pitch: 0.92 });
    };
    if (d >= 10 && w >= 10) {
      if (plan.wingMode === 'both') { buildWing('W'); buildWing('E'); }
      else if (plan.wingMode === 'W' || plan.wingMode === 'E') buildWing(plan.wingMode);
      else if (plan.wingMode === 'none') { /* 无厢，庭院开敞 */ }
      else { const ws = rng() < 0.5 ? 'W' : 'E'; buildWing(ws); }
    }
    if (plan.rearHall && d >= 12) proto.hall(ctx, x0 + 3, z1 - 5, x0 + 6, z1 - 2, base, { roof: 'xuan', door: 'N', wallH: 3, overhang: 1, windows: false }); // 后罩房
    if (plan.serviceCourt) { store.set(x0 + 2, base, z1 - 2, PAL.fieldEarth); } // 厨院土面
    if (plan.well) proto.well(ctx, x0 + 2, z1 - 4, base);
    else if (rng() < 0.3) proto.tree(ctx, x1 - 2, z1 - 2, base, 'wutong', rng);
    if (plan.garden) proto.tree(ctx, x1 - 3, z0 + mainD + 2, base, 'apricot', rng);
  } else {
    // 小宅第：乌头门 + 高台正堂 + 东西回廊（Plan控制跨院/后寝）
    if (g.gAxis === 'NS' && plan.gateType === 'wutou') proto.wutouGate(ctx, g.gx, g.gz, base, 'NS');
    const mainD = Math.max(4, Math.min(6, Math.floor(d * 0.38)));
    const t2 = rng();
    const roof2 = t2 < 0.2 ? 'xie' : 'hip';
    proto.hall(ctx, x0 + shift, z0 + 1, x1 - 2, z0 + mainD, base, {
      roof: roof2, doubleEave: t2 >= 0.7, door: 'S', platform: 1, wallH: 4 + (rng() < 0.3 ? 1 : 0),
      col: PAL.zhuBright, overhang: 2, openDoor: true, pitch: 0.82 + rng() * 0.18,
    });
    if (d >= 11 && w >= 12) {
      colonnade(ctx, x0 + 2, z0 + mainD + 1, x0 + 2, z1 - 2, base);
      if (plan.wingMode !== 'W') colonnade(ctx, x1 - 2, z0 + mainD + 1, x1 - 2, z1 - 2, base);
    }
    if (plan.sideCourt && w >= 14) { store.set(x0 + 2, base, z0 + mainD + 2, PAL.brickPave); } // 跨院铺地
    if (plan.well) proto.well(ctx, x0 + 2, z1 - 4, base);
    if (rng() < 0.5) proto.tree(ctx, x1 - 3, z1 - 3, base, 'pine', rng);
  }
  ctx.counters.houses++;
};

// ================================================================ 多进府第建筑群（门屋-前庭-正厅-后寝-廊庑-偏院）
// 主轴恒南北、正厅坐北朝南；大门随 facing：S 中轴直入 / N 西北角门沿西廊入 / E、W 侧门折入前庭。
proto.manor = function (ctx, x0, z0, x1, z1, base, facing, rng, opts) {
  CHANGAN._noteGeneric(ctx, 'proto.manor');
  opts = opts || {};
  const level = opts.level || 2;
  const { store } = ctx;
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  const cx = (x0 + x1) >> 1;
  const g = enclose(ctx, x0, z0, x1, z1, base, facing || 'S', {});

  // 纵深分配（自北而南）：后寝带 4~5 / 正厅带 6~7 / 前庭（余量）
  const backD = d >= 20 ? 5 : 0;
  const hallD = Math.min(7, Math.max(5, Math.floor(d * 0.3)));
  const hz0 = z0 + 1 + backD + (backD ? 1 : 0);          // 正厅北缘
  const hallW = Math.min(w - 8, level >= 3 ? 13 : 11);
  const hx0 = cx - (hallW >> 1), hx1 = hx0 + hallW - 1;

  // 大门：L3 乌头门，其余屋宇式门屋（门洞在围墙，门屋内退一步）
  if (level >= 3 && g.gAxis === 'NS') proto.wutouGate(ctx, g.gx, g.gz, base, 'NS');
  else if (g.gAxis === 'NS') {
    const iz = g.facing === 'S' ? g.gz - 3 : g.gz + 2;
    proto.hall(ctx, g.gx - 2, iz, g.gx + 2, iz + 1, base, { roof: 'xuan', door: g.facing === 'S' ? 'N' : 'S', wallH: 3, overhang: 1, windows: false });
  } else {
    const ix = g.facing === 'E' ? g.gx - 3 : g.gx + 2;
    proto.hall(ctx, ix, g.gz - 2, ix + 1, g.gz + 2, base, { roof: 'xuan', door: g.facing === 'E' ? 'W' : 'E', wallH: 3, overhang: 1, windows: false });
  }

  // 砖道：门 → 前庭 → 正厅
  if (g.gAxis === 'NS') {
    for (let z = z0 + 1; z <= z1 - 1; z++) store.set(g.facing === 'N' ? x0 + 2 : g.gx, base, z, PAL.brickPave);
    if (g.facing === 'N') for (let x = x0 + 2; x <= cx; x++) store.set(x, base, (hz0 + hallD + z1) >> 1, PAL.brickPave);
  } else {
    const midZ = (hz0 + hallD + z1) >> 1;
    for (let x = Math.min(g.gx, cx); x <= Math.max(g.gx, cx); x++) if (x > x0 && x < x1) store.set(x, base, g.gz, PAL.brickPave);
    for (let z = hz0 + hallD + 1; z <= g.gz; z++) store.set(cx, base, z, PAL.brickPave);
    for (let z = g.gz; z <= z1 - 1; z++) store.set(cx, base, z, PAL.brickPave);
  }

  // 正厅：高台大屋（府第体量核心，正门洞与砖道相接）
  proto.hall(ctx, hx0, hz0, hx1, hz0 + hallD - 1, base, {
    roof: 'xie', door: 'S', platform: level >= 3 ? 2 : 1, wallH: 4, openDoor: true,
    col: PAL.zhuBright, overhang: 2, trim: level >= 3 ? PAL.glazeGreen : undefined,
  });

  // 后寝
  if (backD) {
    proto.hall(ctx, cx - Math.min(4, (hallW >> 1) - 1), z0 + 1, cx + Math.min(4, (hallW >> 1) - 1), z0 + backD, base, {
      roof: 'xuan', door: 'S', platform: 1, wallH: 3, overhang: 1,
    });
  }

  // 前庭两侧廊庑（通透柱廊，视线穿廊见庭）
  colonnade(ctx, x0 + 1, hz0 + hallD + 1, x0 + 1, z1 - 2, base);
  colonnade(ctx, x1 - 1, hz0 + hallD + 1, x1 - 1, z1 - 2, base);

  // L3 偏院：西跨院隔墙 + 小厅 + 花木
  if (level >= 3 && w >= 24) {
    const sx = x0 + 8;
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      if (Math.abs(z - ((hz0 + hallD + z1) >> 1)) <= 1) continue; // 隔墙上的过门
      store.set(sx, base + 1, z, PAL.rammed); store.set(sx, base + 2, z, PAL.rammedLight); store.set(sx, base + 3, z, PAL.roofGrey);
    }
    proto.hall(ctx, x0 + 2, hz0, x0 + 6, hz0 + 4, base, { roof: 'xuan', door: 'E', wallH: 3, overhang: 1 });
    proto.tree(ctx, x0 + 4, hz0 + hallD + 3, base, rng() < 0.5 ? 'pine' : 'huai', rng);
    proto.well(ctx, x0 + 2, z1 - 4, base);
  }
  // 庭中点景
  if (rng() < 0.6) proto.tree(ctx, hx1 + 2, hz0 + hallD + 2, base, rng() < 0.5 ? 'pine' : 'wutong', rng);
  ctx.counters.houses++;
  ctx.counters.halls++;
};

// ================================================================ 衙署建筑群（门屋-戒石-正堂-后堂-廊庑）
proto.office = function (ctx, x0, z0, x1, z1, base, rng, facing) {
  CHANGAN._noteGeneric(ctx, 'proto.office');
  const { store } = ctx;
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  const cx = (x0 + x1) >> 1;
  const g = enclose(ctx, x0, z0, x1, z1, base, facing || 'S', {});
  // 门屋（屋宇式，内退）
  if (g.gAxis === 'NS') {
    const iz = g.facing === 'S' ? g.gz - 3 : g.gz + 2;
    proto.hall(ctx, g.gx - 2, iz, g.gx + 2, iz + 1, base, { roof: 'xuan', door: g.facing === 'S' ? 'N' : 'S', wallH: 3, overhang: 1, windows: false });
  }
  // 正堂居北（高台、歇山、朱柱，正门洞与砖道相接）
  const hallW = Math.min(w - 6, 11);
  const hx0 = cx - (hallW >> 1);
  proto.hall(ctx, hx0, z0 + 1, hx0 + hallW - 1, z0 + 6, base, { roof: 'xie', door: 'S', platform: 1, wallH: 4, col: PAL.zhuBright, overhang: 2, openDoor: true });
  // 后堂
  if (d >= 18) proto.hall(ctx, cx - 3, z0 + 8, cx + 3, z0 + 11, base, { roof: 'xuan', door: 'S', wallH: 3, overhang: 1 });
  // 戒石小亭（院中轴）
  proto.roof(ctx, 'jian', cx - 1, z0 + 12, cx + 1, z0 + 14, base + 2, { overhang: 1, finial: PAL.stoneGrey });
  store.set(cx, base + 1, z0 + 13, PAL.stoneGrey);
  // 两侧廊庑
  colonnade(ctx, x0 + 1, z0 + 8, x0 + 1, z1 - 3, base);
  colonnade(ctx, x1 - 1, z0 + 8, x1 - 1, z1 - 3, base);
  // 砖道
  for (let z = z0 + 1; z <= z1 - 1; z++) store.set(g.gAxis === 'NS' ? g.gx : cx, base, z, PAL.brickPave);
  ctx.counters.halls++;
  ctx.counters.buildings++;
};

// ================================================================ 乌头门（双柱出头 + 乌头金顶 + 门额横枋 + 双扇板门）
proto.wutouGate = function (ctx, x, z, base, axis) {
  const { store } = ctx;
  const dx = axis === 'NS' ? 1 : 0, dz = axis === 'NS' ? 0 : 1;
  // 两侧大柱（高出顶额）
  for (const s of [-2, 2]) {
    const px = x + dx * s, pz = z + dz * s;
    for (let y = 1; y <= 4; y++) store.set(px, base + y, pz, PAL.zhuDeep);
    store.set(px, base + 5, pz, PAL.roofDark); // 乌头（黑漆柱头）
    store.set(px, base + 6, pz, PAL.gold);     // 金铜顶冒
  }
  // 额枋横木
  for (let s = -1; s <= 1; s++) {
    store.set(x + dx * s, base + 4, z + dz * s, PAL.timber);
  }
  // 双扇门扉
  store.set(x - dx, base + 1, z - dz, PAL.doorDark); store.set(x - dx, base + 2, z - dz, PAL.doorDark);
  store.set(x + dx, base + 1, z + dz, PAL.doorDark); store.set(x + dx, base + 2, z + dz, PAL.doorDark);
  // 中缝留空或开启
};

// ================================================================ 大雁塔（旧逐层堆叠，已废弃为最终方案，保留仅供普通小塔；P0须用buildDayanPagoda）
proto.pagodaLouge = function (ctx, cx, cz, base, opts) {
  CHANGAN._noteGeneric(ctx, 'proto.pagodaLouge');
  const { store } = ctx;
  opts = opts || {};
  const layers = opts.layers || 7;
  let size = opts.size || 9;
  let y = base;

  // 宽阔塔基大台
  store.fill(cx - (size >> 1) - 2, y + 1, cz - (size >> 1) - 2, cx + (size >> 1) + 2, y + 1, cz + (size >> 1) + 2, PAL.stoneGrey);
  store.fill(cx - (size >> 1) - 1, y + 2, cz - (size >> 1) - 1, cx + (size >> 1) + 1, y + 2, cz + (size >> 1) + 1, PAL.stoneWhite);
  y += 2;

  for (let L = 0; L < layers; L++) {
    const half = size >> 1;
    // 塔身（灰砖，平座与券门）
    for (let x = cx - half; x <= cx + half; x++) {
      for (let z = cz - half; z <= cz + half; z++) {
        const edge = (x === cx - half || x === cx + half || z === cz - half || z === cz + half);
        if (!edge) continue;
        store.set(x, y + 1, z, PAL.brickPave);
        store.set(x, y + 2, z, PAL.brickPave);
        // 南向券门（门洞与佛龛）
        if (z === cz + half && Math.abs(x - cx) <= 0) {
          store.set(x, y + 1, z, PAL.doorDark);
          store.set(x, y + 2, z, PAL.doorDark);
        }
      }
    }
    // 出檐与平座栏杆
    store.fill(cx - half - 1, y + 3, cz - half - 1, cx + half + 1, y + 3, cz + half + 1, PAL.roofGrey);
    for (let x = cx - half - 1; x <= cx + half + 1; x++) {
      store.set(x, y + 3, cz - half - 1, PAL.roofLight);
      store.set(x, y + 3, cz + half + 1, PAL.roofLight);
    }
    for (let z = cz - half - 1; z <= cz + half + 1; z++) {
      store.set(cx - half - 1, y + 3, z, PAL.roofLight);
      store.set(cx + half + 1, y + 3, z, PAL.roofLight);
    }
    y += 3;
    if (L % 2 === 1 && size > 4) size--; // 逐层稳健收分
  }

  // 相轮塔刹
  store.set(cx, y + 1, cz, PAL.stoneGrey);
  store.set(cx, y + 2, cz, PAL.bronze);
  store.set(cx, y + 3, cz, PAL.bronze);
  store.set(cx, y + 4, cz, PAL.gold); // 鎏金宝珠
  ctx.counters.towers++;
  return y + 4;
};

// ================================================================ 小雁塔（旧密檐板，已废弃为最终方案，保留仅供普通小塔；P0须用buildXiaoyanPagoda）
proto.pagodaMiyan = function (ctx, cx, cz, base, opts) {
  CHANGAN._noteGeneric(ctx, 'proto.pagodaMiyan');
  const { store } = ctx;
  opts = opts || {};
  const layers = opts.layers || 13;

  // 坚实石台基
  store.fill(cx - 4, base + 1, cz - 4, cx + 4, base + 1, cz + 4, PAL.stoneGrey);

  // 首层塔身（高 4 格，雄健端庄）
  for (let x = cx - 3; x <= cx + 3; x++) {
    for (let z = cz - 3; z <= cz + 3; z++) {
      if (x !== cx - 3 && x !== cx + 3 && z !== cz - 3 && z !== cz + 3) continue;
      for (let y = 2; y <= 5; y++) store.set(x, base + y, z, PAL.brickPave);
    }
  }
  // 南面券门
  store.set(cx, base + 2, cz + 3, PAL.doorDark);
  store.set(cx, base + 3, cz + 3, PAL.doorDark);

  let y = base + 6, size = 4;
  for (let L = 0; L < layers; L++) {
    // 密檐出挑：逐层向上叠收，呈现唐代柔和曲线
    const half = Math.max(1, size - Math.floor(L / 3.2));
    store.fill(cx - half, y, cz - half, cx + half, y, cz + half, L % 2 ? PAL.roofGrey : PAL.roofLight);
    y++;
  }

  // 塔刹
  store.set(cx, y, cz, PAL.bronze);
  store.set(cx, y + 1, cz, PAL.gold);
  ctx.counters.towers++;
  return y + 1;
};

// ================================================================ 城门重楼（旧通用门楼，仅供普通郭城门/坊门；P0须用独立builder）
proto.gateTower = function (ctx, g) {
  CHANGAN._noteGeneric(ctx, 'proto.gateTower');
  const { store, fields, CFG } = ctx;
  const b = g.towerBase; if (!b) return;
  const gy = fields.groundH[CHANGAN.fieldIndex(g.x, g.z)] + CFG.Y.WALL_H + 1;

  const pad = 1;
  const x0 = b.x0 + pad, x1 = b.x1 - pad, z0 = b.z0 + pad, z1 = b.z1 - pad;

  // 1. 平坐楼台板
  store.fill(x0 - 1, gy, z0 - 1, x1 + 1, gy, z1 + 1, PAL.timber);

  // 2. 第一层楼身
  wallRing(ctx, x0, z0, x1, z1, gy + 1, 4, PAL.plaster, PAL.zhu, { windows: true, openDoor: false });
  dougong(ctx, x0, z0, x1, z1, gy + 4);
  proto.roof(ctx, 'hip', x0, z0, x1, z1, gy + 5, {
    main: PAL.roofGrey, lip: PAL.roofLight, trim: g.level >= 5 ? PAL.glazeGreen : null, overhang: 2,
  });

  // 3. 第二层重楼
  const ix0 = x0 + 2, ix1 = x1 - 2, iz0 = z0 + 1, iz1 = z1 - 1;
  if (ix1 > ix0 && iz1 > iz0) {
    wallRing(ctx, ix0, iz0, ix1, iz1, gy + 8, 3, PAL.plaster, PAL.zhu, { windows: true });
    dougong(ctx, ix0, iz0, ix1, iz1, gy + 10);
    proto.roof(ctx, g.level >= 4 ? 'hip' : 'xie', ix0, iz0, ix1, iz1, gy + 11, {
      main: PAL.roofGrey, lip: PAL.roofLight, trim: g.level >= 5 ? PAL.glazeGreen : null, overhang: 1,
    });
  }
  ctx.counters.towers++;
};

// 角楼
proto.cornerTower = function (ctx, x, z, base) {
  const { store } = ctx;
  store.fill(x - 2, base + 1, z - 2, x + 2, base + 3, z + 2, PAL.rammedDark);
  wallRing(ctx, x - 2, z - 2, x + 2, z + 2, base + 4, 3, PAL.plaster, PAL.zhu, { windows: true });
  proto.roof(ctx, 'xie', x - 2, z - 2, x + 2, z + 2, base + 7, { overhang: 1 });
  ctx.counters.towers++;
};

// ================================================================ 寺院建筑群（旧统一模板，已拆分为五语法；此处仅供普通寺院，皇家寺院禁作主体）
proto.temple = function (ctx, x0, z0, x1, z1, base, opts) {
  CHANGAN._noteGeneric(ctx, 'proto.temple');
  const { store } = ctx;
  opts = opts || {};
  const cx = (x0 + x1) >> 1;
  const w = x1 - x0 + 1, d = z1 - z0 + 1;

  // 外墙（山门处留空，墙头压瓦、转角泛红）
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      if (z === z1 && Math.abs(x - cx) <= 2) continue; // 山门留空
      store.set(x, base + 1, z, PAL.rammed);
      store.set(x, base + 2, z, PAL.rammedLight);
      store.set(x, base + 3, z, PAL.zhu);
      store.set(x, base + 4, z, PAL.roofGrey);
    }
  }

  // 1. 山门殿（三门道，歇山顶）
  proto.hall(ctx, cx - 4, z1 - 3, cx + 4, z1 - 1, base, { roof: 'xie', door: 'N', wallH: 3, openDoor: true });

  // 2. 大雄宝殿（前院之北，高台，深远出檐；big 则重檐庑殿；正门洞真实留空与庭院相接）
  const hallSpan = opts.big ? 8 : 6;
  proto.hall(ctx, cx - hallSpan, z0 + 6, cx + hallSpan, z0 + 13, base, {
    roof: opts.big ? 'hip' : 'xie', door: 'S', platform: 2, openDoor: true,
    trim: opts.palace ? PAL.glazeGreen : null, doubleEave: !!opts.big,
    col: PAL.zhuBright, wallH: 4,
  });

  // 3. 前院回廊：沿东西墙内侧柱廊，北折围合殿庭（廊院感核心；有前塔时西侧廊避让塔台）
  if (d >= 20 && w >= 18) {
    if (opts.pagoda === 'front' && d >= 26) {
      colonnade(ctx, x0 + 2, z0 + 4, x0 + 2, z0 + 12, base);
      colonnade(ctx, x0 + 2, z0 + 24, x0 + 2, z1 - 5, base);
    } else {
      colonnade(ctx, x0 + 2, z0 + 4, x0 + 2, z1 - 5, base);
    }
    colonnade(ctx, x1 - 2, z0 + 4, x1 - 2, z1 - 5, base);
  }

  // 4. 法堂/藏经阁（殿后）
  if (opts.pavilion !== false && d >= 24) {
    const gx0 = cx - 4, gz0 = z0 + 16;
    proto.hall(ctx, gx0, gz0, gx0 + 8, gz0 + 5, base, { roof: 'xie', door: 'S', platform: 1, wallH: 4 });
  }

  // 5. 经幢与石灯（大殿前庭左右）
  proto.jingchuang(ctx, cx - hallSpan - 2, z0 + 10, base);
  proto.stoneLamp(ctx, cx + hallSpan + 2, z0 + 10, base);

  // 6. 前塔后殿：前院西南密檐小塔（唐初寺塔格局；塔台内收，不越寺墙）
  if (opts.pagoda === 'front' && d >= 26) {
    proto.pagodaMiyan(ctx, x0 + 5, z0 + 18, base, { layers: 5 });
    proto.tree(ctx, x0 + 5, z0 + 24, base, 'pine', CHANGAN.rngOf(ctx.seed, 'tpag' + x0));
  }

  // 7. 苍松翠竹（前后院散植）
  const rng = CHANGAN.rngOf(ctx.seed, 'temple-tree-' + x0);
  for (let k = 0; k < 5; k++) {
    proto.tree(ctx, CHANGAN.rint(rng, x0 + 2, x1 - 2), CHANGAN.rint(rng, z0 + 2, z1 - 2), base, rng() < 0.7 ? 'pine' : 'bamboo', rng);
  }
  ctx.counters.temples++;
};
// ================================================================ 寺院五语法（Small/Medium/Royal/Pagoda/Monastery，按规模/皇家等级/塔位/院落/僧房/廊院/园林区分）
CHANGAN.TempleGrammar = {
  Small(ctx, x0, z0, x1, z1, base) { // 小寺：山门小殿+单院，无塔
    CHANGAN._noteGeneric(ctx, 'temple-small');
    const cx = (x0 + x1) >> 1;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      if (z === z1 && Math.abs(x - cx) <= 1) continue;
      ctx.store.set(x, base + 1, z, PAL.rammed); ctx.store.set(x, base + 2, z, PAL.rammedLight);
    }
    proto.hall(ctx, cx - 3, z1 - 2, cx + 3, z1 - 1, base, { roof: 'xie', door: 'N', wallH: 3, openDoor: true });
    proto.hall(ctx, cx - 4, z0 + 3, cx + 4, z0 + 7, base, { roof: 'xie', door: 'S', platform: 1, wallH: 3, openDoor: true });
    ctx.counters.temples++;
  },
  Medium(ctx, x0, z0, x1, z1, base, opts) { // 中寺：沿用通用廊院式（普通寺院）
    opts = opts || {};
    proto.temple(ctx, x0, z0, x1, z1, base, opts);
  },
  Royal(ctx, x0, z0, x1, z1, base, opts) { // 皇家大寺：三进庭院+塔 core+经院僧院+琉璃剪边（禁普通放大）
    CHANGAN.enterLandmark(ctx, 'royal-temple');
    opts = opts || {};
    const cx = (x0 + x1) >> 1;
    // 外墙高大（朱帽+瓦顶）
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      if (z === z1 && Math.abs(x - cx) <= 2) continue;
      ctx.store.set(x, base + 1, z, PAL.rammed); ctx.store.set(x, base + 2, z, PAL.rammedLight); ctx.store.set(x, base + 3, z, PAL.zhuDeep); ctx.store.set(x, base + 4, z, PAL.roofGrey);
    }
    const midZ = (z0 + z1) >> 1;
    // 山门殿（五间）
    proto.hall(ctx, cx - 5, z1 - 3, cx + 5, z1 - 1, base, { roof: 'xie', door: 'N', wallH: 3, openDoor: true });
    // 前院：钟鼓楼对峙
    proto.hall(ctx, x0 + 2, midZ - 2, x0 + 5, midZ + 1, base, { roof: 'jian', wallH: 3, windows: false });
    proto.hall(ctx, x1 - 5, midZ - 2, x1 - 2, midZ + 1, base, { roof: 'jian', wallH: 3, windows: false });
    // 大殿（重檐庑殿，琉璃剪边，皇家尺度）
    Tang.HallBuilder.build(ctx, cx - 8, z0 + 6, cx + 8, z0 + 14, base, 4, { roof: 'hip', door: 'S', name: 'royal-hall', colC: PAL.zhuBright });
    // 法堂+藏经阁（后院双堂）
    proto.hall(ctx, cx - 5, z0 + 17, cx + 5, z0 + 21, base, { roof: 'xie', door: 'S', platform: 1, wallH: 4 });
    // 东西僧院（南北长房+经院小院）
    for (const sx of [x0 + 2, x1 - 7]) {
      proto.hall(ctx, sx, z0 + 4, sx + 5, z0 + 8, base, { roof: 'xuan', wallH: 3, windows: true });
      proto.hall(ctx, sx, z0 + 10, sx + 5, z0 + 14, base, { roof: 'xuan', wallH: 3, windows: true });
    }
    // 回廊围合+经幢石灯+松竹园林
    proto.colonnade(ctx, x0 + 2, z0 + 4, x0 + 2, z1 - 5, base);
    proto.colonnade(ctx, x1 - 2, z0 + 4, x1 - 2, z1 - 5, base);
    proto.jingchuang(ctx, cx - 10, z0 + 10, base); proto.stoneLamp(ctx, cx + 10, z0 + 10, base);
    const rng = CHANGAN.rngOf(ctx.seed, 'royal-tree-' + x0);
    for (let k = 0; k < 8; k++) proto.tree(ctx, CHANGAN.rint(rng, x0 + 2, x1 - 2), CHANGAN.rint(rng, z0 + 2, z1 - 2), base, rng() < 0.6 ? 'pine' : 'bamboo', rng);
    CHANGAN.logBuild(ctx, { kind: 'temple', name: 'royal', x0, z0, x1, z1, h: 12, roof: 'hip-royal', platform: 2, bays: 'royal3court', rank: 4, generic: false, symmetry: 'sym' });
    ctx.counters.temples++;
    CHANGAN.exitLandmark(ctx);
  },
  Pagoda(ctx, x0, z0, x1, z1, base, buildPagoda) { // 塔院为核心：塔+围廊+小殿（塔寺一体）
    const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
    buildPagoda(ctx, cx, cz, base);
    proto.hall(ctx, cx - 5, z0 + 2, cx + 5, z0 + 6, base, { roof: 'xie', door: 'S', platform: 1 });
    proto.colonnade(ctx, x0 + 2, z0 + 2, x0 + 2, z1 - 2, base);
    proto.colonnade(ctx, x1 - 2, z0 + 2, x1 - 2, z1 - 2, base);
    ctx.counters.temples++;
  },
  Monastery(ctx, x0, z0, x1, z1, base) { // 僧团大院：多僧房+经院+斋堂+园林（高密度低等级）
    for (let i = 0; i < 3; i++) {
      const rz = z0 + 3 + i * 7;
      if (rz + 4 > z1 - 2) break;
      proto.hall(ctx, x0 + 2, rz, x1 - 2, rz + 4, base, { roof: 'xuan', wallH: 3, windows: true });
    }
    proto.tree(ctx, x0 + 3, z1 - 3, base, 'bamboo', CHANGAN.rngOf(ctx.seed, 'mon-' + x0));
    ctx.counters.temples++;
  }
};
// ================================================================ 店肆十类型（东精西杂，差异来自建筑空间密度院落仓储街面，非旗色）
CHANGAN.ShopType = {
  ShopHouse(ctx, x0, z0, w, d, base, trade, east, rng, facing) { proto.shop(ctx, x0, z0, w, d, base, trade, east, rng, facing); },
  Warehouse(ctx, x0, z0, w, d, base, rng) { // 仓：高墙小窗平顶（夯土厚墙+小气窗）
    const x1 = x0 + w - 1, z1 = z0 + d - 1;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      for (let y = 1; y <= 4; y++) ctx.store.set(x, base + y, z, y <= 3 ? PAL.rammed : PAL.rammedLight);
    }
    ctx.store.fill(x0, base + 5, z0, x1, base + 5, z1, PAL.roofGrey);
    ctx.counters.shops++;
  },
  Inn(ctx, x0, z0, w, d, base, rng, facing) { // 邸店：二层楼+天井
    proto.shop(ctx, x0, z0, w, d, base, '邸店', false, rng, facing);
    ctx.store.set(x0 + 1, base + 4, z0 + 1, PAL.lantern); ctx.counters.lamps++;
  },
  ForeignCompound(ctx, x0, z0, w, d, base, rng, facing) { // 胡商邸店群：主店+偏仓+胡毯金器+尖帽旗（朝向随街）
    proto.shop(ctx, x0, z0, Math.min(w, 6), d, base, '胡商邸店', false, rng, facing || 'S');
    if (w >= 9) CHANGAN.ShopType.Warehouse(ctx, x0 + 7, z0, w - 7, d, base, rng);
    ctx.store.set(x0 + 1, base + 1, z0 + d - 1, PAL.clothHu);
  },
  Workshop(ctx, x0, z0, w, d, base, rng, facing) { // 作坊：敞口+烟囱（朝向随街）
    proto.shop(ctx, x0, z0, w, d, base, '作坊', false, rng, facing || 'S');
    ctx.store.set(x0 + w - 1, base + 4, z0 + 1, PAL.iron);
  },
  LuxuryShop(ctx, x0, z0, w, d, base, trade, rng, facing) { // 高等级小店：粉壁+琉璃剪边+精致院
    proto.shop(ctx, x0, z0, w, d, base, trade, true, rng, facing);
    ctx.store.set(x0, base + 4, z0, PAL.glazeGreen);
  },
  MarketOffice(ctx, x0, z0, w, d, base) { // 市署小衙：门屋+正堂
    proto.office(ctx, x0, z0, x0 + w - 1, z0 + d - 1, base, CHANGAN.rngOf(1, 'mo'), 'S');
  },
  MarketTowerRef(ctx, cx, cz, base) { proto.marketTower(ctx, cx, cz, base); },
  CourtyardShop(ctx, x0, z0, w, d, base, trade, east, rng, facing) { // 前店后院：店+仓院（朝向随街）
    proto.shop(ctx, x0, z0, w, Math.min(d, 5), base, trade, east, rng, facing || 'S');
    if (d >= 9) { for (let x = x0; x < x0 + w; x++) for (let z = z0 + 5; z < z0 + d; z++) ctx.store.set(x, base, z, PAL.loess); }
    ctx.counters.shops++;
  },
  StorageYard(ctx, x0, z0, w, d, base, rng) { // 货场：露天货堆+缆桩+围栏
    for (let x = x0; x < x0 + w; x += 2) for (let z = z0; z < z0 + d; z += 2) if (rng() < 0.6) proto.crate(ctx, x, z, base, rng);
    for (let x = x0; x < x0 + w; x++) { ctx.store.set(x, base + 1, z0, PAL.timberDark); ctx.store.set(x, base + 1, z0 + d - 1, PAL.timberDark); }
  }
};

proto.jingchuang = function (ctx, x, z, base) {
  const { store } = ctx;
  store.set(x, base + 1, z, PAL.stoneGrey);
  store.set(x, base + 2, z, PAL.stoneWhite);
  store.set(x, base + 3, z, PAL.stoneWhite);
  store.set(x, base + 4, z, PAL.stoneGrey);
  ctx.counters.pavilions++;
};

proto.stoneLamp = function (ctx, x, z, base) {
  const { store } = ctx;
  store.set(x, base + 1, z, PAL.stoneGrey);
  store.set(x, base + 2, z, PAL.stoneGrey);
  store.set(x, base + 3, z, PAL.candle);
  store.set(x, base + 4, z, PAL.stoneGrey);
  ctx.counters.lamps++;
};

// ================================================================ 市楼（市署：二层重楼 + 旗亭鼓钲）
proto.marketTower = function (ctx, cx, cz, y0) {
  const { store } = ctx;
  // 基座
  store.fill(cx - 3, y0, cz - 3, cx + 3, y0 + 1, cz + 3, PAL.stoneGrey);
  // 一层：开放柱廊
  wallRing(ctx, cx - 2, cz - 2, cx + 2, cz + 2, y0 + 2, 3, PAL.plaster, PAL.zhu, { windows: true });
  proto.roof(ctx, 'jian', cx - 2, cz - 2, cx + 2, cz + 2, y0 + 5, { overhang: 1, finial: PAL.bronze });

  // 二层：市楼议事亭
  wallRing(ctx, cx - 1, cz - 1, cx + 1, cz + 1, y0 + 7, 3, PAL.plaster, PAL.zhu, { windows: true });
  proto.roof(ctx, 'jian', cx - 1, cz - 1, cx + 1, cz + 1, y0 + 10, { overhang: 1, finial: PAL.gold });

  // 旗杆 + 市旗（立于地面，高拔挺立）
  store.fill(cx + 4, y0 - 2, cz + 4, cx + 4, y0 + 12, cz + 4, PAL.timberDark);
  store.set(cx + 5, y0 + 11, cz + 4, PAL.flagYellow);
  store.set(cx + 5, y0 + 10, cz + 4, PAL.flagRed);
  ctx.counters.towers++;
};

// ================================================================ 店肆（面向市街开门 + 门前布棚 + 行业旗幌 + 店头暖灯）
// facing: 'N'|'S'|'E'|'W'，店面朝向所临市街（棚、旗、门均在临街一侧）
proto.shop = function (ctx, x0, z0, w, d, base, trade, east, rng, facing) {
  const { store } = ctx;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  const doorSide = facing || 'S';
  const twoFloor = rng() < (trade === '酒肆' || trade === '邸店' || trade === '胡商邸店' ? 0.7 : 0.25);
  const wallH = twoFloor ? 4 : 3;

  // 1. 店铺主体
  wallRing(ctx, x0, z0, x1, z1, base + 1, wallH, rng() < 0.5 ? PAL.plaster : PAL.plasterWarm, PAL.zhu, {
    door: doorSide, windows: true, openDoor: true,
  });
  dougong(ctx, x0, z0, x1, z1, base + wallH);
  proto.roof(ctx, 'xuan', x0, z0, x1, z1, base + wallH + 1, { main: PAL.roofGrey, lip: PAL.roofLight, overhang: 1 });

  // 2. 临街布棚（外挑 1 格，遮阳蔽雨；与店体连通）
  const awningY = base + wallH;
  if (doorSide === 'S') { for (let x = x0; x <= x1; x++) store.set(x, awningY, z1 + 1, PAL.clothCream); }
  else if (doorSide === 'N') { for (let x = x0; x <= x1; x++) store.set(x, awningY, z0 - 1, PAL.clothCream); }
  else if (doorSide === 'E') { for (let z = z0; z <= z1; z++) store.set(x1 + 1, awningY, z, PAL.clothCream); }
  else { for (let z = z0; z <= z1; z++) store.set(x0 - 1, awningY, z, PAL.clothCream); }

  // 3. 行业旗幌（门外立杆挂行旗）
  const fx = doorSide === 'E' ? x1 + 2 : doorSide === 'W' ? x0 - 2 : x0 + 1;
  const fz = doorSide === 'S' ? z1 + 2 : doorSide === 'N' ? z0 - 2 : z0 + 1;
  const flagC = { '酒肆': PAL.flagRed, '胡商邸店': PAL.flagPurple, '金银': PAL.flagYellow, '绢帛': PAL.flagBlue, '药材': PAL.flagGreen, '香药': PAL.flagGreen, '书坊': PAL.paperWhite }[trade] || PAL.flagYellow;
  store.set(fx, base + 1, fz, PAL.timberDark);
  store.set(fx, base + 2, fz, PAL.timberDark);
  store.set(fx, base + 3, fz, PAL.timberDark);
  const bx = fx + (doorSide === 'N' || doorSide === 'S' ? 1 : 0), bz = fz + (doorSide === 'E' || doorSide === 'W' ? 1 : 0);
  store.set(bx, base + 3, bz, flagC);
  store.set(bx, base + 2, bz, flagC);
  (ctx.shopFlagCells = ctx.shopFlagCells || []).push([fx, fz]); // 临街开店审计取样点

  // 胡商邸店特色装饰（胡毯、金器）
  if (!east && (trade === '胡商邸店' || trade === '酒肆')) {
    const dx = doorSide === 'E' ? x1 : doorSide === 'W' ? x0 : x0 + 1;
    const dz = doorSide === 'S' ? z1 : doorSide === 'N' ? z0 : z0 + 1;
    store.set(dx, base + 1, dz, PAL.clothHu);
    store.set(Math.min(Math.max(dx + 1, x0), x1), base + 1, dz, PAL.gold);
  }

  // 店头暖灯
  if (rng() < 0.6) {
    const lx = doorSide === 'S' ? x1 - 1 : doorSide === 'N' ? x1 - 1 : (doorSide === 'E' ? x1 : x0);
    const lz = doorSide === 'S' ? z1 + 1 : doorSide === 'N' ? z0 - 1 : z0;
    store.set(lx, base + 3, lz, PAL.lantern);
    ctx.counters.lamps++;
  }
  ctx.counters.shops++;
};

proto.stall = function (ctx, x, z, base, rng) {
  const { store } = ctx;
  store.set(x, base + 1, z, PAL.timber); store.set(x + 1, base + 1, z, PAL.timber);
  store.set(x, base + 2, z, rng() < 0.5 ? PAL.flagGreen : PAL.clothCream);
  store.set(x + 1, base + 2, z, PAL.clothCream);
  ctx.counters.shops++;
};

proto.crate = function (ctx, x, z, base, rng) {
  const { store } = ctx;
  store.set(x, base + 1, z, PAL.timber); store.set(x, base + 2, z, PAL.timberDark);
  if (rng() < 0.5) store.set(x + 1, base + 1, z, PAL.clothHu);
};

// ================================================================ 树木（槐/柳/松/竹/梧桐/榆/杏）
proto.tree = function (ctx, x, z, base, kind, rng) {
  const { store, fields } = ctx;
  if (x == null || z == null) return;
  const i = CHANGAN.fieldIndex(x, z);
  if (fields.canopy[i]) return;
  fields.canopy[i] = 1;
  rng = rng || CHANGAN.rngOf(ctx.seed, 'tree');
  const gy = base != null ? base : fields.groundH[i];

  const T = {
    huai:   { trunk: PAL.timberDark, leaf: [PAL.huaiGreen, PAL.huaiLight], h: 3, r: 1 },
    willow: { trunk: PAL.timber, leaf: [PAL.willowGreen], h: 3, r: 1, droop: true },
    pine:   { trunk: PAL.timberDark, leaf: [PAL.pineGreen], h: 4, r: 1 },
    bamboo: { trunk: PAL.bambooGreen, leaf: [PAL.bambooGreen], h: 3, r: 0 },
    wutong: { trunk: PAL.timber, leaf: [PAL.wutongGreen], h: 3, r: 1 },
    elm:    { trunk: PAL.timber, leaf: [PAL.grass], h: 3, r: 1 },
    apricot:{ trunk: PAL.timberDark, leaf: [PAL.apricotPink], h: 3, r: 1 },
  }[kind] || { trunk: PAL.timber, leaf: [PAL.huaiGreen], h: 3, r: 1 };

  const putIfFree = (px, py, pz, c) => { if (!store.get(px, py, pz)) store.set(px, py, pz, c); };
  const trunk = T.trunk;
  for (let y = 1; y <= T.h; y++) putIfFree(x, gy + y, z, trunk);

  if (kind === 'bamboo') {
    for (let b = 0; b < 3; b++) {
      const bx = x + (b % 2), bz = z + (b >> 1);
      for (let y = 1; y <= 3 + (b % 2); y++) putIfFree(bx, gy + y, bz, PAL.bambooGreen);
      putIfFree(bx, gy + 4 + (b % 2), bz, PAL.huaiLight);
    }
  } else {
    const r = T.r, cy = gy + T.h + 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = 0; dy <= (kind === 'pine' ? 2 : 1); dy++) {
      if (dx * dx + dz * dz + dy * dy > r * r + 1.5) continue;
      if (kind === 'pine' && dy === 0 && (dx * dx + dz * dz) > 2) continue;
      const leafC = T.leaf[(dx + dz + dy + 99) % T.leaf.length];
      putIfFree(x + dx, cy + dy, z + dz, leafC);
    }
    if (T.droop) {
      for (const [dx, dz] of [[-r, 0], [r, 0], [0, -r], [0, r]]) putIfFree(x + dx, cy - 1, z + dz, T.leaf[0]);
    }
  }
  fields.topH[i] = Math.max(fields.topH[i], gy + T.h + 2);
  ctx.counters.trees++;
};

// ================================================================ 井亭 / 石桥 / 亭台
proto.well = function (ctx, x, z, base) {
  if (base == null) return;
  const { store } = ctx;
  // 石砌井圈
  store.set(x, base + 1, z, PAL.stoneGrey); store.set(x + 1, base + 1, z, PAL.stoneGrey);
  store.set(x, base + 1, z + 1, PAL.stoneGrey); store.set(x + 1, base + 1, z + 1, PAL.stoneGrey);
  // 四柱木构井亭
  store.set(x, base + 2, z, PAL.timber); store.set(x + 1, base + 2, z, PAL.timber);
  store.set(x, base + 2, z + 1, PAL.timber); store.set(x + 1, base + 2, z + 1, PAL.timber);
  // 小歇山/攒尖顶
  proto.roof(ctx, 'jian', x, z, x + 1, z + 1, base + 3, { overhang: 1, finial: PAL.stoneGrey });
  ctx.counters.wells++;
};

proto.bridge = function (ctx, x, z, axis, span, base) {
  const { store } = ctx;
  for (let s = 0; s <= span; s++) {
    const bx = axis === 'x' ? x + s : x, bz = axis === 'x' ? z : z + s;
    store.set(bx, base, bz, PAL.stoneWhite);
    if (axis === 'x') {
      store.set(bx, base + 1, bz - 1, PAL.stoneGrey); store.set(bx, base + 1, bz + 1, PAL.stoneGrey);
    } else {
      store.set(bx - 1, base + 1, bz, PAL.stoneGrey); store.set(bx + 1, base + 1, bz, PAL.stoneGrey);
    }
  }
  ctx.counters.bridges++;
};

proto.pavilion = function (ctx, x, z, base, kind) {
  const { store } = ctx;
  const s = kind === 'big' ? 2 : 1;
  store.fill(x - s, base + 1, z - s, x + s, base + 1, z + s, PAL.stoneWhite);
  for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    for (let y = 2; y <= 4; y++) store.set(x + dx, base + y, z + dz, PAL.zhu);
  }
  proto.roof(ctx, 'jian', x - s, z - s, x + s, z + s, base + 5, { overhang: 1, finial: PAL.gold });
  ctx.counters.pavilions++;
};

// ================================================================ 圜丘（四重圆台·十二陛）
proto.yuanqiu = function (ctx, cx, cz, base) {
  const { store } = ctx;
  const radii = [16, 12, 8, 4];
  for (let t = 0; t < 4; t++) {
    const r = radii[t], y = base + t + 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r) continue;
        store.set(cx + dx, y, cz + dz, t % 2 ? PAL.stoneWhite : PAL.brickPave);
      }
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    const wide = k === 6 ? 2 : 1;
    for (let r = 4; r <= 17; r++) {
      const x = Math.round(cx + Math.sin(a) * r), z = Math.round(cz + Math.cos(a) * r);
      const y = base + Math.max(0, 4 - Math.floor((r - 4) / 3.5));
      for (let w = -wide + 1; w <= wide - 1; w++) store.set(x + w, Math.max(base, y), z, PAL.stoneWhite);
    }
  }
  ctx.counters.pavilions++;
};

// ================================================================ 三大内与名坊定制内容登记
CHANGAN.customWardOccupies = function (w) {
  if (w.name === '隆庆' || w.name === '芙蓉' || w.name === '曲江' || w.name === '永嘉') return true;
  return false;
};
CHANGAN.customWardContent = {};
function regWard(name, side, fn) { CHANGAN.customWardContent[name + side] = fn; }
// 街感安全宅院：自动避开十字街/巷曲（纵深逐格收缩至可容纳），朝向可指定
function fitCourt(ctx, x, z, w, d, base, level, rng, facing) {
  const rf = CHANGAN.rectFree;
  for (let dd = d; dd >= 8; dd--) {
    if (rf(ctx, x, z, x + w - 1, z + dd - 1)) { proto.courtyard(ctx, x, z, w, dd, base, level, rng, facing); return true; }
  }
  return false;
}
// 街感安全府第：整地失败则内推 4 格再试（让开坊角武侯铺）
function fitManor(ctx, x, z, w, d, base, facing, rng, level) {
  const rf = CHANGAN.rectFree;
  if (rf(ctx, x, z, x + w - 1, z + d - 1)) { proto.manor(ctx, x, z, x + w - 1, z + d - 1, base, facing, rng, { level }); return true; }
  if (w - 4 >= 14 && d - 4 >= 12 && rf(ctx, x + 4, z + 4, x + w - 1, z + d - 1)) {
    proto.manor(ctx, x + 4, z + 4, x + w - 1, z + d - 1, base, facing, rng, { level });
    return true;
  }
  return false;
}
// 坊内四象限参照（大坊十字街已在通用阶段铺好，定制内容按象限落位）
function wardQuads(w) {
  const cx = (w.x0 + w.x1) >> 1, cz = (w.z0 + w.z1) >> 1;
  return {
    cx, cz,
    NW: { x0: w.x0 + 1, z0: w.z0 + 1, x1: cx - 1, z1: cz - 1 },
    NE: { x0: cx + 2, z0: w.z0 + 1, x1: w.x1 - 1, z1: cz - 1 },
    SW: { x0: w.x0 + 1, z0: cz + 2, x1: cx - 1, z1: w.z1 - 1 },
    SE: { x0: cx + 2, z0: cz + 2, x1: w.x1 - 1, z1: w.z1 - 1 },
  };
}

regWard('靖善', 'E', (ctx, w) => {
  CHANGAN.TempleGrammar.Royal(ctx, w.x0 + 3, w.z0 + 3, w.x1 - 3, w.z1 - 3, w.base, {});
});
regWard('开化', 'E', (ctx, w) => {
  CHANGAN.TempleGrammar.Royal(ctx, w.x0 + 3, w.z0 + 3, w.x1 - 3, w.z1 - 3, w.base, {});
});
regWard('安仁', 'E', (ctx, w) => {
  const cx = (w.x0 + w.x1) >> 1, cz = (w.z0 + w.z1) >> 1;
  CHANGAN.buildXiaoyanPagoda(ctx, cx, cz, w.base);
  proto.temple(ctx, w.x0 + 3, w.z0 + 3, w.x1 - 3, cz - 3, w.base, { pavilion: false });
});
regWard('晋昌', 'E', (ctx, w) => {
  // 大慈恩寺：皇家寺院+大雁塔核心（寺塔一体，非普通放大）
  const cx = (w.x0 + w.x1) >> 1;
  CHANGAN.TempleGrammar.Royal(ctx, w.x0 + 3, w.z0 + 3, w.x1 - 3, w.z1 - 18, w.base, {});
  CHANGAN.buildDayanPagoda(ctx, cx - 8, w.z1 - 12, w.base);
});
regWard('新昌', 'E', (ctx, w) => {
  // 青龙寺：皇家寺院高台+乐游原亭（与大慈恩不同平面：紧凑纵深+北亭）
  const cx = (w.x0 + w.x1) >> 1;
  platform(ctx, w.x0 + 6, w.z0 + 6, w.x1 - 6, w.z1 - 10, w.base, 2, PAL.stoneWhite, 'S');
  CHANGAN.TempleGrammar.Royal(ctx, w.x0 + 6, w.z0 + 6, w.x1 - 6, w.z1 - 14, w.base + 2, {});
  proto.pavilion(ctx, cx, w.z1 - 6, w.base, 'big');
});
regWard('务本', 'E', (ctx, w) => {
  const Q = wardQuads(w);
  // 孔庙（西北隅）：高台重檐大殿 + 经幢石灯
  proto.hall(ctx, Q.NW.x0 + 3, Q.NW.z0 + 2, Q.NW.x0 + 15, Q.NW.z0 + 8, w.base, { roof: 'xie', platform: 2, doubleEave: true, col: PAL.zhuBright });
  proto.jingchuang(ctx, Q.NW.x0 + 1, Q.NW.z0 + 10, w.base); proto.stoneLamp(ctx, Q.NW.x0 + 17, Q.NW.z0 + 10, w.base);
  // 国子监讲堂（东北）
  proto.hall(ctx, Q.NE.x0 + 3, Q.NE.z0 + 2, Q.NE.x1 - 2, Q.NE.z0 + 7, w.base, { roof: 'xie', platform: 1, door: 'S' });
  // 南带两斋舍
  proto.hall(ctx, Q.SW.x0 + 3, Q.SW.z0 + 3, Q.SW.x0 + 11, Q.SW.z0 + 6, w.base, { roof: 'xuan', wallH: 3, windows: true });
  proto.hall(ctx, Q.SE.x0 + 3, Q.SE.z0 + 3, Q.SE.x0 + 11, Q.SE.z0 + 6, w.base, { roof: 'xuan', wallH: 3, windows: true });
  const rng = CHANGAN.rngOf(ctx.seed, 'guzi');
  fitCourt(ctx, Q.SW.x0 + 13, Q.SW.z0 + 2, 12, 10, w.base, 1, rng, 'N');
});
regWard('延康', 'W', (ctx, w) => {
  CHANGAN.TempleGrammar.Royal(ctx, w.x0 + 3, w.z0 + 3, w.x1 - 3, w.z1 - 3, w.base, {});
});
regWard('崇业', 'W', (ctx, w) => {
  CHANGAN.TempleGrammar.Royal(ctx, w.x0 + 3, w.z0 + 3, w.x1 - 3, w.z1 - 3, w.base, {});
});
regWard('布政', 'W', (ctx, w) => {
  const { store } = ctx;
  const Q = wardQuads(w);
  // 胡祆祠（NW 象限：攒尖祠亭 + 圣火）
  const sx = Q.NW.x0 + ((Q.NW.x1 - Q.NW.x0) >> 1), sz = Q.NW.z0 + ((Q.NW.z1 - Q.NW.z0) >> 1);
  store.fill(sx - 2, w.base + 1, sz - 2, sx + 2, w.base + 3, sz + 2, PAL.plasterWarm);
  proto.roof(ctx, 'jian', sx - 2, sz - 2, sx + 2, sz + 2, w.base + 4, { finial: PAL.candle });
  store.set(sx, w.base + 2, sz + 2, PAL.candle); store.set(sx, w.base + 3, sz + 2, PAL.gold);
  const rng = CHANGAN.rngOf(ctx.seed, 'xian');
  fitCourt(ctx, Q.NE.x0 + 2, Q.NE.z0 + 1, 14, 12, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 1, Q.SW.z0 + 1, 12, 11, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 4, Q.SE.z0 + 1, 16, 12, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SW.x1 - 13, Q.SW.z0 + 1, 12, 10, w.base, 0, rng, 'N');
});
regWard('义宁', 'W', (ctx, w) => {
  const { store } = ctx;
  const Q = wardQuads(w);
  // 景教寺（NE 象限：寺堂 + 十字幡）
  const hx = Q.NE.x0 + 6, hz = Q.NE.z0 + 3;
  proto.hall(ctx, hx - 3, hz, hx + 3, hz + 4, w.base, { roof: 'xuan', door: 'S' });
  store.set(hx, w.base + 5, hz + 4, PAL.paperWhite); store.set(hx, w.base + 6, hz + 4, PAL.paperWhite);
  store.set(hx - 1, w.base + 5, hz + 4, PAL.paperWhite); store.set(hx + 1, w.base + 5, hz + 4, PAL.paperWhite);
  const rng = CHANGAN.rngOf(ctx.seed, 'jing');
  fitCourt(ctx, Q.NW.x0 + 1, Q.NW.z0 + 1, 13, 11, w.base, 0, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 2, Q.SW.z0 + 1, 12, 10, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 1, Q.SE.z0 + 1, 11, 9, w.base, 0, rng, 'N');
});
regWard('亲仁', 'E', (ctx, w) => {
  const Q = wardQuads(w);
  // 郭子仪汾阳王府（东北半坊：乌头门 + 重檐正厅 + 校场）
  const x0 = Q.cx, z0 = w.z0 + 2, x1 = w.x1 - 3, z1 = Q.cz - 1;
  proto.wutouGate(ctx, (x0 + x1) >> 1, z1, w.base, 'NS');
  proto.hall(ctx, x0 + 4, z0 + 3, x1 - 4, z0 + 8, w.base, { roof: 'xie', platform: 2, col: PAL.zhuBright, doubleEave: true });
  proto.hall(ctx, x0 + 5, z0 + 11, x1 - 5, z0 + 14, w.base, { roof: 'xuan', wallH: 3 });
  const { store } = ctx;
  for (let x = x0 + 2; x <= x0 + 14; x++) for (let z = z1 - 7; z <= z1 - 2; z++) store.set(x, w.base, z, PAL.grass);
  store.set(x0 + 3, w.base + 1, z1 - 5, PAL.flagRed); store.set(x0 + 13, w.base + 1, z1 - 5, PAL.flagBlue);
  const rng = CHANGAN.rngOf(ctx.seed, 'guoziyi');
  fitCourt(ctx, Q.NW.x0 + 2, Q.NW.z0 + 1, 15, 12, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 1, Q.SW.z0 + 1, 13, 11, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 3, Q.SE.z0 + 1, 12, 10, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x1 - 13, Q.SE.z0 + 1, 12, 10, w.base, 0, rng, 'N');
});
regWard('永兴', 'E', (ctx, w) => {
  const Q = wardQuads(w);
  // 魏徵宅（NE 象限：乌头门面横街，正堂居北）
  proto.wutouGate(ctx, (Q.NE.x0 + Q.NE.x1) >> 1, Q.cz - 1, w.base, 'NS');
  proto.hall(ctx, Q.NE.x0 + 5, Q.NE.z0 + 2, Q.NE.x1 - 3, Q.NE.z0 + 6, w.base, { roof: 'xie', platform: 1 });
  const rng = CHANGAN.rngOf(ctx.seed, 'weizheng');
  fitCourt(ctx, Q.NW.x0 + 1, Q.NW.z0 + 1, 14, 11, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 2, Q.SW.z0 + 1, 12, 11, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 2, Q.SE.z0 + 1, 13, 10, w.base, 1, rng, 'N');
});
regWard('兴化', 'W', (ctx, w) => {
  // 何家村窖藏之地：两座大宅第 + 杂院
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'hejia');
  fitManor(ctx, Q.NW.x0 + 1, Q.NW.z0 + 1, Q.NW.x1 - Q.NW.x0 - 1, Q.NW.z1 - Q.NW.z0 - 1, w.base, 'S', rng, 2);
  fitManor(ctx, Q.SE.x0 + 1, Q.SE.z0 + 1, Q.SE.x1 - Q.SE.x0 - 1, Q.SE.z1 - Q.SE.z0 - 1, w.base, 'N', rng, 2);
  fitCourt(ctx, Q.SW.x0 + 2, Q.SW.z0 + 1, 13, 11, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.NE.x0 + 2, Q.NE.z0 + 1, 12, 10, w.base, 1, rng, 'S');
});
regWard('平康', 'E', (ctx, w) => {
  // 北里：两所风月大宅 + 举子杂院
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'pingkang');
  fitManor(ctx, Q.NW.x0 + 1, Q.NW.z0 + 1, Q.NW.x1 - Q.NW.x0 - 1, Q.NW.z1 - Q.NW.z0 - 1, w.base, 'S', rng, 2);
  fitManor(ctx, Q.NE.x0 + 1, Q.NE.z0 + 1, Q.NE.x1 - Q.NE.x0 - 1, Q.NE.z1 - Q.NE.z0 - 1, w.base, 'S', rng, 2);
  fitCourt(ctx, Q.SW.x0 + 2, Q.SW.z0 + 1, 12, 11, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 2, Q.SE.z0 + 1, 13, 10, w.base, 1, rng, 'N');
});
regWard('崇仁', 'E', (ctx, w) => {
  // 乐器作坊与邸店聚集（昼夜灯火）
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'chongren');
  proto.hall(ctx, Q.NW.x0 + 3, Q.NW.z0 + 2, Q.NW.x0 + 13, Q.NW.z0 + 7, w.base, { roof: 'xie', platform: 1 });
  fitCourt(ctx, Q.NE.x0 + 1, Q.NE.z0 + 1, 14, 12, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 1, Q.SW.z0 + 1, 13, 11, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 2, Q.SE.z0 + 1, 14, 11, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SW.x1 - 13, Q.SW.z0 + 1, 12, 10, w.base, 0, rng, 'N');
});
regWard('辅兴', 'W', (ctx, w) => {
  // 胡麻饼名店与民居
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'fuxing');
  proto.hall(ctx, Q.NW.x0 + 3, Q.NW.z0 + 2, Q.NW.x0 + 11, Q.NW.z0 + 6, w.base, { roof: 'xuan', door: 'S', overhang: 1 });
  fitCourt(ctx, Q.NE.x0 + 2, Q.NE.z0 + 1, 13, 11, w.base, 0, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 1, Q.SW.z0 + 1, 12, 10, w.base, 0, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 1, Q.SE.z0 + 1, 14, 11, w.base, 1, rng, 'N');
});
regWard('延寿', 'W', (ctx, w) => {
  // 金银珠玉铺所在（近西市）
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'yanshou');
  fitCourt(ctx, Q.NW.x0 + 1, Q.NW.z0 + 1, 14, 12, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.NE.x0 + 2, Q.NE.z0 + 1, 13, 11, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 2, Q.SW.z0 + 1, 12, 9, w.base, 0, rng, 'N');
});
regWard('常乐', 'E', (ctx, w) => {
  // 寺居西半 + 东半民居
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'changle');
  proto.temple(ctx, w.x0 + 3, w.z0 + 3, Q.cx - 2, w.z1 - 3, w.base, { pavilion: false });
  fitCourt(ctx, Q.NE.x0 + 2, Q.NE.z0 + 1, 13, 11, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.SE.x0 + 1, Q.SE.z0 + 1, 14, 11, w.base, 1, rng, 'N');
});
regWard('升道', 'E', (ctx, w) => {
  // 乐游原游赏地：北隅高亭 + 疏朗三院
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'shengdao');
  proto.pavilion(ctx, Q.NW.x0 + 8, Q.NW.z0 + 7, w.base, 'big');
  fitCourt(ctx, Q.NE.x0 + 2, Q.NE.z0 + 1, 13, 11, w.base, 0, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 1, Q.SW.z0 + 1, 12, 10, w.base, 0, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 2, Q.SE.z0 + 1, 13, 11, w.base, 1, rng, 'N');
});
regWard('光福', 'E', (ctx, w) => {
  const Q = wardQuads(w);
  const rng = CHANGAN.rngOf(ctx.seed, 'guangfu');
  fitManor(ctx, Q.NW.x0 + 1, Q.NW.z0 + 1, Q.NW.x1 - Q.NW.x0 - 1, Q.NW.z1 - Q.NW.z0 - 1, w.base, 'S', rng, 2);
  fitCourt(ctx, Q.NE.x0 + 2, Q.NE.z0 + 1, 13, 11, w.base, 1, rng, 'S');
  fitCourt(ctx, Q.SW.x0 + 1, Q.SW.z0 + 1, 12, 10, w.base, 1, rng, 'N');
  fitCourt(ctx, Q.SE.x0 + 1, Q.SE.z0 + 1, 13, 10, w.base, 0, rng, 'N');
});
})();
