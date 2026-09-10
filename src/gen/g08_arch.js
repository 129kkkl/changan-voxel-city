// g08_arch.js — 盛唐建筑大木作体系（ArchGrid 4× 构件级精实体素层）
// 【尺度口径修正（2026-09-10 审计）】1 城市格 ≈ 13.8 m，ARCH_S=4 → 1 建筑格 ≈ 3.45 m。
//   本层斗拱/瓦垄等 0.3 m 级构件在数学上无法表达（详见 docs/14_项目审计报告 §三），
//   按 docs/15_大重构升级方案 D1，建筑将在 P1+ 迁移至语义化参数模型（arch/），本文件届时下线。
// 核心设计原则（盛唐都城微缩箱庭）：
//   ② 虚实与进深：柱凸出在先，墙体内退 1 格，直棂窗向内开洞且设暗影背板，板门内凹设框；
//   ③ 斗拱内敛承托：坐斗、华栱与撩檐枋位于檐下，出挑严格小于屋檐，形成深沉檐下阴影；
//   ④ 屋面优美平缓：平缓举折剖面曲线，翼角微起，瓦垄同色系柔和微差；
//   ⑤ 鸱尾古拙雄健：正统唐代月牙鱼尾内卷形鸱吻，与正脊浑然一体，彻底消除突兀兔耳叉角；
//   ⑥ 空间与院落：正房坐北朝南、东西厢房合抱、南向门屋与院墙、中央砖石漫道与庭树；
//   ⑦ 单一权威数据源：建筑全部由本文件生成并直接网格化，向后兼容编辑与审计。
//   （原 g09_refine.js 的后置覆盖已全部并入本文件，补丁层取消。）
'use strict';

CHANGAN.version = 'refined-miniature-1';
CHANGAN.ARCH_SCALE = 4;
CHANGAN.ARCH_CHUNK = 64;

// 建筑格网细分倍率：1 城市格 = S 建筑格
const ARCH_S = 4;
const INV_S = 1.0 / ARCH_S; // 0.25

// ---------------------------------------------------------------- 建筑体素存储（支持 4× 细分空间哈希）
CHANGAN.ArchStore = class ArchStore {
  constructor() {
    this.map = new Map();
  }
  get count() { return this.map.size; }

  // 坐标映射：x∈[-8192, 8191], z∈[-8192, 8191], y∈[0, 511]
  _k(x, y, z) {
    return ((x + 8192) * 16384 + (z + 8192)) * 512 + y;
  }

  set(x, y, z, c) {
    if (y < 0 || y > 511 || !c) return;
    x |= 0; y |= 0; z |= 0;
    this.map.set(this._k(x, y, z), c);
  }

  get(x, y, z) {
    if (y < 0 || y > 511) return 0;
    return this.map.get(this._k(x | 0, y | 0, z | 0)) || 0;
  }

  has(x, y, z) {
    if (y < 0 || y > 511) return false;
    return this.map.has(this._k(x | 0, y | 0, z | 0));
  }

  del(x, y, z) {
    this.map.delete(this._k(x | 0, y | 0, z | 0));
  }

  fill(x0, y0, z0, x1, y1, z1, c) {
    const xa = Math.min(x0, x1) | 0, xb = Math.max(x0, x1) | 0;
    const ya = Math.min(y0, y1) | 0, yb = Math.max(y0, y1) | 0;
    const za = Math.min(z0, z1) | 0, zb = Math.max(z0, z1) | 0;
    for (let x = xa; x <= xb; x++) {
      for (let z = za; z <= zb; z++) {
        for (let y = ya; y <= yb; y++) {
          this.set(x, y, z, c);
        }
      }
    }
  }

  // 水平板
  slab(x0, y, z0, x1, z1, c) {
    const xa = Math.min(x0, x1) | 0, xb = Math.max(x0, x1) | 0;
    const za = Math.min(z0, z1) | 0, zb = Math.max(z0, z1) | 0;
    y |= 0;
    for (let x = xa; x <= xb; x++) {
      for (let z = za; z <= zb; z++) {
        this.set(x, y, z, c);
      }
    }
  }

  // 空心盒（外壳写入，内部留空，体素与面数减半）
  shellBox(x0, y0, z0, x1, y1, z1, c) {
    const xa = Math.min(x0, x1) | 0, xb = Math.max(x0, x1) | 0;
    const ya = Math.min(y0, y1) | 0, yb = Math.max(y0, y1) | 0;
    const za = Math.min(z0, z1) | 0, zb = Math.max(z0, z1) | 0;
    for (let x = xa; x <= xb; x++) {
      for (let z = za; z <= zb; z++) {
        this.set(x, ya, z, c);
        this.set(x, yb, z, c);
      }
    }
    for (let x = xa; x <= xb; x++) {
      for (let y = ya + 1; y < yb; y++) {
        this.set(x, y, za, c);
        this.set(x, y, zb, c);
      }
    }
    for (let z = za + 1; z < zb; z++) {
      for (let y = ya + 1; y < yb; y++) {
        this.set(xa, y, z, c);
        this.set(xb, y, z, c);
      }
    }
  }
};

