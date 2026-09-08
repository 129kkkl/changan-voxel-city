// g03_wards.js — S6 坊内生长：布局家族（密居/混居/府第/寺观/衙署/疏圃）+ 坊曲细分 + 两市
// 设计原则：礼制秩序在坊墙与街巷；差异在坊内用地、院落规模、建筑组合与空间密度。
'use strict';

// ---------------------------------------------------------------- 坊内整地：以坊位中位数标高整平台地
function flattenPlot(ctx, w) {
  const { store, fields } = ctx;
  const hs = [];
  for (let x = w.x0; x <= w.x1; x++) for (let z = w.z0; z <= w.z1; z++) hs.push(fields.groundH[CHANGAN.fieldIndex(x, z)]);
  hs.sort((a, b) => a - b);
  const base = hs[Math.floor(hs.length / 2)];
  w.base = base;
  const rng = CHANGAN.rngOf(ctx.seed, 'ward-ground-' + w.id);
  for (let x = w.x0; x <= w.x1; x++) for (let z = w.z0; z <= w.z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (fields.road[i] || fields.water[i]) continue;
    if (fields.topH[i] < fields.groundH[i]) continue; // 已开挖的沟/渠不在整平范围
    const g = fields.groundH[i];
    for (let y = g + 1; y <= fields.topH[i]; y++) store.del(x, y, z); // 清孤饰
    store.del(x, g, z);
    // 坊内地表：黄土为底，偶见草斑
    const c = rng() < 0.06 ? PAL.grass : (rng() < 0.12 ? PAL.loessDeep : PAL.loess);
    store.set(x, base, z, c);
    fields.groundH[i] = base; fields.topH[i] = base; fields.topColor[i] = c;
  }
}

// ---------------------------------------------------------------- 坊墙与坊门（礼制围合，含动态门扉登记）
function buildWardShell(ctx, w) {
  const { store, fields, CFG } = ctx;
  const P = PAL, H = CFG.Y.WARD_WALL_H, base = w.base;
  const isGateCell = (x, z) => {
    for (const g of w.gateCells || []) if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return g;
    return null;
  };
  // 门位：大坊四门（各边中点）、小坊东西二门
  const cx = (w.x0 + w.x1) >> 1, cz = (w.z0 + w.z1) >> 1;
  w.gateCells = [];
  if (w.gates.includes('N')) w.gateCells.push({ side: 'N', x0: cx - 1, x1: cx, z0: w.z0, z1: w.z0, axis: 'NS' });
  if (w.gates.includes('S')) w.gateCells.push({ side: 'S', x0: cx - 1, x1: cx, z0: w.z1, z1: w.z1, axis: 'NS' });
  if (w.gates.includes('E')) w.gateCells.push({ side: 'E', x0: w.x1, x1: w.x1, z0: cz - 1, z1: cz, axis: 'EW' });
  if (w.gates.includes('W')) w.gateCells.push({ side: 'W', x0: w.x0, x1: w.x0, z0: cz - 1, z1: cz, axis: 'EW' });

  for (let x = w.x0; x <= w.x1; x++) for (let z = w.z0; z <= w.z1; z++) {
    const edge = (x === w.x0 || x === w.x1 || z === w.z0 || z === w.z1);
    if (!edge) continue;
    const gate = isGateCell(x, z);
    const i = CHANGAN.fieldIndex(x, z);
    if (gate) {
      store.set(x, base, z, P.brickPave);
      fields.topColor[i] = P.brickPave;
      continue;
    }
    // 坊墙：夯土墙身 + 瓦顶压边。原墙仅 3 格高且顶面与墙身同色，远看与院落墙无异，
    // 里坊边界读不出来。加高一格并压瓦顶（外挑 1 格 + 瓦暗脊线），坊才成其为坊。
    store.set(x, base + 1, z, P.rammed);
    store.set(x, base + 2, z, P.rammed);
    store.set(x, base + 3, z, P.rammedLight);
    store.set(x, base + 4, z, P.roofDark);
    const wox = x === w.x0 ? -1 : x === w.x1 ? 1 : 0;
    const woz = z === w.z0 ? -1 : z === w.z1 ? 1 : 0;
    if (wox) store.set(x + wox, base + 4, z, P.roofGrey);
    if (woz) store.set(x, base + 4, z + woz, P.roofGrey);
    fields.topH[i] = base + 4; fields.topColor[i] = P.roofDark;
  }
  // 坊门重楼（门洞上方木构门楼，歇山顶+小鸱尾）+ 坊榜
  for (const g of w.gateCells) {
    const gx = g.axis === 'NS' ? (g.x0 + g.x1) >> 1 : (g.side === 'E' ? w.x1 : w.x0);
    const gz = g.axis === 'NS' ? (g.side === 'S' ? w.z1 : w.z0) : (g.z0 + g.z1) >> 1;
    const posts = g.axis === 'NS'
      ? [[g.x0 - 1, gz], [g.x1 + 1, gz]]
      : [[gx, g.z0 - 1], [gx, g.z1 + 1]];
    for (const [px, pz] of posts) {
      store.set(px, base + 1, pz, P.stoneGrey);
      for (let y = 2; y <= H + 1; y++) store.set(px, base + y, pz, P.zhu);
      const pi = CHANGAN.fieldIndex(px, pz);
      fields.topH[pi] = base + H + 1; fields.topColor[pi] = P.zhu;
    }

    if (g.axis === 'NS') {
      store.set(g.x0, base + H + 1, gz, P.timberDark);
      store.set(g.x1, base + H + 1, gz, P.timberDark);
      store.set(gx, base + H + 1, gz, P.paperWhite);
    } else {
      store.set(gx, base + H + 1, g.z0, P.timberDark);
      store.set(gx, base + H + 1, g.z1, P.timberDark);
      store.set(gx, base + H + 1, gz, P.paperWhite);
    }

    const inZ = g.axis === 'NS' ? (g.side === 'S' ? gz - 1 : gz + 1) : gz;
    const inX = g.axis === 'EW' ? (g.side === 'E' ? gx - 1 : gx + 1) : gx;
    const lx0 = Math.min(g.axis === 'NS' ? g.x0 - 1 : gx, inX);
    const lx1 = Math.max(g.axis === 'NS' ? g.x1 + 1 : gx, inX);
    const lz0 = Math.min(g.axis === 'EW' ? g.z0 - 1 : gz, inZ);
    const lz1 = Math.max(g.axis === 'EW' ? g.z1 + 1 : gz, inZ);

    if (g.axis === 'NS') {
      store.set(g.x0 - 1, base + 1, inZ, P.stoneGrey);
      store.set(g.x1 + 1, base + 1, inZ, P.stoneGrey);
      for (let y = 2; y <= H + 1; y++) {
        store.set(g.x0 - 1, base + y, inZ, P.zhu);
        store.set(g.x1 + 1, base + y, inZ, P.zhu);
      }
    } else {
      store.set(inX, base + 1, g.z0 - 1, P.stoneGrey);
      store.set(inX, base + 1, g.z1 + 1, P.stoneGrey);
      for (let y = 2; y <= H + 1; y++) {
        store.set(inX, base + y, g.z0 - 1, P.zhu);
        store.set(inX, base + y, g.z1 + 1, P.zhu);
      }
    }

    for (let x = lx0; x <= lx1; x++) {
      for (let z = lz0; z <= lz1; z++) {
        const isCorner = (x === lx0 || x === lx1) && (z === lz0 || z === lz1);
        if (isCorner) {
          store.set(x, base + H + 2, z, P.zhu);
          store.set(x, base + H + 3, z, P.timberDark);
        } else {
          store.set(x, base + H + 2, z, P.plasterWarm);
          store.set(x, base + H + 3, z, P.timberDark);
        }
      }
    }

    // 坊门瓦顶：檐口整片 → 内收一步坡面 → 正脊 + 两端起翘。
    // 原做法是"一张平板 + 一条脊"，近景读作平顶城垛；这里补出真实的坡面层次。
    for (let x = lx0; x <= lx1; x++) {
      for (let z = lz0; z <= lz1; z++) {
        store.set(x, base + H + 4, z, P.roofGrey);
      }
    }
    for (let x = lx0 + 1; x <= lx1 - 1; x++) {
      for (let z = lz0 + 1; z <= lz1 - 1; z++) store.set(x, base + H + 5, z, P.roofLight);
    }
    if (g.axis === 'NS') {
      for (let x = lx0 + 1; x <= lx1 - 1; x++) {
        store.set(x, base + H + 5, gz, P.roofLight);
        store.set(x, base + H + 6, gz, P.roofDark);
      }
      store.set(lx0, base + H + 5, gz, P.roofLight);
      store.set(lx1, base + H + 5, gz, P.roofLight);
    } else {
      for (let z = lz0 + 1; z <= lz1 - 1; z++) {
        store.set(gx, base + H + 5, z, P.roofLight);
        store.set(gx, base + H + 6, z, P.roofDark);
      }
      store.set(gx, base + H + 5, lz0, P.roofLight);
      store.set(gx, base + H + 5, lz1, P.roofLight);
    }

    const gi = CHANGAN.fieldIndex(gx, gz);
    fields.topH[gi] = base + H + 6; fields.topColor[gi] = P.roofDark;

    ctx.doors.push({ kind: 'ward', ward: w.name, x: gx, z: gz, axis: g.axis, base, cells: g.axis === 'NS' ? [[g.x0, gz], [g.x1, gz]] : [[gx, g.z0], [gx, g.z1]] });
  }
  // 武侯铺：坊角通透巡检木亭 + 望旗（街角治安岗哨）
  for (const [cx2, cz2] of [[w.x0 + 2, w.z0 + 2], [w.x1 - 2, w.z0 + 2], [w.x0 + 2, w.z1 - 2], [w.x1 - 2, w.z1 - 2]]) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      store.set(cx2 + dx, base + 1, cz2 + dz, P.brickPave);
    }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      store.set(cx2 + dx, base + 2, cz2 + dz, P.zhu);
      store.set(cx2 + dx, base + 3, cz2 + dz, P.zhu);
    }
    store.set(cx2, base + 2, cz2, P.timberDark);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (dx === 0 && dz === 0) continue;
      store.set(cx2 + dx, base + 3, cz2 + dz, P.timberDark);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      store.set(cx2 + dx, base + 4, cz2 + dz, P.roofGrey);
    }
    store.set(cx2, base + 5, cz2, P.roofLight);
    const fx = cx2 + (cx2 > cx ? 1 : -1), fz = cz2 + (cz2 > cz ? 1 : -1);
    store.set(fx, base + 4, fz, P.timberDark);
    store.set(fx, base + 5, fz, P.timberDark);
    store.set(fx, base + 5, cz2, P.flagRed);
    ctx.counters.buildings++;
  }
}

