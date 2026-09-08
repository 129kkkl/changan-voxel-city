// smoke.js — 数据层冒烟测试（Node 桩）
// 用法: node smoke.js [seed]
// 复用与浏览器 Worker 完全相同的生成源码，验证：管线跑通、fatal 审计、预算、3 种子×2 确定性。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = __dirname;
const GEN_FILES = [
  'gen/g01_core.js', 'gen/g02_skeleton.js', 'gen/g03_wards.js',
  'gen/g04_proto.js', 'gen/g04_landmark.js', 'gen/g05_detail.js', 'gen/g06_audit_mesh.js', 'gen/g08_arch.js', 'gen/g07_pipeline.js',
];

function makeHarness(seed) {
  const logs = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('[warn] ' + a.join(' ')), error: (...a) => logs.push('[err] ' + a.join(' ')) },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of GEN_FILES) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  // 顶层 const 绑定不挂在全局对象上，需在同上下文中取值
  const CHANGAN = vm.runInContext('CHANGAN', sandbox);
  return { CHANGAN, logs };
}

function runSeed(seed) {
  const { CHANGAN, logs } = makeHarness(seed);
  const messages = [];
  const t0 = Date.now();
  const result = CHANGAN.generate(seed, (msg) => messages.push(msg));
  const ms = Date.now() - t0;
  return { result, messages, logs, ms };
}

let fail = 0;
const seeds = [0x5a17c4a9, 0x0d7a11c9, 0x9e3779b9];
const sums = [];

for (const seed of seeds) {
  for (let rep = 0; rep < 2; rep++) {
    const { result, messages, logs, ms } = runSeed(seed >>> 0);
    if (!result.ok) {
      console.error(`[FAIL] seed=${seed.toString(16)} rep=${rep}: ${result.error}`);
      fail++;
      continue;
    }
    const s = result.stats;
    if (rep === 0) {
      console.log(`[seed ${seed.toString(16)}] ${ms}ms 体素=${s.voxels} 坊=${s.wardCount} 市=${s.marketPlots} 门=${s.gateCount} 楼=${s.buildings} 树=${s.trees} checksum=${s.checksum}`);
      console.log('  审计: ' + s.audits.map(a => `${a.name}:${a.pass ? '过' : 'FATAL'}`).join(' '));
      if (s.stageMs) console.log('  分阶段: ' + Object.entries(s.stageMs).map(([k, v]) => k + '=' + v + 'ms').join(' '));
    }
    sums.push(s.checksum);
    if (!s.audits.every(a => a.pass)) { console.error('[FAIL] fatal 审计未过'); fail++; }
    if (s.voxels > s.budget.hard) { console.error(`[FAIL] 体素超硬预算 ${s.voxels} > ${s.budget.hard}`); fail++; }
  }
}
// 确定性：同种子两次 checksum 必须一致
for (let i = 0; i < seeds.length; i++) {
  if (sums[i * 2] !== sums[i * 2 + 1]) { console.error(`[FAIL] seed=${seeds[i].toString(16)} 两次生成 checksum 不一致`); fail++; }
}
console.log(fail === 0 ? '[smoke] 全部通过 ✓' : `[smoke] ${fail} 项失败 ✗`);
process.exit(fail === 0 ? 0 : 1);