// ---------------------------------------------------------------- 盛唐大木作构件库（ARCH）
const ARCH = {
  // ① 台基与踏跺：石阶基侧壁青石 + 顶面压面白石 + 南向石踏垛（带两翼垂带石）
  platform(a, x0, z0, x1, z1, y0, h, opts) {
    opts = opts || {};
    const bodyC = opts.bodyC || PAL.stoneGrey;
    const edgeC = opts.edgeC || PAL.stoneWhite;
    const yTop = y0 + h - 1;
    // 侧壁与底顶
    a.shellBox(x0, y0, z0, x1, yTop, z1, bodyC);
    // 顶面一圈白石压边
    for (let x = x0; x <= x1; x++) {
      a.set(x, yTop, z0, edgeC);
      a.set(x, yTop, z1, edgeC);
    }
    for (let z = z0; z <= z1; z++) {
      a.set(x0, yTop, z, edgeC);
      a.set(x1, yTop, z, edgeC);
    }
    // 内部顶面铺青砖
    for (let x = x0 + 1; x < x1; x++) {
      for (let z = z0 + 1; z < z1; z++) {
        a.set(x, yTop, z, PAL.brickPave);
      }
    }
    // 南向踏步（实心退台台阶，两翼设垂带石）
    if (opts.steps !== false && h >= 1) {
      const cx = (x0 + x1) >> 1;
      const stepHalf = opts.stepHalf || Math.max(3, Math.min(8, ((x1 - x0) >> 3)));
      const sx0 = cx - stepHalf, sx1 = cx + stepHalf;
      // 踏步级数
      const nSteps = Math.max(1, h);
      for (let s = 0; s < nSteps; s++) {
        const sz = z1 + 1 + s;
        const sy = yTop - s;
        if (sy < y0) break;
        // 阶梯踏面
        for (let sx = sx0; sx <= sx1; sx++) {
          for (let y = y0; y <= sy; y++) {
            a.set(sx, y, sz, edgeC);
          }
        }
        // 两侧垂带石
        for (let y = y0; y <= sy; y++) {
          a.set(sx0 - 1, y, sz, bodyC);
          a.set(sx1 + 1, y, sz, bodyC);
        }
      }
    }
    return yTop + 1; // 返回台基之上的可用第一层 y
  },

  // ② 檐柱列与梁额横贯（Colonnade & Architrave）
  // 柱网严格按照开间排列，柱头贯通阑额（横木），出头微露，形成平稳木构骨架
  colonnade(a, x0, z0, x1, z1, y0, h, bays, colC, colR, opts) {
    opts = opts || {};
    const R = Math.max(1, colR || 1);
    const half = (R - 1) >> 1;
    const xs = [];
    for (let b = 0; b <= bays; b++) {
      xs.push(Math.round(x0 + (x1 - x0) * b / bays));
    }
    const uniq = Array.from(new Set(xs)).sort((p, q) => p - q);

    const zRows = [z0, z1];
    if (z1 - z0 >= 24 && opts.midRow !== false) {
      zRows.push((z0 + z1) >> 1); // 进深特大时加金柱中排
    }

    const cols = [];
    for (const x of uniq) {
      for (const z of zRows) {
        cols.push([x, z]);
      }
    }

    // 立柱
    for (const [cx, cz] of cols) {
      for (let y = y0; y < y0 + h; y++) {
        for (let dx = -half; dx <= R - 1 - half; dx++) {
          for (let dz = -half; dz <= R - 1 - half; dz++) {
            a.set(cx + dx, y, cz + dz, colC);
          }
        }
      }
    }

    // 阑额（柱头横木贯通，一层高）
    const yTop = y0 + h - 1;
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      for (const z of zRows) {
        a.set(x, yTop, z, colC);
      }
    }
    for (let z = z0; z <= z1; z++) {
      for (const x of [x0, x1]) {
        a.set(x, yTop, z, colC);
      }
    }
    // 普拍枋（阑额上方一层压木，略挑 1 格）
    if (h >= 8) {
      const yPu = yTop;
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        a.set(x, yPu, z0, colC);
        a.set(x, yPu, z1, colC);
      }
    }

    return { cols, xs: uniq, yTop };
  },

  // ③ 斗拱体系（Dougong Bracket Cluster）
  // 栌斗坐柱头，逐跳出跳。严禁斗拱伸出檐口！斗拱严格在檐下深处！
  dougongSystem(a, cols, y0, colC, douC, reach) {
    reach = reach || 2;
    for (const [x, z] of cols) {
      a.fill(x - 1, y0, z - 1, x + 1, y0, z + 1, colC);
      for (let dy = 1; dy <= reach; dy++) a.fill(x, y0 + dy, z - dy, x, y0 + dy, z + dy, colC);
    }
  },

  // ④ 屋身与门窗墙体（内退进深 + 直棂窗 + 双扇板门）
  // 墙体从檐柱轴线向内退进 1 格，使得柱子凸立于墙体之前，形成真实的阴影虚实
  wallWithOpenings(a, x0, z0, x1, z1, y0, h, xs, opts) {
    opts = opts || {};
    const wallC = opts.wallC || PAL.plaster;
    const baseC = opts.baseC || PAL.brickPave;
    const frameC = opts.frameC || PAL.zhu;
    const doorDark = opts.doorDark || PAL.doorDark;
    const mullC = opts.mullC || PAL.timber;
    const bays = xs.length - 1;
    const midBay = bays >> 1;
    const yTop = y0 + h - 1;

    // 墙体坐标（向内缩 1 格）
    const wx0 = x0 + 1, wx1 = x1 - 1, wz0 = z0 + 1, wz1 = z1 - 1;

    for (let bay = 0; bay < bays; bay++) {
      const bx0 = xs[bay] + 1, bx1 = xs[bay + 1] - 1;
      if (bx1 < bx0) continue;
      const isMid = (bay === midBay);
      const isDoorBay = opts.hasDoor !== false && isMid;

      // 南面开间（z = wz1）
      for (let x = bx0; x <= bx1; x++) {
        for (let y = y0; y <= yTop; y++) {
          if (y === y0 || y === y0 + 1) {
            // 下碱（砖砌下碱）
            a.set(x, y, wz1, baseC);
          } else if (y === yTop) {
            // 额下木枋
            a.set(x, y, wz1, frameC);
          } else {
            if (isDoorBay) {
              // 明间双扇板门：内凹 1 格
              const doorHalf = Math.min(3, (bx1 - bx0) >> 1);
              const mc = (bx0 + bx1) >> 1;
              if (Math.abs(x - mc) <= doorHalf) {
                // 门洞留空，门扇退到内部 wz1 - 1
                a.set(x, y, wz1 - 1, doorDark);
                // 门楣
                if (y === yTop - 1) a.set(x, y, wz1, frameC);
                continue;
              }
              a.set(x, y, wz1, wallC);
            } else {
              // 次间直棂窗：窗洞留出，内退 1 格为暗面，外层每隔 1 格排一根直棂
              const winMargin = 1;
              if (x >= bx0 + winMargin && x <= bx1 - winMargin && y >= y0 + 2 && y <= yTop - 1) {
                // 窗内暗影背板
                a.set(x, y, wz1 - 1, doorDark);
                // 窗台与窗楣
                if (y === y0 + 2 || y === yTop - 1) {
                  a.set(x, y, wz1, frameC);
                } else {
                  // 直棂条：奇数排木棂，偶数留空
                  if ((x - bx0) % 2 === 1) {
                    a.set(x, y, wz1, mullC);
                  }
                }
                continue;
              }
              a.set(x, y, wz1, wallC);
            }
          }
        }
      }

      // 北面墙身（后檐面，开小直棂窗）
      for (let x = bx0; x <= bx1; x++) {
        for (let y = y0; y <= yTop; y++) {
          if (y <= y0 + 1) {
            a.set(x, y, wz0, baseC);
          } else if (y === yTop) {
            a.set(x, y, wz0, frameC);
          } else {
            const mc = (bx0 + bx1) >> 1;
            if (Math.abs(x - mc) <= 1 && y >= y0 + 3 && y <= yTop - 2) {
              a.set(x, y, wz0 + 1, doorDark); // 后面暗影
              if ((x - bx0) % 2 === 1) a.set(x, y, wz0, mullC);
              continue;
            }
            a.set(x, y, wz0, wallC);
          }
        }
      }
    }

    // 东西两山墙（山花墙封闭，下碱砖 + 上部粉墙）
    for (const wx of [wx0, wx1]) {
      for (let z = wz0; z <= wz1; z++) {
        for (let y = y0; y <= yTop; y++) {
          if (y <= y0 + 1) a.set(wx, y, z, baseC);
          else if (y === yTop) a.set(wx, y, z, frameC);
          else a.set(wx, y, z, wallC);
        }
      }
    }
  },

  // ⑤ 唐代鸱尾（Ancient Chiwei / Fish-Tail Finial）
  // 严格依循唐代出土鸱尾：底座平稳骑脊、背部出鳍、顶端向前内卷如月牙，刚劲雄厚，绝无突兀兔耳！
  chiwei(a, cx, cy, cz, dirX, h, cRidge, cFinial) {
    h = Math.max(3, Math.min(7, h || 4));
    // 底座骑于正脊之上
    a.set(cx, cy, cz, cRidge);
    a.set(cx + dirX, cy, cz, cRidge);

    // 鸱身逐层向内弯卷
    // 层 1：主体微向外扩
    a.set(cx, cy + 1, cz, cFinial);
    a.set(cx + dirX, cy + 1, cz, cFinial);
    a.set(cx + dirX * 2, cy + 1, cz, cRidge); // 鳍部起始

    // 层 2：背部鳍刃凸出
    a.set(cx, cy + 2, cz, cFinial);
    a.set(cx + dirX, cy + 2, cz, cFinial);
    a.set(cx + dirX * 2, cy + 2, cz, cFinial);

    // 层 3：向上并向内微卷
    if (h >= 3) {
      a.set(cx, cy + 3, cz, cFinial);
      a.set(cx + dirX, cy + 3, cz, cFinial);
    }
    // 层 4：顶端内卷勾尖（向内缩进，形成月牙尖角）
    if (h >= 4) {
      a.set(cx - dirX, cy + 4, cz, cFinial); // 内勾卷尖！
      a.set(cx, cy + 4, cz, cFinial);
    }
    if (h >= 5) {
      a.set(cx - dirX, cy + 5, cz, cFinial);
    }
  },

  // ⑥ 屋面（轻薄、连贯的双坡/四阿屋面；短轴统一处理，厢房不再沿错误轴收山）
  // 同时记录屋面构件到 a.roofs 供审计与 LOD 使用（原 g09 包装职责已并入本方法）。
  roofTang(a, x0, z0, x1, z1, y0, o) {
    o = o || {};
    a.roofs = a.roofs || [];
    a.roofs.push({ x0, z0, x1, z1, y: y0, kind: o.kind || 'hip' });
    const over = o.overhang ?? 4, ex0 = x0 - over, ex1 = x1 + over, ez0 = z0 - over, ez1 = z1 + over;
    const along = x1 - x0 >= z1 - z0, len = along ? ex1 - ex0 : ez1 - ez0, dep = along ? ez1 - ez0 : ex1 - ex0;
    const half = dep / 2, kind = o.kind || 'hip', main = o.main || PAL.roofGrey;
    const rise = Math.max(2, Math.min(o.layers || 99, Math.round(half * .48)));
    const ridge = o.ridgeC || PAL.roofDark;
    const toXZ = (u, v) => along ? [ex0 + u, ez0 + v] : [ex0 + v, ez0 + u];
    const hAt = (u, v) => {
      let t = Math.max(0, 1 - Math.abs(v - half) / Math.max(1, half));
      const end = Math.min(u, len - u) / Math.max(1, half);
      if (kind === 'hip') t = Math.min(t, end);
      if (kind === 'xie' && end < .65) t = Math.min(t, end);
      if (kind === 'jian') t = Math.min(t, Math.min(u, len - u) / (len / 2));
      return Math.round(rise * Math.pow(Math.max(0, t), 1.32));
    };
    for (let u = 0; u <= len; u++) for (let v = 0; v <= dep; v++) {
      const [x, z] = toXZ(u, v), h = hAt(u, v);
      // 每列仅保留坡壳与台阶连接，消除旧实心层叠内表面。
      const lower = Math.min(h, hAt(Math.max(0, u - 1), v), hAt(Math.min(len, u + 1), v), hAt(u, Math.max(0, v - 1)), hAt(u, Math.min(dep, v + 1)));
      for (let y = y0 + lower; y <= y0 + h; y++) a.set(x, y, z, main);
      if ((v === 0 || v === dep) && u % 4 === 0) a.set(x, y0 - 1, z, PAL.timber);
      if ((kind === 'gable' || kind === 'xie') && (u === 0 || u === len)) {
        for (let y = y0; y < y0 + h; y++) a.set(x, y, z, PAL.plasterWarm);
      }
    }
    // 屋面和梁架相接的檐下封板，薄于旧整圈深色大梁。
    for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) {
      const h = hAt(along ? x - ex0 : z - ez0, along ? z - ez0 : x - ex0);
      for (let y = y0 - 1; y <= y0 + h; y++) a.set(x, y, z, PAL.timber);
    }
    for (let z = z0; z <= z1; z++) for (const x of [x0, x1]) {
      const h = hAt(along ? x - ex0 : z - ez0, along ? z - ez0 : x - ex0);
      for (let y = y0 - 1; y <= y0 + h; y++) a.set(x, y, z, PAL.timber);
    }
    const end = kind === 'gable' ? 0 : Math.min(Math.floor(len / 2), Math.round(half * (kind === 'xie' ? .65 : 1)));
    for (let u = end; u <= len - end; u++) { const [x, z] = toXZ(u, Math.floor(half)); a.set(x, y0 + rise + 1, z, ridge); }
    // 普通房屋只有低矮脊端；殿堂饰件最多半个城市格。
    const fin = (o.finialH || 0) >= 5 ? 2 : 0;
    for (const u of [end, len - end]) { const [x, z] = toXZ(u, Math.floor(half)); for (let h = 1; h <= fin; h++) a.set(x, y0 + rise + 1 + h, z, ridge); }
    return y0 + rise + 2 + fin;
  },

  // ⑦ 院墙与坊墙内宅垣（夯土墙身 + 青瓦压顶 + 院门楼）
  enclosure(a, x0, z0, x1, z1, base, facing, opts) {
    opts = opts || {};
    const wallH = opts.wallH || 8; // 约 2 米高实适院墙
    const capY = base + wallH;
    const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
    const gateW = opts.gateW || 4; // 院门半宽

    let gx = cx, gz = z1, gAxis = 'NS';
    if (facing === 'N') { gx = cx; gz = z0; gAxis = 'NS'; }
    else if (facing === 'E') { gx = x1; gz = cz; gAxis = 'EW'; }
    else if (facing === 'W') { gx = x0; gz = cz; gAxis = 'EW'; }

    const isGate = (x, z) => {
      return gAxis === 'NS'
        ? (z === gz && Math.abs(x - gx) <= gateW)
        : (x === gx && Math.abs(z - gz) <= gateW);
    };

    // 夯土围墙墙身 + 顶部青瓦披檐
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
        if (isGate(x, z)) continue;

        // 墙基
        a.set(x, base + 1, z, PAL.rammedDark);
        // 墙身
        for (let y = base + 2; y < capY; y++) {
          a.set(x, y, z, PAL.rammed);
        }
        // 墙帽青瓦（挑出 1 格防雨）
        a.set(x, capY, z, PAL.roofDark);
        const ox = x === x0 ? -1 : (x === x1 ? 1 : 0);
        const oz = z === z0 ? -1 : (z === z1 ? 1 : 0);
        if (ox) a.set(x + ox, capY, z, PAL.roofGrey);
        if (oz) a.set(x, capY, z + oz, PAL.roofGrey);
      }
    }

    // 院门门屋（乌头门或垂花院门门楼）
    const posts = gAxis === 'NS'
      ? [[gx - gateW - 1, gz], [gx + gateW + 1, gz]]
      : [[gx, gz - gateW - 1], [gx, gz + gateW + 1]];

    for (const [px, pz] of posts) {
      for (let y = base + 1; y <= capY + 3; y++) {
        a.set(px, y, pz, PAL.zhu);
      }
    }
    // 门楣
    if (gAxis === 'NS') {
      for (let x = gx - gateW; x <= gx + gateW; x++) {
        a.set(x, capY + 2, gz, PAL.zhu);
        a.set(x, capY + 3, gz, PAL.roofDark); // 门额顶瓦
        a.set(x, capY + 3, gz - 1, PAL.roofGrey);
        a.set(x, capY + 3, gz + 1, PAL.roofGrey);
      }
      // 板门扇（左右各留 1 格门斗）
      for (let x = gx - gateW + 1; x <= gx + gateW - 1; x++) {
        for (let y = base + 1; y <= capY + 1; y++) {
          a.set(x, y, gz, PAL.doorDark);
        }
      }
    } else {
      for (let z = gz - gateW; z <= gz + gateW; z++) {
        a.set(gx, capY + 2, z, PAL.zhu);
        a.set(gx, capY + 3, z, PAL.roofDark);
        a.set(gx - 1, capY + 3, z, PAL.roofGrey);
        a.set(gx + 1, capY + 3, z, PAL.roofGrey);
      }
      for (let z = gz - gateW + 1; z <= gz + gateW - 1; z++) {
        for (let y = base + 1; y <= capY + 1; y++) {
          a.set(gx, y, z, PAL.doorDark);
        }
      }
    }

    // 院门真实开口：连接院门至院心，留开门扇；开口参与碰撞（原 g09 后置开门已并入）。
    for (let t = -gateW + 1; t < gateW; t++) {
      for (let y = base + 1; y <= capY + 1; y++) {
        a.del(gx + (gAxis === 'NS' ? t : 0), y, gz + (gAxis === 'EW' ? t : 0));
      }
    }

    return { gx, gz, gAxis, capY };
  },

  // ⑧ 附属厅房与通廊：服务于庭院的平面关系，不用独立装饰冒充建筑。
  // （原 g09_refine.js 新增构件，现并为本层标准实现。）
  smallHall(a, x0, z0, x1, z1, base, { open = false, height = 9, main = PAL.roofGrey } = {}) {
    if (x1 - x0 < 7 || z1 - z0 < 7) return;
    const y = ARCH.platform(a, x0 - 1, z0 - 1, x1 + 1, z1 + 1, base, 2, { steps: !open });
    const f = ARCH.colonnade(a, x0, z0, x1, z1, y, height, 3, PAL.timber, 1);
    if (!open) ARCH.wallWithOpenings(a, x0, z0, x1, z1, y, height, f.xs, { frameC: PAL.timber, wallC: PAL.plasterWarm });
    ARCH.roofTang(a, x0, z0, x1, z1, y + height, { kind: 'gable', main, overhang: 2, finialH: 0 });
  },

  // ⑨ 亭阁（多层楼阁通用：砖铺平坐 + 柱网 + 墙身 + 庑殿屋面）
  // （原 g09_refine.js 新增构件，现并为本层标准实现。）
  pavilion(a, x0, z0, x1, z1, base, bays = 7, floors = 1) {
    let y = base * 4, ax = x0 * 4, az = z0 * 4, bx = (x1 + 1) * 4 - 1, bz = (z1 + 1) * 4 - 1;
    for (let floor = 0; floor < floors; floor++) {
      a.slab(ax, y, az, bx, bz, PAL.brickPave); y++;
      const h = floor ? 12 : 15, f = ARCH.colonnade(a, ax + 1, az + 1, bx - 1, bz - 1, y, h, bays, PAL.zhu, 2);
      ARCH.wallWithOpenings(a, ax + 1, az + 1, bx - 1, bz - 1, y, h, f.xs, { frameC: PAL.zhu, wallC: PAL.plasterWarm });
      y += h;
      if (floor < floors - 1) {
        for (let x = ax - 4; x <= bx + 4; x++) for (let z = az - 4; z <= bz + 4; z++) a.set(x, y, z, PAL.roofSlate);
        ax += 4; bx -= 4; az += 1; bz -= 1; y++;
      }
    }
    return ARCH.roofTang(a, ax, az, bx, bz, y, { kind: 'hip', main: PAL.roofSlate, overhang: 5, finialH: 5 }) / 4;
  },
};
CHANGAN.ARCH = ARCH;