// ================================================================ WardProfile（位置决定画像，随机仅管同类型内自然变化）
// 字段：density/wealth/prestige/commercial/religious/official/garden/warehouse/workshop/estate/streetActivity
function wardProfile(ctx, w) {
  const r = w.row, c = w.col;
  const nearMarket = (c >= 2 && c <= 4) && (r >= 3 && r <= 5);
  const nearDaming = (w.side === 'E' && c >= 4 && r <= 3);
  const nearXingqing = (w.side === 'E' && ((c === 4 && r === 4) || (c === 5 && r <= 5)));
  const southPalace = (r <= 1);
  const templeWard = (w.detail === 2 && /寺|观|祠/.test(w.content || ''));
  const southSparse = (r >= 7);
  const P = { density: 0.5, wealth: 0.5, prestige: 0.3, commercial: 0, religious: 0, official: 0, garden: 0.2, warehouse: 0, workshop: 0, estate: 0.2, streetActivity: 0.3 };
  if (southPalace) { P.official = 0.7; P.estate = 0.6; P.wealth = 0.8; P.prestige = 0.8; P.density = 0.4; } // 皇城南官僚贵宅
  if (nearDaming) { P.estate = 0.7; P.official = 0.5; P.wealth = 0.85; P.prestige = 0.85; P.density = 0.45; } // 大明宫周边权贵+服务宫廷
  if (nearXingqing) { P.estate = 0.65; P.wealth = 0.8; P.prestige = 0.75; P.density = 0.45; P.garden = 0.4; } // 兴庆宫贵族宫廷相关
  if (w.side === 'E' && c === 3 && (r === 3 || r === 6)) { P.commercial = 0.5; P.density = 0.7; P.streetActivity = 0.6; } // 东市周边商业高密仓储
  if (w.side === 'W' && c === 3 && (r === 3 || r === 6)) { P.commercial = 0.55; P.warehouse = 0.5; P.workshop = 0.3; P.density = 0.75; P.streetActivity = 0.55; } // 西市仓储作坊
  if (nearMarket) { P.commercial = Math.max(P.commercial, 0.4); P.density = Math.max(P.density, 0.7); P.warehouse = Math.max(P.warehouse, 0.25); }
  if (templeWard) { P.religious = 0.9; P.density = 0.35; P.garden = 0.5; }
  if (southSparse) { P.density = 0.42; P.garden = 0.5; P.estate = 0.15; P.wealth = 0.3; } // 城南低密园圃（保"南疏"性格，但不做成空地）
  if (!southSparse && !templeWard && r >= 2 && r <= 5) { P.density = Math.max(P.density, 0.55); }
  w.profile = P;
  return P;
}
CHANGAN.wardProfile = wardProfile;
// ResidencePlan：先出平面再施工（rank/facing/courtyardCount/mainHallBays/wingMode/rearHall/sideCourt/serviceCourt/garden/well/gateType）
function residencePlan(ctx, rect, profile, rng, facing) {
  const area = (rect.x1 - rect.x0 + 1) * (rect.z1 - rect.z0 + 1);
  const wealth = profile.wealth + (rng() - 0.5) * 0.15;
  const rank = wealth > 0.75 ? 2 : wealth > 0.45 ? 1 : 0;
  const courtyardCount = area > 320 ? 2 : 1;
  const mainHallBays = rank === 2 ? 3 + Math.floor(rng() * 2) : rank === 1 ? 3 : 1 + Math.floor(rng() * 2);
  const wingMode = rng() < 0.3 + profile.estate * 0.3 ? (rng() < 0.5 ? 'W' : 'E') : (rng() < 0.5 ? 'both' : 'none');
  return { rank, facing, courtyardCount, mainHallBays, wingMode, rearHall: rank === 2 && rng() < 0.5, sideCourt: rng() < 0.2, serviceCourt: rng() < 0.3, garden: rng() < profile.garden, well: rng() < 0.3, gateType: rank === 2 ? 'wutou' : '屋宇' };
}
CHANGAN.residencePlan = residencePlan;
// ================================================================ 布局家族（由WardProfile派生，随机仅自然变化）
function pickWardFamily(ctx, w) {
  const P = wardProfile(ctx, w);
  const rng = CHANGAN.rngOf(ctx.seed, 'wfam-' + w.id);
  const r = w.row;
  if (r >= 7) return rng() < 0.35 + P.garden * 0.4 ? 'sparse' : 'mixed';
  if (P.religious > 0.7) return 'temple';
  if (P.official > 0.6 && rng() < 0.6) return 'official';
  if (P.estate > 0.6 && rng() < 0.65) return 'estate';
  if (P.commercial > 0.4 || P.density > 0.68) return rng() < 0.6 ? 'dense' : 'mixed';
  const t = rng();
  if (t < 0.1 + P.religious * 0.2) return 'temple';
  if (t < 0.3 + P.estate * 0.2) return 'estate';
  if (t < 0.55) return 'mixed';
  if (t < 0.85) return 'dense';
  return 'sparse';
}

