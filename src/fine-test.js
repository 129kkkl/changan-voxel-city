// fine-test.js — 1/8、1/4 定点边界/负坐标/往返与语法目录测试
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = __dirname;
const files = [
  'gen/g01_core.js','gen/g02_skeleton.js','gen/g03_wards.js',
  'gen/g04_proto.js','gen/g04_landmark.js','gen/g04_fine.js',
];
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f });
const C = vm.runInContext('CHANGAN', sandbox);
let fail = 0;
const check = (ok, msg) => { if (!ok) { console.error('[FAIL] ' + msg); fail++; } };
let state = 0x8e31ac47;
const rnd = () => { state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0; return state; };
for (let i = 0; i < 10000; i++) {
  const q8 = (rnd() % 6401) - 3200;
  const v8 = q8 / 8;
  check(C.fineDequantize(C.fineQuantize(v8, true)) === v8, '1/8 往返 @' + v8);
  const q4 = (((rnd() % 3201) - 1600) * 2);
  const v4 = q4 / 8;
  check(C.fineDequantize(C.fineQuantize(v4, false)) === v4, '1/4 往返 @' + v4);
}
for (const v of [-400, -352.125, -1.875, -0.125, 0, .125, 351.875, 399.875]) {
  check(C.fineDequantize(C.fineQuantize(v, true)) === v, '边界/负坐标 ' + v);
}
const S = new C.FineVoxelStore();
S.addWorld(-2.25, 1.125, -3.875, -1.125, 2.25, -2.25, C.PAL.zhu, 'timber', 0, 1, 1);
check(S.boxes.length === 1 && S.boxes[0].x0 === -18 && S.boxes[0].z0 === -31, '负坐标定点存储');
check(S.removeCell(-17, 10, -30) > 0, '细体素删除/分裂');
check(C.ARCH_GRAMMARS.residence.length >= 18, '住宅语法 >=18');
check(C.ARCH_GRAMMARS.official.length >= 6, '府第/官署语法 >=6');
check(C.ARCH_GRAMMARS.temple.length >= 5, '寺院语法 >=5');
check(C.ARCH_GRAMMARS.market.length >= 10, '市肆/仓栈语法 >=10');
console.log(fail ? `[fine-test] ${fail} 项失败 ✗` : '[fine-test] 10,000 次双尺度往返与语法目录全部通过 ✓');
process.exit(fail ? 1 : 0);