// ---------------------------------------------------------------- 建筑层索引 / 网格化 / 审计接口
// （原 g09_refine.js 的全部 CHANGAN 级实现，现并为本文件标准实现；patch 层取消。）
const archDecode = k => { const y = k % 512, t = (k - y) / 512, z = t % 16384; return [(t - z) / 16384 - 8192, y, z - 8192]; };
const archChunkKey = (x, z, s = 4) => Math.floor(x / (64 * s)) + ',' + Math.floor(z / (64 * s));

CHANGAN.indexArch = function (a, scale = 4) {
  const groups = new Map();
  for (const k of a.map.keys()) { const [x, y, z] = archDecode(k), id = archChunkKey(x, z, scale); if (!groups.has(id)) groups.set(id, new Set()); groups.get(id).add(k); }
  return groups;
};

// 按面方向/平面做贪心矩形合并，邻块仍查完整权威库，边界不重面。
CHANGAN.meshArchPart = function (ctx, a, keys, scale = 4) {
  const OFF = [8388608, -8388608, 1, -1, 512, -512];
  const C = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]];
  const shade = [.96, .91, 1, .82, .97, .9], pos = [], nor = [], col = [], idx = [];
  for (let f = 0; f < 6; f++) {
    const planes = new Map();
    for (const k of keys) { if (a.map.has(k + OFF[f])) continue; const [x, y, z] = archDecode(k), p = f < 2 ? x : f < 4 ? y : z, u = f < 2 ? z : x, v = f < 2 ? y : f < 4 ? z : y;
      if (!planes.has(p)) planes.set(p, new Map()); planes.get(p).set((v + 8192) * 16384 + u + 8192, a.map.get(k)); }
    for (const [p, cells] of planes) {
      for (const k of [...cells.keys()].sort((a, b) => a - b)) {
        const c = cells.get(k); if (!c) continue;
        let w = 1, h = 1; while (cells.get(k + w) === c) w++;
        outer: while (true) { for (let u = 0; u < w; u++) if (cells.get(k + h * 16384 + u) !== c) break outer; h++; }
        for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) cells.delete(k + v * 16384 + u);
        const u = k % 16384 - 8192, v = Math.floor(k / 16384) - 8192;
        const base = f < 2 ? [p, v, u] : f < 4 ? [u, p, v] : [u, v, p], dims = f < 2 ? [1, h, w] : f < 4 ? [w, 1, h] : [w, h, 1];
        const b = pos.length / 3, rgb = ctx.palRGB[c - 1];
        for (const q of C[f]) { for (let d = 0; d < 3; d++) pos.push((base[d] + q[d] * dims[d]) / scale); nor.push(f); col.push(...rgb.map(n => Math.round(n * shade[f]))); }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
  }
  return { pos: new Float32Array(pos), nor: new Uint8Array(nor), col: new Uint8Array(col), idx: new Uint32Array(idx), quads: idx.length / 6 };
};

