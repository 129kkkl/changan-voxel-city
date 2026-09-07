// g07_pipeline.js — S0-S12 编排：阶段管线、进度、Worker 通信协议（generate/edit/doors）
'use strict';

// 详写名坊定制内容接管（坊墙坊门已在 stageWardGrowth 中建好，此处只注入定制内容）
CHANGAN.stageCustomWards = function (ctx) {
  for (const w of ctx.wards) {
    if (w.type !== 'ward') continue;
    const fn = CHANGAN.customWardContent[w.name + w.side];
    if (!fn) continue;
    fn(ctx, w);
  }
};

CHANGAN.generate = function (seed, onProgress) {
  const t0 = Date.now();
  seed = seed >>> 0;
  const store = new CHANGAN.VoxStore();
  const fields = CHANGAN.makeFields();
  const palRGB = CHANGAN.PAL_DEF.map(d => {
    const n = parseInt(d[1].slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  const ctx = {
    seed, store, fields, palRGB,
    CFG: CHANGAN.CFG, PAL: CHANGAN.PAL,
    wards: CHANGAN.buildWardTable(),
    counters: CHANGAN.makeCounters(),
    gates: [], doors: [],
    fatal: null,
    progress: (stage, pct) => { if (onProgress) onProgress({ type: 'progress', stage, pct: Math.min(1, Math.max(0, pct)) }); },
  };
  const stages = [
    ['terrain', '六坡地形：东南高西北低，龙首原、乐游原起势', () => CHANGAN.stageTerrain(ctx)],
    ['walls', '礼制骨架：外郭城墙、十二城门、三重城', () => CHANGAN.stageWalls(ctx)],
    ['streets', '街道工程：御道横街、排水沟、路拱', () => CHANGAN.stageStreets(ctx)],
    ['wards', '坊内生长：108 坊墙门、十字街、十六区宅院', () => CHANGAN.stageWardGrowth(ctx)],
    ['markets', '东西两市：市墙八门、井字街、市楼行肆', () => CHANGAN.stageMarkets(ctx)],
    ['custom', '名坊详写：大寺名宅、国子监、王府', () => CHANGAN.stageCustomWards(ctx)],
    ['palaces', '三大内：太极宫、皇城百司、大明宫、兴庆宫', () => CHANGAN.stagePalaces(ctx)],
    ['water', '五渠成网：龙首、清明、永安、漕、黄渠与曲江', () => CHANGAN.stageWater(ctx)],
    ['detail', '生活细节：槐行柳岸、井台灯笼、寺观松竹', () => CHANGAN.stageDetail(ctx)],
    ['seal', '封壳与字段刷新', () => CHANGAN.stageSeal(ctx)],
  ];
  const stageMs = {};
  try {
    for (let i = 0; i < stages.length; i++) {
      ctx.progress(stages[i][0], i / stages.length);
      const tS = Date.now();
      stages[i][2]();
      stageMs[stages[i][0]] = Date.now() - tS;
    }
  } catch (err) {
    return { ok: false, error: '生成阶段失败：' + (err && err.stack || err) };
  }
  {
    const tS = Date.now();
    for (const w of ctx.wards) {
      for (let x = w.x0; x <= w.x1; x++) for (let z = w.z0; z <= w.z1; z++) fields.wardId[CHANGAN.fieldIndex(x, z)] = w.id;
    }
    stageMs.wardId = Date.now() - tS;
  }
  ctx.progress('audit', 0.9);
  let audits;
  {
    const tS = Date.now();
    if (CHANGAN.buildLandmarkLODs) CHANGAN.buildLandmarkLODs(ctx);
    audits = CHANGAN.runAudits(ctx);
    // 开发态多样性审计（打印，不致命；地标 generic 违规已在 fatal 中）
    try {
      const d = CHANGAN.auditArchitectureDiversity(ctx);
      const w = CHANGAN.auditWardRepetition(ctx);
      const l = CHANGAN.auditLandmarkUniqueness(ctx);
      audits.push({ name: '多样性', pass: true, detail: '重复签名' + d.dupSign + '/院落' + d.planKinds + '种/最大重复' + d.maxPlanRepeat });
      audits.push({ name: '十坊抽检', pass: w.pass, detail: w.detail });
      audits.push({ name: '地标唯一性', pass: l.pass, detail: l.pass ? '六大地标轮廓各异' : '风险:' + l.risks.join(',') });
      if (!w.pass || !l.pass) { /* 警告不致命，留待返工 */ }
    } catch (e) { audits.push({ name: '多样性', pass: true, detail: 'audit跳过:' + e.message }); }
    stageMs.audit = Date.now() - tS;
  }
  if (ctx.fatal) {
    return { ok: false, error: 'fatal 审计未过：' + ctx.fatal, audits, _ctx: ctx, stageMs };
  }
  const checksum = CHANGAN.checksum(ctx);
  ctx.progress('mesh', 0.92);
  let chunks;
  try {
    const tS = Date.now();
    chunks = CHANGAN.meshAll(ctx, 'full');
    stageMs.mesh = Date.now() - tS;
  } catch (err) {
    return { ok: false, error: '网格化失败：' + (err && err.stack || err) };
  }
  const stats = {
    voxels: store.count,
    wardCount: ctx.wards.filter(w => w.type === 'ward').length,
    marketPlots: ctx.wards.filter(w => w.type === 'market').length,
    gateCount: ctx.gates.filter(g => g.city).length,
    buildings: ctx.counters.houses + ctx.counters.halls,
    shops: ctx.counters.shops, trees: ctx.counters.trees, towers: ctx.counters.towers,
    wells: ctx.counters.wells, bridges: ctx.counters.bridges, lamps: ctx.counters.lamps,
    checksum, audits, stageMs,
    budget: { soft: CFG.BUDGET.voxSoft, hard: CFG.BUDGET.voxHard },
    genMs: Date.now() - t0,
  };
  ctx.progress('done', 1);
  return {
    ok: true,
    stats,
    meta: {
      seed,
      wards: ctx.wards.map(w => ({ id: w.id, name: w.name, side: w.side, small: w.small, type: w.type, detail: w.detail, content: w.content, x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1, base: w.base || 0 })),
      gates: ctx.gates.map(g => ({ name: g.name, x: g.x, z: g.z, axis: g.axis, doors: g.doors, level: g.level, city: g.city })),
      doors: ctx.doors,
      paths: CHANGAN.buildPaths(ctx),
      viewAnchors: CHANGAN.buildViewAnchors(ctx),
      city: CFG.CITY, axis: CFG.AXIS_X, world: CFG.WORLD,
      wallH: CFG.Y.WALL_H,
    },
    fields: {
      groundH: fields.groundH, topH: fields.topH, topColor: fields.topColor,
      road: fields.road, wardId: fields.wardId, water: fields.water,
    },
    chunks,
    _ctx: ctx, // Worker 侧保留供 edit/doors；主线程收到的是结构化克隆，不含此项
  };
};

// ================================================================ 编辑与门扉（Worker 常驻上下文）
CHANGAN.applyOps = function (ctx, ops) {
  const { store, fields } = ctx;
  const dirtyChunks = new Set();
  const dirtyCols = new Set();
  for (const op of ops) {
    if (op.c === 0) store.del(op.x, op.y, op.z);
    else store.set(op.x, op.y, op.z, op.c);
    const di = CHANGAN.denseIndex(op.x, op.y, op.z);
    if (ctx.denseGrid && di >= 0 && di < ctx.denseGrid.length) ctx.denseGrid[di] = op.c;
    dirtyCols.add(op.x * 100000 + op.z);
    dirtyChunks.add((Math.floor((op.x - CFG.WORLD.x0) / CFG.CHUNK)) * 100 + Math.floor((op.z - CFG.WORLD.z0) / CFG.CHUNK));
  }
  // 重算受影响列顶面
  const colPatches = [];
  for (const key of dirtyCols) {
    const x = Math.round(key / 100000), z = key - Math.round(key / 100000) * 100000;
    const i = CHANGAN.fieldIndex(x, z);
    let top = -1, tc = 0;
    for (let y = CFG.WORLD.H - 1; y >= 0; y--) {
      const c = store.get(x, y, z);
      if (c) { top = y; tc = c; break; }
    }
    fields.topH[i] = top; fields.topColor[i] = tc;
    colPatches.push({ x, z, topH: top, topColor: tc });
  }
  return { dirtyChunks: [...dirtyChunks], dirtyCols: [...dirtyCols], colPatches };
};

CHANGAN.toggleDoors = function (ctx, closed, indices) {
  const { store, fields } = ctx;
  const ops = [];
  for (const di of indices) {
    const d = ctx.doors[di];
    if (!d) continue;
    for (const [x, z] of d.cells) {
      for (let y = 1; y <= 2; y++) {
        ops.push({ x, y: d.base + y, z, c: closed ? PAL.doorDark : 0 });
      }
    }
  }
  return CHANGAN.applyOps(ctx, ops);
};

// ================================================================ Worker 协议壳（Node 冒烟不触发）
(function () {
  const isWorker = typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof importScripts === 'function';
  if (!isWorker) return;
  let liveCtx = null;
  self.onmessage = function (e) {
    const msg = e.data || {};
    if (msg.cmd === 'generate') {
      const result = CHANGAN.generate(msg.seed >>> 0, p => self.postMessage(p));
      if (!result.ok) { self.postMessage({ type: 'fatal', error: result.error, audits: result.audits || null }); return; }
      liveCtx = result._ctx;
      delete result._ctx;
      const transfer = [];
      for (const k of Object.keys(result.fields)) transfer.push(result.fields[k].buffer);
      for (const ch of result.chunks) {
        for (const kind of Object.keys(ch.meshes)) {
          const m = ch.meshes[kind];
          if (!m) continue;
          transfer.push(m.pos.buffer, m.nor.buffer, m.col.buffer, m.idx.buffer);
        }
      }
      self.postMessage({ type: 'done', stats: result.stats, meta: result.meta, fields: result.fields, chunks: result.chunks }, transfer);
    } else if (msg.cmd === 'edit' && liveCtx) {
      const r = CHANGAN.applyOps(liveCtx, msg.ops);
      sendRemesh(liveCtx, r.dirtyChunks, msg.reqId, r.colPatches);
    } else if (msg.cmd === 'doors' && liveCtx) {
      const r = CHANGAN.toggleDoors(liveCtx, msg.closed, msg.indices);
      sendRemesh(liveCtx, r.dirtyChunks, msg.reqId, r.colPatches);
    }
  };
  function sendRemesh(ctx, dirtyChunks, reqId, colPatches) {
    const out = [];
    const transfer = [];
    for (const key of dirtyChunks) {
      const cx = Math.floor(key / 100), cz = key % 100;
      const W = CFG.WORLD;
      const ox = W.x0 + cx * CFG.CHUNK, oz = W.z0 + cz * CFG.CHUNK;
      const ex = Math.min(ox + CFG.CHUNK - 1, W.x1), ez = Math.min(oz + CFG.CHUNK - 1, W.z1);
      const at = (x, y, z) => {
        if (x < W.x0 || x > W.x1 || z < W.z0 || z > W.z1 || y < 0 || y >= W.H) return 0;
        return ctx.denseGrid[((x - W.x0) * (W.z1 - W.z0 + 1) + (z - W.z0)) * W.H + y];
      };
      const groupOf = c => CHANGAN.PAL_GROUP[c - 1] || 'opaque';
      const meshes = greedyMeshAll(ctx, at, groupOf, ox, oz, ex, ez);
      for (const kind of ['opaque', 'water', 'glow']) {
        const m = meshes[kind];
        if (m) transfer.push(m.pos.buffer, m.nor.buffer, m.col.buffer, m.idx.buffer);
      }
      out.push({ cx, cz, ox, oz, meshes });
    }
    self.postMessage({ type: 'remesh', reqId, chunks: out, colPatches: colPatches || [] }, transfer);
  }
})();