// ---------------------------------------------------------------- 坊内街巷与地块划分（plots）
// 大坊：四门十字街为骨架，坊曲偏置入象限；小坊：一字横街 + 南北两带分段。
function buildWardLanes(ctx, w) {
  const { store, fields } = ctx;
  const cx = (w.x0 + w.x1) >> 1, cz = (w.z0 + w.z1) >> 1;
  const pave = (x, z, lv) => {
    const i = CHANGAN.fieldIndex(x, z);
    if (fields.water[i]) return;
    store.set(x, w.base, z, PAL.loessLight);
    fields.topColor[i] = PAL.loessLight;
    if (!fields.road[i]) fields.road[i] = lv;
  };
  w.paveLane = pave;
  w.plots = [];
  const family = w.family;

  if (w.small) {
    // 皇城南小坊：一字横街（东西向，2 宽）
    for (let x = w.x0 + 1; x <= w.x1 - 1; x++) { pave(x, cz, 6); pave(x, cz + 1, 6); }
    const rng = CHANGAN.rngOf(ctx.seed, 'wband-' + w.id);
    // 北带门朝南开向一字街；南带门朝北
    splitBand(ctx, w, { x0: w.x0 + 1, z0: w.z0 + 1, x1: w.x1 - 1, z1: cz - 1 }, 'S', family, rng);
    splitBand(ctx, w, { x0: w.x0 + 1, z0: cz + 2, x1: w.x1 - 1, z1: w.z1 - 1 }, 'N', family, rng);
    return;
  }

  // 大坊：十字街（2 宽）
  for (let x = w.x0 + 1; x <= w.x1 - 1; x++) { pave(x, cz, 6); pave(x, cz + 1, 6); }
  for (let z = w.z0 + 1; z <= w.z1 - 1; z++) { pave(cx, z, 6); pave(cx + 1, z, 6); }

  const quads = [
    { x0: w.x0 + 1, z0: w.z0 + 1, x1: cx - 1, z1: cz - 1, cn: 'NW' }, // 北象限门朝南（临横街）
    { x0: cx + 2, z0: w.z0 + 1, x1: w.x1 - 1, z1: cz - 1, cn: 'NE' },
    { x0: w.x0 + 1, z0: cz + 2, x1: cx - 1, z1: w.z1 - 1, cn: 'SW' }, // 南象限门朝北
    { x0: cx + 2, z0: cz + 2, x1: w.x1 - 1, z1: w.z1 - 1, cn: 'SE' },
  ];

  // 寺观/衙署家族：西半坊整体为寺院/衙署用地（占坊之半，史实常见）。
  // 此类坊十字街改为"丁字街"：纵街贯通、横街只铺东半（西半让位给院落群），西坊门经西墙便门入院。
  if ((family === 'temple' || family === 'official')) {
    // 抹掉西半横街（已在上面铺过，逐格还原为坊内黄土）
    for (let x = w.x0 + 1; x <= cx - 1; x++) for (const z of [cz, cz + 1]) {
      const i = CHANGAN.fieldIndex(x, z);
      if (fields.road[i] === 6) { fields.road[i] = 0; }
      store.set(x, w.base, z, PAL.loess);
      fields.topColor[i] = PAL.loess;
    }
    const site = { x0: w.x0 + 1, z0: w.z0 + 1, x1: cx - 1, z1: w.z1 - 1 };
    w.plots.push({ ...site, face: family === 'official' ? 'E' : 'S', kind: family === 'official' ? 'office' : 'temple' });
    splitQuad(ctx, w, quads[1], family);
    splitQuad(ctx, w, quads[3], family);
    return;
  }
  // 府第家族：随机一象限为世家大宅（占坊约四分之一，如郭子仪宅），其余象限正常
  if (family === 'estate') {
    const rng = CHANGAN.rngOf(ctx.seed, 'wqsel-' + w.id);
    const gi = CHANGAN.rint(rng, 0, 3);
    quads.forEach((q, qi) => {
      if (qi === gi) w.plots.push({ x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, face: 'S', kind: 'manor', level: 3 });
      else splitQuad(ctx, w, q, family);
    });
    return;
  }
  for (const q of quads) splitQuad(ctx, w, q, family);
}