CHANGAN.meshArchChunks = function (ctx, dirty) {
  const a = ctx.arch;
  if (!ctx.archIndex) {
    ctx.archIndex = CHANGAN.indexArch(a); ctx.archCoarse = new CHANGAN.ArchStore();
    for (const [k, c] of a.map) { const [x, y, z] = archDecode(k); ctx.archCoarse.set(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), c); }
    ctx.archLowIndex = CHANGAN.indexArch(ctx.archCoarse, 2);
  }
  const groups = ctx.archIndex, coarse = ctx.archCoarse;
  // 远景由同一体素库降采样；保留所有建筑和塔的轮廓，不独立生成第二座城。
  const lowGroups = ctx.archLowIndex, ids = dirty || [...groups.keys()];
  return ids.map(id => ({ id, full: CHANGAN.meshArchPart(ctx, a, groups.get(id) || [], 4), lod: CHANGAN.meshArchPart(ctx, coarse, lowGroups.get(id) || [], 2) }));
};

CHANGAN.updateArchIndex = function (ctx, op) {
  if (!ctx.archIndex) return;
  const a = ctx.arch, id = archChunkKey(op.x, op.z), k = a._k(op.x, op.y, op.z);
  if (!ctx.archIndex.has(id)) ctx.archIndex.set(id, new Set());
  if (op.c) ctx.archIndex.get(id).add(k); else ctx.archIndex.get(id).delete(k);
  const x = Math.floor(op.x / 2), y = Math.floor(op.y / 2), z = Math.floor(op.z / 2); let color = 0;
  for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) color = a.get(x * 2 + dx, y * 2 + dy, z * 2 + dz) || color;
  const lo = ctx.archCoarse, lk = lo._k(x, y, z);
  if (!ctx.archLowIndex.has(id)) ctx.archLowIndex.set(id, new Set());
  if (color) { lo.set(x, y, z, color); ctx.archLowIndex.get(id).add(lk); } else { lo.del(x, y, z); ctx.archLowIndex.get(id).delete(lk); }
};

CHANGAN.archChecksum = function (a) { let h = 2166136261; for (const [k, c] of a.map) { h = Math.imul(h ^ (k >>> 0), 16777619); h = Math.imul(h ^ Math.floor(k / 4294967296) ^ c, 16777619); } return (h >>> 0).toString(16); };

// 清理浮空建筑体素：P1 mesh 化后，残留 ArchStore 可能出现极小孤立构件。
// 删除未支承连通分量，避免 fatal；返回删除格数。
CHANGAN.purgeFloatingArch = function (ctx, a) {
  const rest = new Set(a.map.keys()), OFF = [8388608, -8388608, 1, -1, 512, -512];
  let removed = 0;
  while (rest.size) {
    const first = rest.values().next().value, queue = [first]; rest.delete(first); let supported = false;
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head], [x, y, z] = archDecode(k);
      if (!supported) {
        const wx = Math.floor(x / 4), wz = Math.floor(z / 4);
        if (ctx.store.get(wx, Math.floor(y / 4), wz) || ctx.store.get(wx, Math.floor((y - 1) / 4), wz)) supported = true;
      }
      for (const off of OFF) if (rest.delete(k + off)) queue.push(k + off);
    }
    if (!supported) {
      for (const k of queue) { a.map.delete(k); removed++; }
    }
  }
  return removed;
};

