// tools/visual-gate.js — 构建门：硬不变量 + 截图 + imgstat + 汇总 gate.json
// 用法: node tools/visual-gate.js --tag p1 [--views axis,hanyuanTop,lane,wardGate] [--seed 5a17c4a9]
// 依据: 验收标准.md / docs/15 §4。禁止自评视觉分数；本工具只产出证据。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const a = {
    tag: 'p1',
    views: 'axis,hanyuanTop,lane,wardGate,mingde,westMarket',
    seed: '5a17c4a9',
    t: 'noon',
    q: 'mid',
    skipBuild: false,
    skipShot: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--tag') { a.tag = argv[++i]; }
    else if (argv[i] === '--views') { a.views = argv[++i]; }
    else if (argv[i] === '--seed') { a.seed = argv[++i]; }
    else if (argv[i] === '--t') { a.t = argv[++i]; }
    else if (argv[i] === '--q') { a.q = argv[++i]; }
    else if (argv[i] === '--skip-build') a.skipBuild = true;
    else if (argv[i] === '--skip-shot') a.skipShot = true;
  }
  return a;
}

function run(cmd, args, opts) {
  console.log('[gate] $', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: true, ...opts });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status === 0;
}

/** 硬不变量：从生成器侧采样检查（Node 直接 require 不便，这里做静态/结构检查 + 产物侧） */
function checkHardInvariants(outDir, report) {
  const gates = [];
  const ok = (id, pass, detail) => gates.push({ id, pass: !!pass, detail: String(detail || '') });

  // H0 产物存在
  const indexPath = path.join(ROOT, 'index.html');
  ok('H0_artifact', fs.existsSync(indexPath), fs.existsSync(indexPath) ? 'index.html 存在' : 'index.html 缺失');

  // H1-H5 依赖浏览器侧 spec 日志；P1 先检查统计字段与截图完整性
  const shots = (report && report.shots) || [];
  ok('shots_count', shots.length >= 4, `截图 ${shots.length} 张`);

  // 色数/近黑：imgstat 已写入 report 时使用
  if (report && report.imgstat) {
    const st = report.imgstat;
    ok('color_variety', (st.meanColors || 0) >= 120, `均色数 ${st.meanColors}`);
    ok('not_crushed_black', (st.meanNearBlack || 1) < 0.35, `近黑占比 ${st.meanNearBlack}`);
  }

  // 从 index.html 抽查 mesh 路径已打包
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, 'utf8');
    ok('pack_mesh_roof', html.includes('buildRoofMesh') && html.includes('buildHallMesh'), '连续屋面已打包');
    ok('pack_units', html.includes('CITY_CELL_M'), '米制单位已打包');
    ok('pack_visual_gate_source', html.includes('meshPartsToChunks'), 'mesh 分块已打包');
  }

  // P1 核心：meshHalls 应 > 0（来自 report.stats）
  if (report && report.stats) {
    ok('H9_mesh_halls', (report.stats.meshHalls || 0) > 0, `meshHalls=${report.stats.meshHalls}`);
  }

  return gates;
}

async function main() {
  const a = parseArgs(process.argv);
  const outDir = path.join(ROOT, '验收截图', a.tag);
  fs.mkdirSync(outDir, { recursive: true });

  const started = Date.now();
  const result = {
    tag: a.tag,
    seed: a.seed,
    t: a.t,
    q: a.q,
    startedAt: new Date().toISOString(),
    steps: [],
    gates: [],
    stats: null,
    imgstat: null,
    shots: [],
  };

  // 1. build
  if (!a.skipBuild) {
    const ok = run('node', ['src/build.js']);
    result.steps.push({ name: 'build', pass: ok });
    if (!ok) {
      result.pass = false;
      fs.writeFileSync(path.join(outDir, 'gate.json'), JSON.stringify(result, null, 2));
      console.error('[gate] 构建失败');
      process.exit(1);
    }
  }

  // 2. shots
  if (!a.skipShot) {
    const ok = run('node', [
      'tools/shot.js',
      '--out', path.relative(ROOT, outDir).replace(/\\/g, '/'),
      '--views', a.views,
      '--seed', a.seed,
      '--t', a.t,
      '--q', a.q,
    ]);
    result.steps.push({ name: 'shot', pass: ok });
  }
  {
    const reportPath = path.join(outDir, 'report.json');
    if (fs.existsSync(reportPath)) {
      const rep = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      result.shots = rep.shots || [];
      result.stats = rep.stats || (rep.meta && rep.meta.stats) || null;
      result.pageErrors = rep.errors || [];
    }
  }

  // 3. imgstat
  const pngs = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
  if (pngs.length) {
    const ok = run('node', ['tools/imgstat.js', path.relative(ROOT, outDir).replace(/\\/g, '/') + '/*.png']);
    result.steps.push({ name: 'imgstat', pass: ok });
    // imgstat 打印到 stdout；尝试读取旁路 json
    const imgJson = path.join(outDir, 'imgstat.json');
    if (fs.existsSync(imgJson)) {
      try { result.imgstat = JSON.parse(fs.readFileSync(imgJson, 'utf8')); } catch {}
    }
  }

  // 4. hard invariants
  result.gates = checkHardInvariants(outDir, result);
  result.pass = result.steps.every(s => s.pass) && result.gates.every(g => g.pass);
  result.finishedAt = new Date().toISOString();
  result.elapsedMs = Date.now() - started;

  fs.writeFileSync(path.join(outDir, 'gate.json'), JSON.stringify(result, null, 2));
  console.log('\n[gate] ========== 汇总 ==========');
  for (const g of result.gates) {
    console.log(`  ${g.pass ? 'PASS' : 'FAIL'}  ${g.id}  ${g.detail}`);
  }
  console.log(`[gate] ${result.pass ? '通过' : '未通过'} → ${path.relative(ROOT, path.join(outDir, 'gate.json'))}`);
  process.exit(result.pass ? 0 : 2);
}

main().catch(e => { console.error('[gate] 失败:', e); process.exit(1); });
