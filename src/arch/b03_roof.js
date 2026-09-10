// b03_roof.js — 连续举折屋面（docs/15 D1 核心）
// 输入城市格坐标；输出 MeshBuf 面片。硬约束：坡面高度单调，相邻采样高差 ≤ 0.35 m
// （1 城市格 ≈ 13.8 m，采样步长按格算，由 visual-gate H1 校验）。
'use strict';

/**
 * @param {object} o
 *   x0,z0,x1,z1  檐口包围（城市格，已含出檐）
 *   yEave        檐口高度（城市格 Y）
 *   yRidge       正脊高度（城市格 Y）
 *   kind         'gable'|'xie'|'hip'
 *   curve        举折指数（>1 顶陡底缓），默认 1.55
 *   upturn       翼角起翘（城市格），默认 0.35
 *   rgb          屋面主色 [r,g,b]
 *   ridgeRGB     脊色
 *   ridgeAlongX  正脊是否沿 X（悬山/庑殿默认 true）
 */
CHANGAN.buildRoofMesh = function (buf, o) {
  const x0 = o.x0, z0 = o.z0, x1 = o.x1, z1 = o.z1;
  const yEave = o.yEave, yRidge = o.yRidge;
  const kind = o.kind || 'gable';
  const curve = o.curve || 1.55;
  const upturn = o.upturn == null ? 0.35 : o.upturn;
  const rgb = o.rgb || CHANGAN.MAT.roofGrey;
  const ridgeRGB = o.ridgeRGB || CHANGAN.MAT.ridge;
  const alongX = o.ridgeAlongX !== false;
  const rise = Math.max(0.01, yRidge - yEave);

  // 采样：保证坡面相邻高差在米制下可控
  // 沿 v（檐→脊）采样 7~12 段
  const NV = Math.max(8, Math.min(14, Math.round(Math.max(x1 - x0, z1 - z0) * 1.2)));
  // 沿脊采样
  const span = alongX ? (x1 - x0) : (z1 - z0);
  const NU = Math.max(6, Math.min(28, Math.round(span * 2)));

  /** 举折：v∈[0,1] 檐→脊，高度 */
  const hOf = (v) => yEave + rise * Math.pow(v, curve);
  /** 翼角：靠近四角且靠近檐口时上翘 */
  const upOf = (u, v) => {
    const corner = Math.max(0, (Math.abs(u * 2 - 1) - 0.72) / 0.28);
    const eave = Math.pow(1 - v, 2);
    return upturn * corner * eave;
  };

  if (kind === 'hip') {
    buildHip(buf, { x0, z0, x1, z1, yEave, yRidge, NV, NU, hOf, upOf, rgb, ridgeRGB, alongX });
  } else if (kind === 'xie') {
    buildXieshan(buf, { x0, z0, x1, z1, yEave, yRidge, NV, NU, hOf, upOf, rgb, ridgeRGB, alongX });
  } else {
    buildGable(buf, { x0, z0, x1, z1, yEave, yRidge, NV, NU, hOf, upOf, rgb, ridgeRGB, alongX });
  }

  // 檐口厚度条（薄檐口，压深色）
  addEaveBand(buf, { x0, z0, x1, z1, yEave, alongX, rgb: [rgb[0] * 0.75 | 0, rgb[1] * 0.75 | 0, rgb[2] * 0.75 | 0] });
};

function sampleUV(NV, NU, alongX, p) {
  // 返回采样点列表 [ {u,v} ]
  const pts = [];
  for (let iv = 0; iv <= NV; iv++) {
    const v = iv / NV;
    for (let iu = 0; iu <= NU; iu++) {
      const u = iu / NU;
      pts.push({ u, v, iu, iv });
    }
  }
  return pts;
}

function gablePoint(u, v, p, side) {
  // side: -1 南/前坡, +1 北/后坡（沿 X 正脊时）；沿 Z 正脊时东西坡
  const { x0, z0, x1, z1, hOf, upOf, alongX } = p;
  const h = hOf(v) + upOf(u, v);
  if (alongX) {
    const x = x0 + (x1 - x0) * u;
    const zEdge = side < 0 ? z1 : z0; // side -1 → 南坡用 z1（大 z）
    const zRidge = (z0 + z1) * 0.5;
    // v=0 在檐，v=1 在脊
    const z = zEdge + (zRidge - zEdge) * v;
    return [x, h, z];
  }
  const z = z0 + (z1 - z0) * u;
  const xEdge = side < 0 ? x1 : x0;
  const xRidge = (x0 + x1) * 0.5;
  const x = xEdge + (xRidge - xEdge) * v;
  return [x, h, z];
}