// 真正检查所有建筑连通分量是否与城市实体相接。构件可以悬挑，但必须结构相连。
CHANGAN.auditArchFloating = function (ctx, a) {
  const rest = new Set(a.map.keys()), OFF = [8388608, -8388608, 1, -1, 512, -512];
  let floating = 0, components = 0; const samples = [];
  while (rest.size) {
    const first = rest.values().next().value, queue = [first]; rest.delete(first); let supported = false;
    for (let head = 0; head < queue.length; head++) {
      const k = queue[head], [x, y, z] = archDecode(k);
      if (!supported) { const wx = Math.floor(x / 4), wz = Math.floor(z / 4); if (ctx.store.get(wx, Math.floor(y / 4), wz) || ctx.store.get(wx, Math.floor((y - 1) / 4), wz)) supported = true; }
      for (const off of OFF) if (rest.delete(k + off)) queue.push(k + off);
    }
    components++; if (!supported) { floating += queue.length; if (samples.length < 5) samples.push(archDecode(first)); }
  }
  return { pass: floating === 0, detail: `${components} 个连通构件，未支承 ${floating} 格；${JSON.stringify(samples)}` };
};

// 按临街方向转动完整院落（包括门、踏道、房屋和细节）。旧版只转门牌。
CHANGAN.orientedArch = function (a, x0, z0, w, d, facing) {
  const proxy = Object.create(a), ax = x0 * 4, az = z0 * 4, W = w * 4, D = d * 4;
  const point = (x, z) => facing === 'N' ? [ax + W - 1 - (x - ax), az + D - 1 - (z - az)] : facing === 'E' ? [ax + z - az, az + D - 1 - (x - ax)] : facing === 'W' ? [ax + W - 1 - (z - az), az + x - ax] : [x, z];
  proxy.set = (x, y, z, c) => { const p = point(x, z); a.set(p[0], y, p[1], c); };
  proxy.get = (x, y, z) => { const p = point(x, z); return a.get(p[0], y, p[1]); };
  proxy.del = (x, y, z) => { const p = point(x, z); a.del(p[0], y, p[1]); };
  proxy.roofs = a.roofs || (a.roofs = []); return proxy;
};

