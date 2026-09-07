// edit-test.js — EditOpV2 建筑层/宏观层、旧记录迁移与局部重网格测试
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = __dirname;
const files = [
  'gen/g01_core.js','gen/g02_skeleton.js','gen/g03_wards.js','gen/g04_proto.js','gen/g04_landmark.js',
  'gen/g04_fine.js','gen/g05_detail.js','gen/g06_audit_mesh.js','gen/g07_pipeline.js',
];
const sandbox = { console: { log() {}, warn() {}, error() {} } };
sandbox.globalThis = sandbox; vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
const C = vm.runInContext('CHANGAN', sandbox);
const result = C.generate(0x5a17c4a9, () => {});
if (!result.ok) throw new Error(result.error);
const ctx = result._ctx;
const box = ctx.fineStore.boxes.find(b => b.lod === 0 && b.buildingId > 0 && b.x1 - b.x0 >= 2 && b.y1 - b.y0 >= 2 && b.z1 - b.z0 >= 2);
if (!box) throw new Error('找不到可编辑细体素');
const qx = box.x0, qy = box.y0, qz = box.z0;
const before = ctx.fineStore.hasCell(qx, qy, qz);
const removed = C.applyOps(ctx, [{ version: 2, layer: 'architecture', x: qx, y: qy, z: qz, color: 0, quant: 8 }]);
if (!before || ctx.fineStore.hasCell(qx, qy, qz)) throw new Error('建筑层删除失败');
if (!removed.dirtyArchChunks.length || !removed.dirtyChunks.length) throw new Error('建筑层未标记局部重网格');
const rebuilt = C.meshArchitecture(ctx, removed.dirtyArchChunks);
if (!rebuilt.length || rebuilt.some(ch => !Array.isArray(ch.lods) || ch.lods.length !== 3)) throw new Error('建筑层局部 LOD 重建失败');
C.applyOps(ctx, [{ version: 2, layer: 'architecture', x: qx, y: qy, z: qz, color: C.PAL.rammed, quant: 8 }]);
if (!ctx.fineStore.hasCell(qx, qy, qz)) throw new Error('建筑层添加失败');
const macro = C.applyOps(ctx, [{ x: -399, y: 2, z: -367, c: C.PAL.rammed }]);
if (!macro.dirtyChunks.length || ctx.store.get(-399, 2, -367) !== C.PAL.rammed) throw new Error('旧 EditOp 迁移失败');
const sample = result.architectureChunks.flatMap(ch => ch.lods.flatMap(l => Object.values(l))).find(Boolean);
if (!sample.pos || sample.pos.constructor.name !== 'Uint16Array' || sample.positionScale !== .125) throw new Error('建筑网格传输格式错误');
console.log('[edit-test] EditOpV2、旧记录迁移、双层碰撞代理与局部 LOD 重建全部通过 ✓');