function buildGable(buf, p) {
  const { NV, NU, rgb } = p;
  // 两坡
  for (const side of [-1, 1]) {
    const cells = [];
    for (let iv = 0; iv < NV; iv++) {
      for (let iu = 0; iu < NU; iu++) {
        const u0 = iu / NU, u1 = (iu + 1) / NU;
        const v0 = iv / NV, v1 = (iv + 1) / NV;
        const a = gablePoint(u0, v0, p, side);
        const b = gablePoint(u1, v0, p, side);
        const c = gablePoint(u1, v1, p, side);
        const d = gablePoint(u0, v1, p, side);
        // 法线粗算：用 +Y 占位，着色靠 shade；方向码 2=+Y
        const groove = CHANGAN.tileGroove(rgb, iu + (side > 0 ? 1 : 0));
        // 坡向阴影：前坡略亮
        const shade = side < 0 ? 1.0 : 0.9;
        const col = [groove[0] * shade | 0, groove[1] * shade | 0, groove[2] * shade | 0];
        // 三角面绕序：保证上面朝外
        if (side < 0) buf.quad(a, b, c, d, col, 255);
        else buf.quad(d, c, b, a, col, 255);
      }
    }
  }
  // 山墙尖（两端封板）
  const { x0, z0, x1, z1, yEave, yRidge, alongX } = p;
  const wallRGB = CHANGAN.MAT.plasterWarm;
  if (alongX) {
    for (const x of [x0, x1]) {
      const a = [x, yEave, z0], b = [x, yEave, z1], c = [x, yRidge, (z0 + z1) / 2];
      const base = buf.pos.length / 3;
      for (const pt of [a, b, c]) {
        buf.pos.push(pt[0], pt[1], pt[2]);
        buf.nor.push(x === x0 ? 1 : 0);
        buf.col.push(wallRGB[0] * 0.92 | 0, wallRGB[1] * 0.92 | 0, wallRGB[2] * 0.92 | 0);
      }
      if (x === x0) buf.idx.push(base, base + 1, base + 2);
      else buf.idx.push(base + 2, base + 1, base);
    }
  } else {
    for (const z of [z0, z1]) {
      const a = [x0, yEave, z], b = [x1, yEave, z], c = [(x0 + x1) / 2, yRidge, z];
      const base = buf.pos.length / 3;
      for (const pt of [a, b, c]) {
        buf.pos.push(pt[0], pt[1], pt[2]);
        buf.nor.push(z === z0 ? 5 : 4);
        buf.col.push(wallRGB[0] * 0.92 | 0, wallRGB[1] * 0.92 | 0, wallRGB[2] * 0.92 | 0);
      }
      if (z === z0) buf.idx.push(base + 2, base + 1, base);
      else buf.idx.push(base, base + 1, base + 2);
    }
  }
  addRidge(buf, p);
}

function buildXieshan(buf, p) {
  // 歇山：主体两坡 + 四角小坡（简化为上部悬山 + 下部四坡过渡）
  // 先做上部悬山（脊到 mid），再做下部四坡
  const { x0, z0, x1, yEave, yRidge, alongX, hOf, upOf, rgb, ridgeRGB, z1 } = p;
  const midV = 0.42;
  const inset = 0.18; // 下部山面收进比例

  // 下部四坡（hip-like）从檐到 midV
  const xa = x0 + (x1 - x0) * inset;
  const za = z0 + (z1 - z0) * inset;
  // 用 hip 下半段
  buildHip(buf, {
    ...p,
    x0, z0, x1, z1,
    v0: 0, v1: midV,
    forceHip: true,
  });

  // 上部悬山（缩小 footprint）
  buildGable(buf, {
    ...p,
    x0: xa, z0: za, x1: x1 - (x1 - x0) * inset, z1: z1 - (z1 - z0) * inset,
    yEave: hOf(midV) + upOf(0.5, midV) * 0.2,
    // yRidge 不变
  });
  addRidge(buf, p);
}