// ---------------------------------------------------------------- 坊内合院生成器（buildArchCompound）
// E1~E3 居住亚型：正房（主堂）、东西厢房、院落回廊、门屋、庭院砖石漫道
// 按临街方向整体转动（门、踏道、房屋与细节一体旋转；朝向代理见 orientedArch，原 g09 包装已并入）。
CHANGAN.buildArchCompound = function (ctx, x0, z0, w, d, base, level, rng, facing, plan) {
  facing = facing || 'S'; plan = plan || {};
  ctx.archLog = ctx.archLog || [];
  const a = CHANGAN.orientedArch(ctx.arch, x0, z0, w, d, facing);
  const side = facing === 'E' || facing === 'W';
  const cw = side ? d : w, cd = side ? w : d;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;

  // 坐标折算至 4× 建筑体素空间（朝向代理内恒按南向布局）
  const S = ARCH_S;
  const ax0 = x0 * S, az0 = z0 * S;
  const ax1 = (x0 + cw) * S - 1, az1 = (z0 + cd) * S - 1;
  const ab = base * S;

  let topY;
  if (ax1 - ax0 >= 16 && az1 - az0 >= 16) {

    const li = Math.max(0, Math.min(2, level || 0));

    // 坊内色彩谱系（以青灰、黛灰为主，大宅配琉璃绿剪边）
    const ROOF_TONES = [
      [PAL.roofGrey, PAL.roofLight, PAL.roofGroove],
      [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG],
      [PAL.roofClay, PAL.roofClayL, PAL.roofClayG],
      [PAL.roofBrown, PAL.roofBrownL, PAL.roofBrownG],
    ];
    const toneIdx = plan?.style ? plan.style.tone % 2 : Math.abs(Math.floor(x0 / 60) + Math.floor(z0 / 45)) % 2;
    const tone = ROOF_TONES[toneIdx];
    const trimC = null; // 大宅琉璃剪边

    // 1. 院墙与院门
    const enc = ARCH.enclosure(a, ax0, az0, ax1, az1, ab, 'S', {
      wallH: 7 + li,
      gateW: 3 + li,
    });

    // 2. 正堂（坐北朝南，占北侧 45%~50% 进深）
    const courtMargin = 7;
    const hx0 = ax0 + courtMargin, hx1 = ax1 - courtMargin - (plan?.sideCourt && ax1 - ax0 > 60 ? 5 : 0);
    const hz0 = az0 + courtMargin;
    const mainDepth = Math.max(12, Math.min(26, Math.round((az1 - az0) * (plan?.family === 'dense' ? .40 : plan?.family === 'estate' ? .30 : .34))));
    const hz1 = hz0 + mainDepth;

    topY = enc.capY;

    if (hx1 - hx0 >= 16 && hz1 - hz0 >= 10) {
      const W = hx1 - hx0;
      // 开间数：根据面宽自适应 3 间或 5 间
      const bays = (W >= 36) ? 5 : 3;
      const wallH = 10 + li * 2 + (plan?.family === 'official' ? 2 : 0); // 2.5m~3.5m 真实净高
      const colR = li >= 2 ? 2 : 1;
      const colC = (li >= 2) ? PAL.zhu : (li === 1 ? PAL.zhuDeep : PAL.timber);

      // ① 石阶台基（露出 1~2 格高，南向踏道）
      const platH = 2 + li;
      const py = ARCH.platform(a, hx0 - 2, hz0 - 2, hx1 + 2, hz1 + 2, ab, platH, {
        bodyC: PAL.stoneGrey,
        edgeC: PAL.stoneWhite,
        stepHalf: Math.max(3, W >> 3),
      });

      // ② 檐柱列与阑额
      const colRes = ARCH.colonnade(a, hx0, hz0, hx1, hz1, py, wallH, bays, colC, colR);

      // ③ 墙体与直棂门窗（墙体内退 1 格，明间设双扇板门，次间设木棂窗）
      ARCH.wallWithOpenings(a, hx0, hz0, hx1, hz1, py, wallH, colRes.xs, {
        wallC: (rng() < 0.4) ? PAL.plasterWarm : PAL.plaster,
        baseC: PAL.brickPave,
        frameC: colC,
        doorDark: PAL.doorDark,
        mullC: PAL.timber,
        hasDoor: true,
      });

      // ④ 斗拱层（承托撩檐枋，出挑严格内缩于檐下）
      const dgY = py + wallH;
      ARCH.dougongSystem(a, colRes.cols, dgY, colC, PAL.plaster, 2);

      // ⑤ 屋顶：P1 连续举折网格（南向先切换；其余朝向仍走 roofTang，待 P2 统一旋转）
      const useHip = (li >= 2) || (li === 1 && rng() < 0.5);
      const roofY = dgY + 2;
      const overhangCells = 5 + li;
      let meshRoofDone = false;
      if (facing === 'S' && CHANGAN.buildRoofMesh) {
        const cx0 = (hx0 - overhangCells) / S, cz0 = (hz0 - overhangCells) / S;
        const cx1 = (hx1 + 1 + overhangCells) / S, cz1 = (hz1 + 1 + overhangCells) / S;
        const cy = roofY / S;
        const meshRgb = CHANGAN.pickRoofRGB(li >= 2 ? 3 : li, rng, useHip ? 'hip' : 'gable');
        const mb = new CHANGAN.MeshBuf();
        const half = Math.max(cx1 - cx0, cz1 - cz0) * 0.5;
        const rise = half * (0.38 + rng() * 0.08);
        CHANGAN.buildRoofMesh(mb, {
          x0: cx0, z0: cz0, x1: cx1, z1: cz1,
          yEave: cy, yRidge: cy + rise,
          kind: useHip ? 'hip' : 'gable',
          rgb: meshRgb,
          curve: 1.5 + rng() * 0.2,
          upturn: 0.22 + rng() * 0.2,
          ridgeAlongX: (cx1 - cx0) >= (cz1 - cz0),
        });
        if (!mb.empty) {
          ctx.meshParts = ctx.meshParts || [];
          ctx.meshParts.push(mb.toArray());
          ctx.counters.meshHalls = (ctx.counters.meshHalls || 0) + 1;
          meshRoofDone = true;
          a.slab(hx0 + 2, roofY, hz0 + 2, hx1 - 2, hz1 - 2, PAL.roofDark);
          topY = roofY + Math.ceil(rise * S);
        }
      }
      if (!meshRoofDone) {
        topY = ARCH.roofTang(a, hx0, hz0, hx1, hz1, roofY, {
          kind: useHip ? 'hip' : 'gable',
          main: tone[0],
          groove: tone[2],
          lip: tone[1],
          trim: trimC,
          ridgeC: PAL.roofDark,
          overhang: overhangCells,
          layers: 8 + li * 2,
          finialH: 3 + li,
        });
      }
    }

    // 3. 东西厢房（围合式院落）
    const wingDepth = az1 - hz1 - 8;
    if (wingDepth >= 14 && rng() < 0.85) {
      const wz0 = hz1 + 7, wz1 = az1 - 7;
      const wingW = Math.max(7, Math.min(12, Math.round((ax1 - ax0) * 0.22)));
      const wingH = 8 + (li > 0 ? 1 : 0);
      const buildWing = (side) => {
        const wx0 = (side === 'W') ? ax0 + 5 : ax1 - 5 - wingW;
        const wx1 = wx0 + wingW;
        // 厢房台基
        const wy = ARCH.platform(a, wx0 - 1, wz0 - 1, wx1 + 1, wz1 + 1, ab, 1, { steps: false });
        // 厢房柱与墙
        const wCol = ARCH.colonnade(a, wx0, wz0, wx1, wz1, wy, wingH, 2, PAL.timber, 1);
        ARCH.wallWithOpenings(a, wx0, wz0, wx1, wz1, wy, wingH, wCol.xs, {
          wallC: PAL.plaster,
          baseC: PAL.brickPave,
          frameC: PAL.timber,
          hasDoor: false,
        });
        // 厢房屋面：P1 南向 mesh，其余回退 roofTang
        if (facing === 'S' && CHANGAN.buildRoofMesh) {
          const wcy = (wy + wingH + 1) / S;
          const wx0c = (wx0 - 3) / S, wz0c = (wz0 - 3) / S;
          const wx1c = (wx1 + 1 + 3) / S, wz1c = (wz1 + 1 + 3) / S;
          const wrise = Math.max(wx1c - wx0c, wz1c - wz0c) * 0.5 * 0.4;
          const wmb = new CHANGAN.MeshBuf();
          CHANGAN.buildRoofMesh(wmb, {
            x0: wx0c, z0: wz0c, x1: wx1c, z1: wz1c,
            yEave: wcy, yRidge: wcy + wrise,
            kind: 'gable',
            rgb: CHANGAN.pickRoofRGB(li, rng, 'gable'),
            ridgeAlongX: (wx1c - wx0c) >= (wz1c - wz0c),
          });
          if (!wmb.empty) {
            ctx.meshParts = ctx.meshParts || [];
            ctx.meshParts.push(wmb.toArray());
            a.slab(wx0 + 1, wy + wingH + 1, wz0 + 1, wx1 - 1, wz1 - 1, PAL.roofDark);
          }
        } else {
          ARCH.roofTang(a, wx0, wz0, wx1, wz1, wy + wingH + 1, {
            kind: 'gable',
            main: tone[0],
            groove: tone[2],
            lip: tone[1],
            overhang: 3,
            layers: 5,
            lift: false,
          });
        }
      };

      const hasBoth = (li >= 1 && rng() < 0.75);
      if (hasBoth) {
        buildWing('W');
        buildWing('E');
      } else {
        buildWing(rng() < 0.5 ? 'W' : 'E');
      }
    }

    // 4. 庭院漫步道（城市层 ground 已有底色，建筑层在中央铺出整齐青石踏道通往院门）
    const midX = (ax0 + ax1) >> 1;
    const pathHalf = 2; // 宽 4 格 = 1 城市格 = 1.2m
    for (let x = midX - pathHalf; x <= midX + pathHalf; x++) {
      for (let z = hz1 + 2; z <= az1 - 1; z++) {
        a.set(x, ab + 1, z, PAL.brickPave);
      }
    }

    // 记录宏观占位与日志
    const topCity = Math.ceil(topY * INV_S);
    ctx.archLog.push({ x: x0, z: z0, w: cw, d: cd, top: topCity, lvl: level });
    for (let x = x0; x < x0 + cw; x++) {
      for (let z = z0; z < z0 + cd; z++) {
        const i = CHANGAN.fieldIndex(x, z);
        if (i >= 0) {
          ctx.fields.topH[i] = topCity;
          ctx.fields.topColor[i] = tone[0];
        }
      }
    }
  }

  // 门内的转折步道与生活节点，保持中央路线净空（原 g09 后置补充，已并入；即使主体未生成也照常执行）。
  {
    const ax = x0 * 4, az = z0 * 4, W = cw * 4, D = cd * 4, y = base * 4;
    const cx = ax + Math.floor(W / 2), cz = az + D - 11;
    for (let xx = ax + 7; xx <= cx; xx++) for (let zz = cz - 1; zz <= cz + 1; zz++) a.set(xx, y + 1, zz, PAL.brickPave);
    if (W >= 38 && D >= 38) {
      const bx = ax + 8, bz = az + D - 10;
      if (plan.well) {
        a.fill(bx - 2, y, bz - 2, bx + 2, y + 2, bz + 2, PAL.stoneGrey);
        a.set(bx, y + 2, bz, PAL.doorDark);
        a.fill(bx - 3, y + 1, bz, bx - 3, y + 7, bz, PAL.timber); a.fill(bx + 3, y + 1, bz, bx + 3, y + 7, bz, PAL.timber);
        a.fill(bx - 3, y + 7, bz, bx + 3, y + 7, bz, PAL.timber);
      } else {
        a.fill(bx - 2, y + 1, bz, bx - 2, y + 2, bz, PAL.timber); a.fill(bx + 2, y + 1, bz, bx + 2, y + 2, bz, PAL.timber);
        a.fill(bx - 2, y + 3, bz, bx + 2, y + 3, bz + 1, PAL.timber);
        a.fill(bx - 1, y + 1, bz + 4, bx + 1, y + 2, bz + 6, PAL.rammedDark);
      }
    }
  }

  return topY;
};