// 象限细分：整区 / 坊曲偏切 / 条带分段 / 中央场院 四种模式
function splitQuad(ctx, w, q, family) {
  const rng = CHANGAN.rngOf(ctx.seed, 'wq-' + w.id + '-' + q.cn);
  const qw = q.x1 - q.x0 + 1, qd = q.z1 - q.z0 + 1;
  if (qw < 12 || qd < 12) return;
  const northQuad = q.cn === 'NW' || q.cn === 'NE';
  const faceStreet = northQuad ? 'S' : 'N'; // 朝十字横街

  if (family === 'sparse') {
    // 圃田林塘为主：整区field/grove，偶于街角留一小院
    const t = rng();
    const kind = t < 0.45 ? 'field' : t < 0.8 ? 'grove' : 'open';
    if (rng() < 0.7 && qw >= 10 && qd >= 10) {
      const cw = CHANGAN.rint(rng, 9, 12), cd = CHANGAN.rint(rng, 9, 12);
      w.plots.push({ x0: q.x0, z0: q.z0, x1: q.x0 + cw - 1, z1: q.z0 + cd - 1, face: faceStreet, kind: 'court', level: 0 });
      const rest = { x0: q.x0 + cw + 1, z0: q.z0, x1: q.x1, z1: q.z1 };
      if (rest.x1 - rest.x0 >= 5) w.plots.push({ ...rest, face: faceStreet, kind });
      const rest2 = { x0: q.x0, z0: q.z0 + cd + 1, x1: q.x0 + cw, z1: q.z1 };
      if (rest2.z1 - rest2.z0 >= 5) w.plots.push({ ...rest2, face: faceStreet, kind: rng() < 0.5 ? 'grove' : 'field' });
    } else {
      w.plots.push({ ...q, face: faceStreet, kind });
    }
    return;
  }

  const mode = rng();
  if (mode < 0.16 && qw >= 18 && qd >= 14) {
    // 整区大宅/大单元（mixed 也可出现，体量渐变的关键）
    const kind = family === 'estate' || (family === 'mixed' && rng() < 0.5) ? 'manor' : 'court';
    w.plots.push({ ...q, face: faceStreet, kind, level: kind === 'manor' ? 2 : 2 });
    return;
  }
  if (mode < 0.52 && qw >= 22) {
    // 坊曲纵巷偏置贯通，两侧分深
    const lx = CHANGAN.rint(rng, q.x0 + Math.floor(qw * 0.3), q.x0 + Math.floor(qw * 0.7));
    for (let z = q.z0; z <= q.z1; z++) w.paveLane(lx, z, 7);
    splitStripZ(ctx, w, { x0: q.x0, z0: q.z0, x1: lx - 1, z1: q.z1 }, 'E', family, rng);
    splitStripZ(ctx, w, { x0: lx + 1, z0: q.z0, x1: q.x1, z1: q.z1 }, 'W', family, rng);
    return;
  }
  if (mode < 0.72 && qd >= 22) {
    // 坊曲横巷偏置
    const lz = CHANGAN.rint(rng, q.z0 + Math.floor(qd * 0.3), q.z0 + Math.floor(qd * 0.7));
    for (let x = q.x0; x <= q.x1; x++) w.paveLane(x, lz, 7);
    splitStripX(ctx, w, { x0: q.x0, z0: q.z0, x1: q.x1, z1: lz - 1 }, 'S', family, rng);
    splitStripX(ctx, w, { x0: q.x0, z0: lz + 1, x1: q.x1, z1: q.z1 }, 'N', family, rng);
    return;
  }
  if (mode < 0.86 && qd >= 22 && qw >= 20) {
    // 中央场院：十字街角的半公共空场（井台、社树），周边宅地
    const pw = Math.min(7, qw - 10), pd = Math.min(6, qd - 10);
    if (pw >= 5 && pd >= 4) {
      const px = q.x0 + ((qw - pw) >> 1), pz = q.z0 + ((qd - pd) >> 1);
      w.plots.push({ x0: px, z0: pz, x1: px + pw - 1, z1: pz + pd - 1, face: faceStreet, kind: 'open' });
      // 北侧与南侧两条宅地带
      splitStripX(ctx, w, { x0: q.x0, z0: q.z0, x1: q.x1, z1: pz - 1 }, faceStreet, family, rng);
      splitStripX(ctx, w, { x0: q.x0, z0: pz + pd, x1: q.x1, z1: q.z1 }, faceStreet, family, rng);
      return;
    }
  }
  // 默认：条带分段（门朝十字街）
  splitStripX(ctx, w, q, faceStreet, family, rng);
}

// 沿 z 切成 1~2 段（段深 9~），用于坊曲两侧的窄长用地
function splitStripZ(ctx, w, rect, face, family, rng) {
  const rw = rect.x1 - rect.x0 + 1, rd = rect.z1 - rect.z0 + 1;
  if (rw < 5 || rd < 5) return;
  if (rw < 9) { w.plots.push({ ...rect, face, kind: 'grove' }); return; }
  if (rd >= 19 && rng() < 0.75) {
    const zmid = rect.z0 + CHANGAN.rint(rng, 9, rd - 10);
    pushStripPlot(ctx, w, { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: zmid }, face, family, rng);
    pushStripPlot(ctx, w, { x0: rect.x0, z0: zmid + 1, x1: rect.x1, z1: rect.z1 }, face, family, rng);
  } else {
    pushStripPlot(ctx, w, rect, face, family, rng);
  }
}
// 沿 x 切成若干不等段（段宽 9~15），用于条带用地
function splitStripX(ctx, w, rect, face, family, rng) {
  const rw = rect.x1 - rect.x0 + 1, rd = rect.z1 - rect.z0 + 1;
  if (rw < 5 || rd < 5) return;
  if (rw < 12 || rd < 12) { if (rw >= 5 && rd >= 5) w.plots.push({ ...rect, face, kind: 'grove' }); return; }
  let x = rect.x0;
  while (rect.x1 - x + 1 >= 12) {
    let sw = CHANGAN.rint(rng, 14, 24);
    if (rect.x1 - (x + sw) < 12) sw = rect.x1 - x + 1; // 收尾并入末段
    pushStripPlot(ctx, w, { x0: x, z0: rect.z0, x1: x + sw - 1, z1: rect.z1 }, face, family, rng);
    x += sw;
  }
}
function pushStripPlot(ctx, w, rect, face, family, rng) {
  const rw = rect.x1 - rect.x0 + 1, rd = rect.z1 - rect.z0 + 1;
  let kind = 'court', level = 0;
  if (family === 'dense') level = rng() < 0.6 ? 1 : 0;
  else if (family === 'mixed') { const t = rng(); level = t < 0.4 ? 1 : 0; if (t > 0.9) kind = 'open'; }
  else if (family === 'estate') level = rng() < 0.8 ? 1 : 0;
  else { const t = rng(); level = t < 0.3 ? 1 : 0; if (t > 0.92) kind = 'open'; }
  // 大进深地块升级为多进府第（大小宅地混合的"大"）
  if (kind === 'court' && rw >= 20 && rd >= 14 && (family === 'estate' || family === 'mixed') && rng() < 0.5) {
    kind = 'manor'; level = 2;
  }
  w.plots.push({ ...rect, face, kind, level });
}