function buildHip(buf, p) {
  const { x0, z0, x1, z1, yEave, yRidge, NV, NU, hOf, upOf, rgb, alongX } = p;
  const v0 = p.v0 != null ? p.v0 : 0;
  const v1 = p.v1 != null ? p.v1 : 1;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // 庑殿：四坡汇到短正脊（沿长边）
  const longX = (x1 - x0) >= (z1 - z0);
  const ridgeHalf = longX ? (x1 - x0) * 0.22 : (z1 - z0) * 0.22;

  function point(u, v, face) {
    // face: 0南 1北 2西 3东
    const h = hOf(v0 + (v1 - v0) * v) + upOf(u, v0 + (v1 - v0) * v);
    // 从外缘向脊收缩
    if (face === 0) { // +z 边
      const z = z1 + (cz - z1) * v;
      const x = x0 + (x1 - x0) * u;
      return [x, h, z];
    }
    if (face === 1) {
      const z = z0 + (cz - z0) * v;
      const x = x0 + (x1 - x0) * u;
      return [x, h, z];
    }
    if (face === 2) {
      const x = x0 + (cx - x0) * v;
      const z = z0 + (z1 - z0) * u;
      return [x, h, z];
    }
    const x = x1 + (cx - x1) * v;
    const z = z0 + (z1 - z0) * u;
    return [x, h, z];
  }

  const faces = [0, 1, 2, 3];
  for (const face of faces) {
    const nU = face < 2 ? NU : Math.max(4, Math.round(NU * 0.7));
    for (let iv = 0; iv < NV; iv++) {
      for (let iu = 0; iu < nU; iu++) {
        const u0 = iu / nU, u1 = (iu + 1) / nU;
        const vv0 = iv / NV, vv1 = (iv + 1) / NV;
        const a = point(u0, vv0, face);
        const b = point(u1, vv0, face);
        const c = point(u1, vv1, face);
        const d = point(u0, vv1, face);
        const shade = [1.0, 0.88, 0.94, 0.94][face];
        const groove = CHANGAN.tileGroove(rgb, iu);
        const col = [groove[0] * shade | 0, groove[1] * shade | 0, groove[2] * shade | 0];
        if (face === 0 || face === 2) buf.quad(a, b, c, d, col, 255);
        else buf.quad(d, c, b, a, col, 255);
      }
    }
  }
  // 短正脊
  addRidge(buf, p);
}

function addRidge(buf, p) {
  const { x0, z0, x1, z1, yRidge, alongX, ridgeRGB } = p;
  const y = yRidge;
  const th = 0.18;
  const inset = 0.22;
  if (alongX) {
    const xa = x0 + (x1 - x0) * inset, xb = x1 - (x1 - x0) * inset;
    const zc = (z0 + z1) / 2;
    buf.box(xa, y, zc - th, xb, y + th * 1.4, zc + th, ridgeRGB, 1);
  } else {
    const za = z0 + (z1 - z0) * inset, zb = z1 - (z1 - z0) * inset;
    const xc = (x0 + x1) / 2;
    buf.box(xc - th, y, za, xc + th, y + th * 1.4, zb, ridgeRGB, 1);
  }
  // 鸱尾（简）
  const chiw = 0.35;
  if (alongX) {
    for (const x of [x0 + (x1 - x0) * inset, x1 - (x1 - x0) * inset]) {
      buf.box(x - chiw, y + th, (z0 + z1) / 2 - chiw, x + chiw, y + th + 0.55, (z0 + z1) / 2 + chiw, ridgeRGB, 1);
    }
  }
}

function addEaveBand(buf, p) {
  const { x0, z0, x1, z1, yEave, rgb } = p;
  const t = 0.1;
  const th = 0.16;
  // 四边薄檐口，不做实心板
  buf.box(x0, yEave - t, z0, x1, yEave, z0 + th, rgb, 0.85);
  buf.box(x0, yEave - t, z1 - th, x1, yEave, z1, rgb, 0.85);
  buf.box(x0, yEave - t, z0, x0 + th, yEave, z1, rgb, 0.85);
  buf.box(x1 - th, yEave - t, z0, x1, yEave, z1, rgb, 0.85);
}

/** 硬不变量 H1 采样检查（供 visual-gate / smoke 用） */
CHANGAN.auditRoofProfile = function (samples) {
  // samples: [{v,hMeters}] 已按 v 升序，单位米
  let mono = true;
  let maxStep = 0;
  for (let i = 1; i < samples.length; i++) {
    const dh = samples[i].hMeters - samples[i - 1].hMeters;
    if (dh < -1e-6) mono = false;
    const step = Math.abs(dh);
    if (step > maxStep) maxStep = step;
  }
  return { pass: mono && maxStep <= 0.35, mono, maxStep };
};