// ---------------------------------------------------------------- 皇城官署（buildArchOffice）
// 礼制官廨：宏大外垣、仪门、五/七间重檐大堂、东西回廊、正堂
CHANGAN.buildArchOffice = function (ctx, x0, z0, x1, z1, base, rng, facing, rank) {
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;

  const S = ARCH_S;
  const ax0 = x0 * S, az0 = z0 * S;
  const ax1 = (x1 + 1) * S - 1, az1 = (z1 + 1) * S - 1;
  const ab = base * S;
  const R = rank == null ? 3 : rank;

  // 品级色带：三品以上琉璃绿、四品以下琉璃蓝或青灰
  const roofC = R >= 4 ? PAL.roofSlate : PAL.roofGrey;
  const trimC = (R >= 4) ? PAL.gold : PAL.roofLight;

  // 外墙
  const enc = ARCH.enclosure(a, ax0, az0, ax1, az1, ab, facing || 'S', {
    wallH: 9,
    gateW: 6,
  });

  // 官署大堂（核心）
  const cx = (ax0 + ax1) >> 1;
  const hallW = Math.round((ax1 - ax0) * 0.3);
  const hallD = Math.round((az1 - az0) * 0.25);
  const hx0 = cx - hallW, hx1 = cx + hallW;
  const hz0 = az0 + Math.round((az1 - az0) * 0.35);
  const hz1 = hz0 + hallD;

  const bays = (R >= 4) ? 7 : 5;
  const wallH = 14;

  // 三层石阶大台基
  const py = ARCH.platform(a, hx0 - 4, hz0 - 4, hx1 + 4, hz1 + 4, ab, 4, {
    bodyC: PAL.stoneGrey,
    edgeC: PAL.stoneWhite,
    stepHalf: 6,
  });

  // 柱网与额枋（鲜明朱红柱）
  const colRes = ARCH.colonnade(a, hx0, hz0, hx1, hz1, py, wallH, bays, PAL.zhuBright, 2);

  // 墙体与门窗
  ARCH.wallWithOpenings(a, hx0, hz0, hx1, hz1, py, wallH, colRes.xs, {
    wallC: PAL.plasterWarm,
    baseC: PAL.brickPave,
    frameC: PAL.zhuBright,
    doorDark: PAL.doorDark,
    mullC: PAL.timber,
    hasDoor: true,
  });

  // 斗拱与重檐歇山顶
  const dgY = py + wallH;
  ARCH.dougongSystem(a, colRes.cols, dgY, PAL.zhuBright, PAL.stoneWhite, 3);

  const topY = ARCH.roofTang(a, hx0, hz0, hx1, hz1, dgY + 2, {
    kind: 'hip',
    main: roofC,
    groove: PAL.roofDark,
    lip: PAL.roofLight,
    trim: trimC,
    ridgeC: PAL.roofDark,
    overhang: 7,
    layers: 12,
    finialH: 5,
  });

  // 记录顶面
  const topCity = Math.ceil(topY * INV_S);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (i >= 0) {
        ctx.fields.topH[i] = topCity;
        ctx.fields.topColor[i] = roofC;
      }
    }
  }

  // 附属厅房与殿前甬道（原 g09 后置补充，已并入；大尺度署廨才配置侧翼）
  {
    const W = (x1 - x0 + 1) * 4, D = (z1 - z0 + 1) * 4, ax = x0 * 4, az = z0 * 4, y = base * 4;
    if (W >= 72 && D >= 80) {
      for (const x of [ax + 7, ax + W - 18]) ARCH.smallHall(a, x, az + Math.round(D * .62), x + 10, az + D - 12, y, { open: true, height: 8 });
      // 殿前甬道保持贯通，侧翼以低廊衬托主殿。
      const cx2 = ax + (W >> 1); for (let x = cx2 - 3; x <= cx2 + 3; x++) for (let z = az + Math.round(D * .6); z < az + D - 1; z++) a.set(x, y + 1, z, PAL.brickPave);
    }
  }

  return topY;
};

// ---------------------------------------------------------------- 市肆（buildArchShop）
// 东西两市临街铺面、通敞货栈、挑棚与酒旗
// 按临街方向整体转动（朝向代理 orientedArch；原 g09 包装与字段遮蔽回写已并入）。
CHANGAN.buildArchShop = function (ctx, x0, z0, w, d, base, trade, east, rng, facing) {
  facing = facing || 'S';
  const side = facing === 'E' || facing === 'W';
  const cw = side ? d : w, cd = side ? w : d;
  const a = CHANGAN.orientedArch(ctx.arch, x0, z0, w, d, facing);
  // 字段先落本地副本，主体完工后由本函数以统一口径回写（原 g09 的字段遮蔽行为）。
  const localFields = { ...ctx.fields, topH: {}, topColor: {} };
  const bx = { ...ctx, arch: a, fields: localFields };
  bx.counters.archBuildings = (bx.counters.archBuildings || 0) + 1;

  const S = ARCH_S;
  const ax0 = x0 * S, az0 = z0 * S;
  const ax1 = (x0 + cw) * S - 1, az1 = (z0 + cd) * S - 1;
  const ab = base * S;

  let topY;
  if (ax1 - ax0 >= 10 && az1 - az0 >= 10) {

    const tone = east
      ? [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG]
      : [PAL.roofClay, PAL.roofClayL, PAL.roofClayG];

    const py = ARCH.platform(a, ax0, az0, ax1, az1, ab, 1, { steps: false });
    const shopH = 9;
    const bays = Math.max(2, Math.min(4, Math.round((ax1 - ax0) / 12)));

    const colRes = ARCH.colonnade(a, ax0 + 1, az0 + 1, ax1 - 1, az1 - 1, py, shopH, bays, PAL.timber, 1);

    // 铺面前后开敞或设半矮柜台
    ARCH.wallWithOpenings(a, ax0 + 1, az0 + 1, ax1 - 1, az1 - 1, py, shopH, colRes.xs, {
      wallC: PAL.plasterWarm,
      baseC: PAL.brickPave,
      frameC: PAL.timber,
      hasDoor: true,
    });

    // 悬山或双坡屋面
    topY = ARCH.roofTang(a, ax0 + 1, az0 + 1, ax1 - 1, az1 - 1, py + shopH + 1, {
      kind: 'gable',
      main: tone[0],
      groove: tone[2],
      lip: tone[1],
      overhang: 2,
      layers: 6,
      lift: true,
    });

    // 临街挑幌（酒肆布幡与商幌；朝向代理内恒为南向，即 az1+1 一侧）
    const flagC = east ? PAL.flagBlue : PAL.flagRed;
    const fx = (ax0 + ax1) >> 1;
    const fz = az1 + 1;
    for (let y = py; y <= py + shopH; y++) {
      a.set(fx, y, fz, PAL.timberDark);
    }
    // 挑横木与垂布幡
    const poleTop = py + shopH;
    a.set(fx + 1, poleTop, fz, PAL.timberDark);
    a.set(fx + 2, poleTop, fz, PAL.timberDark);
    for (let y = poleTop - 1; y >= poleTop - 4; y--) {
      a.set(fx + 2, y, fz, flagC);
    }

    // 占位字段写入本地副本（不影响城市字段；统一回写在下方进行）
    const topCity = Math.ceil(topY * INV_S);
    for (let x = x0; x < x0 + cw; x++) {
      for (let z = z0; z < z0 + cd; z++) {
        const i = CHANGAN.fieldIndex(x, z);
        if (i >= 0) {
          bx.fields.topH[i] = topCity;
          bx.fields.topColor[i] = tone[0];
        }
      }
    }
    bx.counters.shops++;
  }

  // 以统一口径回写城市字段（原 g09 包装的回写逻辑；东西市各定主色）
  for (let xx = x0; xx < x0 + w; xx++) for (let zz = z0; zz < z0 + d; zz++) {
    const i = CHANGAN.fieldIndex(xx, zz);
    if (i >= 0 && topY) { ctx.fields.topH[i] = Math.ceil(topY / 4); ctx.fields.topColor[i] = east ? PAL.roofSlate : PAL.roofClay; }
  }

  // 营业面打开中央入口，檐下摊台分居两侧（原 g09 后置开口，已并入）
  const fx0 = x0 * 4 + 3, fx1 = (x0 + cw) * 4 - 4, fz1 = (z0 + cd) * 4 - 1, yb = base * 4;
  if (fx1 - fx0 >= 8) {
    const cx = Math.floor((fx0 + fx1) / 2);
    for (let xx = cx - 2; xx <= cx + 2; xx++) for (let yy = yb + 1; yy <= yb + 7; yy++) for (let zz = fz1 - 3; zz <= fz1; zz++) a.del(xx, yy, zz);
    for (const xx of [fx0, fx1 - 3]) {
      a.fill(xx, yb + 1, fz1 - 1, xx + 2, yb + 2, fz1, PAL.timber);
      a.fill(xx, yb + 3, fz1 - 1, xx + 2, yb + 3, fz1, east ? PAL.clothHu : PAL.rammedDark);
    }
  }
  return topY;
};