// 小坊一字街南北带分段
function splitBand(ctx, w, band, face, family, rng) {
  const bw = band.x1 - band.x0 + 1, bd = band.z1 - band.z0 + 1;
  if (bw < 12 || bd < 12) {
    if (bw >= 5 && bd >= 5) w.plots.push({ ...band, face, kind: 'grove' });
    return;
  }
  if (family === 'temple' || family === 'official') family = 'mixed'; // 小坊不进寺观衙署（名坊另有定制）
  if (family === 'estate' && bw >= 24) {
    // 大宅第占据带内一端
    const mw = Math.min(bw, CHANGAN.rint(rng, 24, 30));
    w.plots.push({ x0: band.x0, z0: band.z0, x1: band.x0 + mw - 1, z1: band.z1, face, kind: 'manor', level: 3 });
    band = { ...band, x0: band.x0 + mw };
    if (band.x1 - band.x0 < 9) return;
  }
  let x = band.x0;
  while (band.x1 - x + 1 >= 12) {
    let sw = CHANGAN.rint(rng, 14, 24);
    if (band.x1 - (x + sw) < 12) sw = band.x1 - x + 1;
    let kind = 'court', level = 0;
    if (family === 'sparse') { const t = rng(); kind = t < 0.25 ? 'court' : t < 0.6 ? 'field' : 'grove'; }
    else if (family === 'dense') level = rng() < 0.28 ? 1 : 0;
    else { level = rng() < 0.4 ? 1 : 0; if (rng() > 0.93) kind = 'open'; }
    if (kind === 'court' && sw >= 20 && bd >= 14 && family !== 'dense' && rng() < 0.4) { kind = 'manor'; level = 2; }
    w.plots.push({ x0: x, z0: band.z0, x1: x + sw - 1, z1: band.z1, face, kind, level });
    x += sw;
  }
}

// ---------------------------------------------------------------- 地块占用检查与坊角让位
function rectFree(ctx, x0, z0, x1, z1) {
  const { fields } = ctx;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (i < 0 || i >= fields.road.length) return false;
    if (fields.road[i] || fields.water[i]) return false;
    if (fields.topH[i] !== fields.groundH[i]) return false;
  }
  return true;
}
// 坊角武侯铺等已建物：建筑占地角部受压时内推 4 格
function shrinkForBlockers(ctx, r) {
  const occ = (x, z) => {
    const i = CHANGAN.fieldIndex(x, z);
    const { fields } = ctx;
    return fields.topH[i] !== fields.groundH[i] || !!fields.water[i] || !!fields.road[i];
  };
  if (occ(r.x0, r.z0) || occ(r.x0 + 1, r.z0) || occ(r.x0, r.z0 + 1)) { r.x0 += 2; r.z0 += 2; }
  if (occ(r.x1, r.z0) || occ(r.x1 - 1, r.z0) || occ(r.x1, r.z0 + 1)) { r.x1 -= 2; r.z0 += 2; }
  if (occ(r.x0, r.z1) || occ(r.x0 + 1, r.z1) || occ(r.x0, r.z1 - 1)) { r.x0 += 2; r.z1 -= 2; }
  if (occ(r.x1, r.z1) || occ(r.x1 - 1, r.z1) || occ(r.x1, r.z1 - 1)) { r.x1 -= 2; r.z1 -= 2; }
  return r;
}