// ---------------------------------------------------------------- 寺观（buildArchTemple）
// 山门 + 钟鼓楼 + 重檐大雄宝殿 + 配殿
CHANGAN.buildArchTemple = function (ctx, x0, z0, x1, z1, base, opts) {
  opts = opts || {};
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;

  const S = ARCH_S;
  const ax0 = x0 * S, az0 = z0 * S;
  const ax1 = (x1 + 1) * S - 1, az1 = (z1 + 1) * S - 1;
  const ab = base * S;

  if (ax1 - ax0 < 32 || az1 - az0 < 32) return;

  const big = !!opts.big;
  const tone = big
    ? [PAL.glazeGreen, PAL.roofLight, PAL.roofDark]
    : [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG];
  const trimC = big ? PAL.gold : null;

  // 寺院山门围垣
  ARCH.enclosure(a, ax0, az0, ax1, az1, ab, 'S', { wallH: 8, gateW: 5 });

  const cx = (ax0 + ax1) >> 1;

  // 主大殿（大雄宝殿）
  const hw = Math.min(36, (ax1 - ax0) >> 2);
  const hd = Math.max(20, Math.min(32, (az1 - az0) >> 2));
  const hz0 = az0 + Math.round((az1 - az0) * 0.3);
  const hz1 = hz0 + hd;

  const py = ARCH.platform(a, cx - hw - 3, hz0 - 3, cx + hw + 3, hz1 + 3, ab, 4, {
    bodyC: PAL.stoneGrey,
    edgeC: PAL.stoneWhite,
    stepHalf: 6,
  });

  const wallH = 14;
  const colRes = ARCH.colonnade(a, cx - hw, hz0, cx + hw, hz1, py, wallH, big ? 7 : 5, PAL.zhuBright, 2);

  ARCH.wallWithOpenings(a, cx - hw, hz0, cx + hw, hz1, py, wallH, colRes.xs, {
    wallC: PAL.plasterWarm,
    baseC: PAL.brickPave,
    frameC: PAL.zhuBright,
    hasDoor: true,
  });

  const dgY = py + wallH;
  ARCH.dougongSystem(a, colRes.cols, dgY, PAL.zhuBright, PAL.stoneWhite, 3);

  const topY = ARCH.roofTang(a, cx - hw, hz0, cx + hw, hz1, dgY + 2, {
    kind: 'hip',
    main: tone[0],
    groove: tone[2],
    lip: tone[1],
    trim: trimC,
    ridgeC: PAL.roofDark,
    finial: trimC || PAL.roofDark,
    overhang: 7,
    layers: 12,
    finialH: 5,
  });

  const topCity = Math.ceil(topY * INV_S);
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (i >= 0) {
        ctx.fields.topH[i] = topCity;
        ctx.fields.topColor[i] = tone[0];
      }
    }
  }

  // 附属配殿与殿前甬道（原 g09 后置补充，已并入；大尺度寺观才配置侧翼）
  {
    const W = (x1 - x0 + 1) * 4, D = (z1 - z0 + 1) * 4, ax = x0 * 4, az = z0 * 4, y = base * 4;
    if (W >= 72 && D >= 80) {
      for (const x of [ax + 7, ax + W - 18]) ARCH.smallHall(a, x, az + Math.round(D * .62), x + 10, az + D - 12, y, { open: false, height: 10 });
      // 殿前甬道保持贯通，侧翼以低廊衬托主殿。
      const cx2 = ax + (W >> 1); for (let x = cx2 - 3; x <= cx2 + 3; x++) for (let z = az + Math.round(D * .6); z < az + D - 1; z++) a.set(x, y + 1, z, PAL.brickPave);
    }
  }

  ctx.counters.temples++;
  return topY;
};

// ---------------------------------------------------------------- 大明宫含元殿（buildArchGrandHall）
// 盛唐第一正殿：三层汉白玉高台基、飞檐如翼重檐庑殿顶、十一开间阔大柱网、双金鸱吻
CHANGAN.buildArchGrandHall = function (a, cx, cz, base, opts) {
  opts = opts || {};
  const S = ARCH_S;
  // cx, cz, base 已经是在建筑体素或由外部传入的基准点
  // 含元殿：十一开间大殿，面宽 96 建筑格（24 城市格 ≈ 330m），进深 56 建筑格（14 城市格 ≈ 190m）
  const W = opts.W || 96, D = opts.D || 56;
  const x0 = cx - (W >> 1), x1 = x0 + W - 1;
  const z0 = cz - (D >> 1), z1 = z0 + D - 1;

  // 1. 三层大石台基（白石玉座阶基）
  let y = ARCH.platform(a, x0 - 6, z0 - 6, x1 + 6, z1 + 6, base, 3, {
    bodyC: PAL.stoneGrey, edgeC: PAL.stoneWhite, stepHalf: 12,
  });
  y = ARCH.platform(a, x0 - 3, z0 - 3, x1 + 3, z1 + 3, y, 3, {
    bodyC: PAL.stoneGrey, edgeC: PAL.stoneWhite, stepHalf: 10,
  });
  y = ARCH.platform(a, x0, z0, x1, z1, y, 2, {
    bodyC: PAL.stoneWhite, edgeC: PAL.stoneWhite, stepHalf: 8,
  });

  // 2. 下层柱网与屋身（十一开间，柱径 2，高 16 格）
  const bodyH = 16;
  const fr = ARCH.colonnade(a, x0 + 2, z0 + 2, x1 - 2, z1 - 2, y, bodyH, 11, PAL.zhuBright, 2);

  ARCH.wallWithOpenings(a, x0 + 2, z0 + 2, x1 - 2, z1 - 2, y, bodyH, fr.xs, {
    wallC: PAL.plasterWarm,
    baseC: PAL.brickPave,
    frameC: PAL.zhuBright,
    doorDark: PAL.doorDark,
    mullC: PAL.timber,
    hasDoor: true,
  });

  // 3. 下檐斗拱与腰檐（琉璃剪边）
  const dgY1 = y + bodyH;
  ARCH.dougongSystem(a, fr.cols, dgY1, PAL.zhuBright, PAL.gold, 3);

  // 腰檐（出檐 8 格）
  const eaveY = dgY1 + 2;
  const eo = 8;
  for (let x = x0 - eo; x <= x1 + eo; x++) {
    for (let z = z0 - eo; z <= z1 + eo; z++) {
      const isEdge = (x === x0 - eo || x === x1 + eo || z === z0 - eo || z === z1 + eo);
      a.set(x, eaveY, z, isEdge ? PAL.gold : PAL.roofGreen);
      a.set(x, eaveY + 1, z, isEdge ? PAL.roofLight : PAL.roofGreenG);
    }
  }

  // 4. 上层重楼身（内收 6 格，高 10 格）
  const upH = 10;
  const ux0 = x0 + 8, ux1 = x1 - 8, uz0 = z0 + 8, uz1 = z1 - 8;
  const fr2 = ARCH.colonnade(a, ux0, uz0, ux1, uz1, eaveY + 2, upH, 9, PAL.zhuBright, 2);

  ARCH.wallWithOpenings(a, ux0, uz0, ux1, uz1, eaveY + 2, upH, fr2.xs, {
    wallC: PAL.plasterWarm,
    baseC: PAL.brickPave,
    frameC: PAL.zhuBright,
    hasDoor: false,
  });

  // 5. 上檐斗拱与宏伟庑殿顶（琉璃绿瓦 + 金剪边 + 金内卷鸱吻）
  const dgY2 = eaveY + 2 + upH;
  ARCH.dougongSystem(a, fr2.cols, dgY2, PAL.zhuBright, PAL.gold, 3);

  const topY = ARCH.roofTang(a, ux0, uz0, ux1, uz1, dgY2 + 2, {
    kind: 'hip',
    main: PAL.roofGreen,
    groove: PAL.roofGreenG,
    lip: PAL.roofGreenL,
    trim: PAL.gold,
    ridgeC: PAL.glazeGreen,
    finial: PAL.gold,
    overhang: 9,
    layers: 16,
    finialH: 6,
    ridgeRatio: 0.58,
  });

  return topY;
};

// 注：连通审计、贪心网格、分块与朝向代理接口均已并入本文件（原 g09_refine.js 补丁层已取消）。

// 院落土地微地形底面
CHANGAN.archCompoundGround = function (ctx, x0, z0, w, d, base) {
  const { store } = ctx;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (i < 0 || ctx.fields.road[i] || ctx.fields.water[i]) continue;
      // 自然微糙黄土庭院
      store.set(x, base, z, PAL.loessLight);
    }
  }
};