// ---------------------------------------------------------------- 地块填充：院落/府第/寺观/衙署/圃田/林塘/空场
function fillWardPlots(ctx, w, family) {
  const rng = CHANGAN.rngOf(ctx.seed, 'ward-fill-' + w.id);
  const proto = CHANGAN.proto;
  for (const p of w.plots) {
    let r = { x0: p.x0 + 1, z0: p.z0 + 1, x1: p.x1 - 1, z1: p.z1 - 1 }; // 内缩 1，相邻宅第共墙成巷
    r = shrinkForBlockers(ctx, r);
    const rw = r.x1 - r.x0 + 1, rd = r.z1 - r.z0 + 1;
    if (rw < 5 || rd < 5) continue;
    switch (p.kind) {
      case 'court': {
        if (rw < 10 || rd < 10) { growGrove(ctx, r, rng, 2); break; }
        if (!rectFree(ctx, r.x0, r.z0, r.x1, r.z1)) { growGrove(ctx, r, rng, 2); break; }
        // ResidencePlan先行：组件组合而非整栋复制（院墙/门屋/正房/厢/后寝/跨院/仓厨/井园/廊）
        const plan = CHANGAN.residencePlan(ctx, r, w.profile || { wealth: 0.5, estate: 0.2, garden: 0.2 }, rng, p.face);
        plan.level = p.level != null ? p.level : plan.rank;
        ctx.residencePlans = ctx.residencePlans || [];
        ctx.residencePlans.push([plan.rank, plan.facing, plan.courtyardCount, plan.mainHallBays, plan.wingMode, plan.rearHall ? 1 : 0, plan.sideCourt ? 1 : 0, plan.serviceCourt ? 1 : 0, plan.garden ? 1 : 0, plan.well ? 1 : 0, plan.gateType].join('|') + '|' + rw + 'x' + rd);
        // 建筑层（2×）：地坪留在城市层，建筑全部由建筑层生成（单一权威，守则铁律一）
        CHANGAN.archCompoundGround(ctx, r.x0, r.z0, rw, rd, w.base);
        CHANGAN.buildArchCompound(ctx, r.x0, r.z0, rw, rd, w.base, plan.level, rng, p.face, plan);
        ctx.counters.houses++;
        break;
      }
      case 'manor': {
        if (rw < 14 || rd < 12 || !rectFree(ctx, r.x0, r.z0, r.x1, r.z1)) {
          if (rw >= 6 && rd >= 6 && rectFree(ctx, r.x0, r.z0, r.x1, r.z1)) {
            CHANGAN.archCompoundGround(ctx, r.x0, r.z0, rw, rd, w.base);
            CHANGAN.buildArchCompound(ctx, r.x0, r.z0, rw, rd, w.base, 1, rng, p.face, { wingMode: 'W' });
            ctx.counters.houses++;
          }
          break;
        }
        CHANGAN.archCompoundGround(ctx, r.x0, r.z0, rw, rd, w.base);
        CHANGAN.buildArchCompound(ctx, r.x0, r.z0, rw, rd, w.base, 2, rng, p.face, { wingMode: 'both', gateType: 'wutou' });
        ctx.counters.houses++;
        break;
      }
      case 'temple': {
        if (rw < 18 || rd < 18 || !rectFree(ctx, r.x0, r.z0, r.x1, r.z1)) { growGrove(ctx, r, rng, 4); break; }
        proto.temple(ctx, r.x0, r.z0, r.x1, r.z1, w.base, { pagoda: rd >= 26 ? 'front' : undefined, big: rw >= 26 && rd >= 26 });
        punchWestDoor(ctx, w, r);
        break;
      }
      case 'office': {
        if (rw < 16 || rd < 14 || !rectFree(ctx, r.x0, r.z0, r.x1, r.z1)) { growGrove(ctx, r, rng, 3); break; }
        proto.office(ctx, r.x0, r.z0, r.x1, r.z1, w.base, rng, p.face);
        punchWestDoor(ctx, w, r);
        break;
      }
      case 'open': {
        // 公共空场：夯土场 + 井台 + 社树
        const cx = (r.x0 + r.x1) >> 1, cz = (r.z0 + r.z1) >> 1;
        for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) {
          ctx.store.set(x, w.base, z, PAL.loessLight);
        }
        if (rectFree(ctx, cx - 1, cz - 1, cx, cz)) proto.well(ctx, cx - 1, cz - 1, w.base);
        proto.tree(ctx, r.x0 + 1, r.z0 + 1, w.base, 'huai', rng);
        if (rw >= 8) proto.tree(ctx, r.x1 - 1, r.z1 - 1, w.base, 'elm', rng);
        ctx.counters.pavilions++;
        break;
      }
      case 'field': {
        // 圃田：东西垄行（田土/枯草相间），偶见井台
        for (let z = r.z0; z <= r.z1; z++) {
          const c = ((z - r.z0) % 3 === 2) ? PAL.withered : PAL.fieldEarth;
          for (let x = r.x0; x <= r.x1; x++) ctx.store.set(x, w.base, z, c);
        }
        if (rng() < 0.3 && rectFree(ctx, r.x0, r.z0, r.x0 + 1, r.z0 + 1)) proto.well(ctx, r.x0, r.z0, w.base);
        if (rng() < 0.4) proto.tree(ctx, r.x1 - 1, r.z1 - 1, w.base, 'elm', rng);
        break;
      }
      case 'grove': growGrove(ctx, r, rng, 0); break;
    }
  }
}
function growGrove(ctx, r, rng, minN) {
  const proto = CHANGAN.proto;
  const area = (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
  const n = Math.max(minN || 3, Math.min(10, Math.floor(area / 30)));
  for (let k = 0; k < n; k++) {
    const x = CHANGAN.rint(rng, r.x0, r.x1), z = CHANGAN.rint(rng, r.z0, r.z1);
    const i = CHANGAN.fieldIndex(x, z);
    if (ctx.fields.road[i] || ctx.fields.water[i] || ctx.fields.topH[i] !== ctx.fields.groundH[i]) continue;
    proto.tree(ctx, x, z, ctx.fields.groundH[i], CHANGAN.pickTree(ctx, rng, 'ward'), rng);
  }
}
// 寺观/衙署西墙便门：对准坊西门（丁字街收口，西坊门可入院）
function punchWestDoor(ctx, w, r) {
  const { store } = ctx;
  const czW = (w.z0 + w.z1) >> 1;
  if (czW - 1 < r.z0 || czW > r.z1) return;
  for (const z of [czW - 1, czW]) for (let y = 1; y <= 4; y++) store.del(r.x0, w.base + y, z);
  for (const z of [czW - 2, czW + 1]) for (let y = 1; y <= 3; y++) store.set(r.x0, w.base + y, z, PAL.zhu);
  store.set(w.x0 + 1, w.base, czW - 1, PAL.brickPave);
  store.set(w.x0 + 1, w.base, czW, PAL.brickPave);
}
function areaFree(ctx, x0, z0, w, d) { // 兼容旧调用（g05 井台等）
  return rectFree(ctx, x0 - 1, z0 - 1, x0 + w, z0 + d);
}
function pickTree(ctx, rng, where) {
  if (where === 'temple') return rng() < 0.6 ? 'pine' : 'bamboo';
  if (where === 'canal') return 'willow';
  const r = rng();
  return r < 0.6 ? 'huai' : (r < 0.8 ? 'wutong' : 'elm');
}
CHANGAN.areaFree = areaFree;
CHANGAN.rectFree = rectFree;
CHANGAN.pickTree = pickTree;

// ---------------------------------------------------------------- S6 主入口
CHANGAN.stageWardGrowth = function (ctx) {
  const wards = ctx.wards;
  let n = 0;
  for (const w of wards) {
    if (w.type !== 'ward') continue;
    if (CHANGAN.customWardOccupies && CHANGAN.customWardOccupies(w)) { n++; continue; }
    flattenPlot(ctx, w);
    buildWardShell(ctx, w);
    w.family = pickWardFamily(ctx, w);
    buildWardLanes(ctx, w);
    // 详写级名坊跳过通用填充（由 g04 定制内容接管），肌理坊按家族生长
    if (!(w.detail === 2 && CHANGAN.customWardContent && CHANGAN.customWardContent[w.name + w.side])) {
      fillWardPlots(ctx, w, w.family);
    }
    if ((++n & 15) === 0) ctx.progress('wards', n / wards.length);
  }
};

// ---------------------------------------------------------------- 两市：市墙、八门、井字街、市楼、临街行肆、西市水岸
CHANGAN.stageMarkets = function (ctx) {
  for (const side of ['E', 'W']) {
    const east = side === 'E';
    const x0 = east ? 165 : -222, x1 = east ? 222 : -165;
    const z0 = 78, z1 = 156;
    const m = { x0, x1, z0, z1, name: east ? '东市' : '西市' };
    flattenMarket(ctx, m);
    buildMarketWalls(ctx, m);
    buildMarketGrid(ctx, m);
    if (!east) buildWestMarketDocks(ctx, m); // 先挖海池码头，店肆避让水面
    buildMarketShops(ctx, m, east);
    ctx.progress('markets', east ? 0.5 : 1);
  }
};
function flattenMarket(ctx, m) {
  const { store, fields } = ctx;
  const hs = [];
  for (let x = m.x0; x <= m.x1; x++) for (let z = m.z0; z <= m.z1; z++) hs.push(fields.groundH[CHANGAN.fieldIndex(x, z)]);
  hs.sort((a, b) => a - b);
  m.base = hs[Math.floor(hs.length / 2)];
  for (let x = m.x0; x <= m.x1; x++) for (let z = m.z0; z <= m.z1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    if (fields.water[i]) continue;
    if (fields.topH[i] < fields.groundH[i]) continue;
    const g = fields.groundH[i];
    store.del(x, g, z);
    store.set(x, m.base, z, PAL.brickPave);
    fields.groundH[i] = m.base; fields.topH[i] = m.base; fields.topColor[i] = PAL.brickPave;
  }
}
function buildMarketWalls(ctx, m) {
  const { store, fields } = ctx;
  const P = PAL, base = m.base;
  // 每面二门（位于 1/3、2/3 处），门洞 2 宽，门柱贴门洞外侧
  const gx1 = m.x0 + Math.floor((m.x1 - m.x0) / 3), gx2 = m.x0 + Math.floor((m.x1 - m.x0) * 2 / 3);
  const gz1 = m.z0 + Math.floor((m.z1 - m.z0) / 3), gz2 = m.z0 + Math.floor((m.z1 - m.z0) * 2 / 3);
  const gateAt = (x, z) => {
    if (z === m.z0 || z === m.z1) {
      if (x === gx1 || x === gx1 + 1) return 'NS';
      if (x === gx2 || x === gx2 + 1) return 'NS';
    }
    if (x === m.x0 || x === m.x1) {
      if (z === gz1 || z === gz1 + 1) return 'EW';
      if (z === gz2 || z === gz2 + 1) return 'EW';
    }
    return null;
  };
  const postAt = (x, z) => {
    if (z === m.z0 || z === m.z1) return x === gx1 - 1 || x === gx1 + 2 || x === gx2 - 1 || x === gx2 + 2;
    if (x === m.x0 || x === m.x1) return z === gz1 - 1 || z === gz1 + 2 || z === gz2 - 1 || z === gz2 + 2;
    return false;
  };
  m.gates = [];
  for (let x = m.x0; x <= m.x1; x++) for (let z = m.z0; z <= m.z1; z++) {
    const edge = (x === m.x0 || x === m.x1 || z === m.z0 || z === m.z1);
    if (!edge) continue;
    const i = CHANGAN.fieldIndex(x, z);
    if (gateAt(x, z)) {
      store.set(x, base, z, P.brickPave);
      fields.topColor[i] = P.brickPave;
      continue;
    }
    if (postAt(x, z)) {
      for (let y = 1; y <= 3; y++) store.set(x, base + y, z, P.zhu);
      store.set(x, base + 4, z, P.roofGrey);
      fields.topH[i] = base + 4; fields.topColor[i] = P.zhu;
      continue;
    }
    store.set(x, base + 1, z, P.rammed);
    store.set(x, base + 2, z, P.rammed);
    store.set(x, base + 3, z, P.rammedLight);
    fields.topH[i] = base + 3; fields.topColor[i] = P.rammedLight;
  }
  for (const [gx, gz, axis] of [[gx1, m.z0, 'NS'], [gx2, m.z0, 'NS'], [gx1, m.z1, 'NS'], [gx2, m.z1, 'NS'],
                                [m.x0, gz1, 'EW'], [m.x0, gz2, 'EW'], [m.x1, gz1, 'EW'], [m.x1, gz2, 'EW']]) {
    m.gates.push({ x: gx, z: gz, axis });
    ctx.doors.push({ kind: 'market', ward: m.name, x: gx, z: gz, axis, base, cells: axis === 'NS' ? [[gx, gz], [gx + 1, gz]] : [[gx, gz], [gx, gz + 1]] });
  }
}
function buildMarketGrid(ctx, m) {
  const { store, fields } = ctx;
  const cx = (m.x0 + m.x1) >> 1, cz = (m.z0 + m.z1) >> 1;
  const gx1 = m.x0 + Math.floor((m.x1 - m.x0) / 3), gx2 = m.x0 + Math.floor((m.x1 - m.x0) * 2 / 3);
  const gz1 = m.z0 + Math.floor((m.z1 - m.z0) / 3), gz2 = m.z0 + Math.floor((m.z1 - m.z0) * 2 / 3);
  // 井字街：两条纵街 + 两条横街（3 宽，砖铺）
  const pave = (x, z) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const i = CHANGAN.fieldIndex(x + dx, z + dz);
      if (fields.water[i]) continue;
      store.set(x + dx, m.base, z + dz, PAL.brickPave);
      fields.topColor[i] = PAL.brickPave;
      fields.road[i] = 6;
    }
  };
  for (let x = m.x0 + 1; x <= m.x1 - 1; x++) { pave(x, gz1); pave(x, gz2); }
  for (let z = m.z0 + 1; z <= m.z1 - 1; z++) { pave(gx1, z); pave(gx2, z); }
  m.blocks = [];
  const xs = [m.x0 + 1, gx1 + 2, gx2 + 2], zs = [m.z0 + 1, gz1 + 2, gz2 + 2];
  const xe = [gx1 - 2, gx2 - 2, m.x1 - 1], ze = [gz1 - 2, gz2 - 2, m.z1 - 1];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m.blocks.push({ x0: xs[a], z0: zs[b], x1: xe[a], z1: ze[b] });
  // 市楼（市署）：井字中枢，攒尖二层 + 旗杆（鼓钲在此）
  const lb = 3;
  store.fill(cx - lb, m.base + 1, cz - lb, cx + lb, m.base + 2, cz + lb, PAL.stoneGrey);
  CHANGAN.proto.marketTower(ctx, cx, cz, m.base + 3);
  m.tower = { x: cx, z: cz };
}
// 十类型店肆+东西分化（西仓储邸店胡商货场卸货驼队大宗杂密深 vs 东小精书香药绢宝洁贵；差异来自建筑空间密度院落仓储街面）
function buildMarketShops(ctx, m, east) {
  const proto = CHANGAN.proto;
  const ST = CHANGAN.ShopType;
  const trades = east
    ? ['珍奇', '书坊', '绢帛', '漆器', '邸店', '香药', '金银', '笔砚', '茶肆']
    : ['胡商邸店', '酒肆', '金银', '药材', '绢帛', '麸行', '鞧辔', '柜坊', '凶肆'];
  const isStreet = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (i < 0 || i >= ctx.fields.road.length) return false;
      if (!ctx.fields.road[i]) return false;
    }
    return true;
  };
  m.blocks.forEach((b, bi) => {
    const trade = trades[bi];
    const rng = CHANGAN.rngOf(ctx.seed, 'mk-' + m.name + '-' + bi);
    // 四条边：边外为井字街者，沿边内侧排店，店门朝街
    const edges = [];
    if (isStreet(b.x0, b.z0 - 1, b.x1, b.z0 - 1)) edges.push('N');
    if (isStreet(b.x0, b.z1 + 1, b.x1, b.z1 + 1)) edges.push('S');
    if (isStreet(b.x0 - 1, b.z0, b.x0 - 1, b.z1)) edges.push('W');
    if (isStreet(b.x1 + 1, b.z0, b.x1 + 1, b.z1)) edges.push('E');
    // 沿街十类型分化：东用 Luxury/Courtyard/ShopHouse（小精洁），西用 Warehouse/Foreign/Inn/Workshop/Storage（大杂深）
    const flagInside = (x, z, w2, d2, e2) => {
      const fx = e2 === 'E' ? x + w2 - 1 + 2 : e2 === 'W' ? x - 2 : x + 1;
      const fz = e2 === 'S' ? z + d2 - 1 + 2 : e2 === 'N' ? z - 2 : z + 1;
      return fx > m.x0 && fx < m.x1 && fz > m.z0 && fz < m.z1;
    };
    const buildEdgeShop = (x, z, w2, d2, e2) => {
      if (!rectFree(ctx, x, z, x + w2 - 1, z + d2 - 1)) return;
      if (!flagInside(x, z, w2, d2, e2)) return; // 市旗须在市内（防越界审计失败）
      if (!east) {
        const r = rng();
        if (trade === '胡商邸店' && w2 >= 8) ST.ForeignCompound(ctx, x, z, w2, d2, m.base, rng, e2);
        else if (r < 0.22 && w2 >= 6) ST.Warehouse(ctx, x, z, w2, d2, m.base, rng);
        else if (r < 0.34) ST.Inn(ctx, x, z, w2, d2, m.base, rng, e2);
        else if (r < 0.46) ST.Workshop(ctx, x, z, w2, d2, m.base, rng, e2);
        else if (r < 0.54) ST.CourtyardShop(ctx, x, z, w2, d2, m.base, trade, east, rng, e2);
        else ST.ShopHouse(ctx, x, z, w2, d2, m.base, trade, east, rng, e2);
      } else {
        const r = rng();
        if ((trade === '金银' || trade === '香药' || trade === '珍奇') && r < 0.5) ST.LuxuryShop(ctx, x, z, w2, d2, m.base, trade, rng, e2);
        else if (r < 0.3) ST.CourtyardShop(ctx, x, z, w2, d2, m.base, trade, east, rng, e2);
        else ST.ShopHouse(ctx, x, z, w2, d2, m.base, trade, east, rng, e2);
      }
    };
    for (const e of edges) {
      if (e === 'N' || e === 'S') {
        const z = e === 'N' ? b.z0 : b.z1 - 4;
        let x = b.x0;
        // 西市街面更杂（间隙小、进深大），东市较整洁（间隙大、进深小）
        const gapP = east ? 0.5 : 0.25;
        while (x <= b.x1 - 3) {
          const uw = Math.min(CHANGAN.rint(rng, east ? 4 : 5, east ? 6 : 8), b.x1 - x + 1);
          if (uw >= 4) buildEdgeShop(x, z, uw, 5, e);
          x += uw + (rng() < gapP ? 1 : 0);
        }
      } else {
        const x = e === 'W' ? b.x0 : b.x1 - 4;
        let z = b.z0;
        const gapP = east ? 0.5 : 0.25;
        while (z <= b.z1 - 3) {
          const ud = Math.min(CHANGAN.rint(rng, east ? 4 : 5, east ? 6 : 8), b.z1 - z + 1);
          if (ud >= 4) buildEdgeShop(x, z, 5, ud, e);
          z += ud + (rng() < gapP ? 1 : 0);
        }
      }
    }
    // 区块内部：西多仓储货场卸货（密深杂），东多精致小院摊群（疏洁贵）
    const icx = (b.x0 + b.x1) >> 1, icz = (b.z0 + b.z1) >> 1;
    if (!east) {
      // 西市：大货场+仓+驼队空地（纵深复杂）
      if (rectFree(ctx, icx - 6, icz - 4, icx + 6, icz + 4)) ST.StorageYard(ctx, icx - 6, icz - 4, 13, 9, m.base, rng);
      for (let k = 0; k < 5; k++) {
        const cxk = CHANGAN.rint(rng, b.x0 + 1, b.x1 - 3), czk = CHANGAN.rint(rng, b.z0 + 1, b.z1 - 3);
        if (rectFree(ctx, cxk, czk, cxk + 2, czk + 2)) ST.Warehouse(ctx, cxk, czk, 3, 3, m.base, rng);
      }
      for (let k = 0; k < 2; k++) {
        const sx = icx - 2 + k * 4;
        if (rectFree(ctx, sx, icz, sx + 1, icz + 1)) proto.stall(ctx, sx, icz, m.base, rng);
      }
    } else {
      if (rectFree(ctx, icx - 5, icz - 4, icx + 5, icz + 4)) {
        for (let k = 0; k < 4; k++) {
          const sx = icx - 3 + (k % 2) * 5, sz = icz - 3 + (k >> 1) * 5;
          if (rectFree(ctx, sx, sz, sx + 1, sz + 1)) proto.stall(ctx, sx, sz, m.base, rng);
        }
      }
      for (let k = 0; k < 2; k++) {
        const cxk = CHANGAN.rint(rng, b.x0 + 1, b.x1 - 2), czk = CHANGAN.rint(rng, b.z0 + 1, b.z1 - 2);
        if (rectFree(ctx, cxk, czk, cxk + 1, czk + 1)) proto.crate(ctx, cxk, czk, m.base, rng);
      }
    }
  });
}
function buildWestMarketDocks(ctx, m) {
  const { store, fields } = ctx;
  const P = PAL;
  // 漕渠海池：市场西北角水池 + 卸货岸线（考古有池渠遗迹；南缘让开井字横街）
  const px0 = m.x0 + 4, px1 = m.x0 + 16, pz0 = m.z0 + 38, pz1 = m.z0 + 50;
  for (let x = px0; x <= px1; x++) for (let z = pz0; z <= pz1; z++) {
    const i = CHANGAN.fieldIndex(x, z);
    for (let y = m.base; y <= fields.topH[i]; y++) store.del(x, y, z); // 整列清空再沉池
    store.set(x, m.base - 2, z, P.loessDeep);
    store.set(x, m.base - 1, z, P.canalWater);
    fields.topH[i] = m.base - 1; fields.topColor[i] = P.canalWater; fields.water[i] = 1;
  }
  // 码头驳岸 + 缆桩 + 货堆
  for (let x = px0 - 1; x <= px1 + 1; x++) {
    store.set(x, m.base, pz0 - 1, P.stoneGrey); store.set(x, m.base, pz1 + 1, P.stoneGrey);
  }
  const rng = CHANGAN.rngOf(ctx.seed, 'docks');
  for (let k = 0; k < 8; k++) {
    const x = CHANGAN.rint(rng, px0 - 1, px1 + 1), z = rng() < 0.5 ? pz0 - 2 : pz1 + 2;
    if (!rectFree(ctx, x, z, x, z)) continue;
    store.set(x, m.base + 1, z, P.timberDark); // 缆桩
    if (rng() < 0.7) CHANGAN.proto.crate(ctx, x + 1, z, m.base, rng);
  }
  m.pool = { x0: px0, x1: px1, z0: pz0, z1: pz1 };
}
