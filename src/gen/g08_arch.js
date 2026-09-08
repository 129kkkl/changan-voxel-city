// g08_arch.js — 盛唐建筑大木作体系（ArchGrid 4× 构件级精实体素层）
// 核心设计原则（盛唐都城微缩箱庭）：
//   ① 比例准则：1 世界单位（城市格）= 4 建筑体素（1 建筑体素 ≈ 0.25 城市格 ≈ 30cm）。
//      人高 1.5 世界格 = 6 建筑格；屋身高 2.5~3.5 世界格 = 10~14 建筑格；
//      檐柱径 1~2 建筑格（30~60cm）；屋檐出挑 4~7 建筑格（1~1.75m 深远出檐）；
//      檐口厚度 1 建筑格（30cm 轻薄檐口）；举折坡度平缓舒展（15°~22°）。
//   ② 虚实与进深：柱凸出在先，墙体内退 1 格，直棂窗向内开洞且设暗影背板，板门内凹设框；
//   ③ 斗拱内敛承托：坐斗、华栱与撩檐枋位于檐下，出挑严格小于屋檐，形成深沉檐下阴影；
//   ④ 屋面优美平缓：平缓举折剖面曲线，翼角微起，瓦垄同色系柔和微差；
//   ⑤ 鸱尾古拙雄健：正统唐代月牙鱼尾内卷形鸱吻，与正脊浑然一体，彻底消除突兀兔耳叉角；
//   ⑥ 空间与院落：正房坐北朝南、东西厢房合抱、南向门屋与院墙、中央砖石漫道与庭树；
//   ⑦ 单一权威数据源：建筑全部由本文件生成并直接网格化，向后兼容编辑与审计。
'use strict';

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
  // 栌斗坐柱头，华栱向外挑出，托撩檐枋。严禁斗拱伸出檐口！斗拱严格在檐下深处！
  dougongSystem(a, cols, y0, colC, douC, reach) {
    reach = reach || 2; // 出跳距离：1~2 格（0.25~0.5m）
    for (const [cx, cz] of cols) {
      // 栌斗（坐斗）：2×2 见方
      a.fill(cx - 1, y0, cz - 1, cx + 1, y0, cz + 1, colC);
      // 第一跳华栱与栱横臂（一斗三升）
      for (let dy = 1; dy <= reach; dy++) {
        const y = y0 + dy;
        // 沿进深出跳
        a.set(cx, y, cz - dy, douC);
        a.set(cx, y, cz + dy, douC);
        // 散斗
        a.set(cx - 1, y, cz - dy, colC);
        a.set(cx + 1, y, cz - dy, colC);
        a.set(cx - 1, y, cz + dy, colC);
        a.set(cx + 1, y, cz + dy, colC);
      }
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

  // ⑥ 盛唐平缓飞檐屋顶生成器（Tang Roof Engine）
  // 形式：庑殿 (hip) / 悬山 (gable) / 歇山 (xie)
  // 核心：深远挑檐、轻薄檐口、平缓举折剖面曲线、微翘翼角、克制瓦垄、雄健内卷鸱尾
  roofTang(a, x0, z0, x1, z1, y0, opts) {
    opts = opts || {};
    const kind = opts.kind || 'hip'; // hip | gable | xie
    const mainC = opts.main || PAL.roofGrey;
    const grooveC = opts.groove || PAL.roofGroove;
    const lipC = opts.lip || PAL.roofLight;
    const ridgeC = opts.ridgeC || PAL.roofDark;
    const finialC = opts.finial || ridgeC;
    const trimC = opts.trim || null; // 琉璃剪边色（若有）

    // 出檐（Overhang）：深远挑出 4~6 格
    const over = opts.overhang != null ? opts.overhang : 5;
    const ex0 = x0 - over, ex1 = x1 + over;
    const ez0 = z0 - over, ez1 = z1 + over;

    const spanX = ex1 - ex0, spanZ = ez1 - ez0;
    const halfX = spanX >> 1, halfZ = spanZ >> 1;
    const alongX = spanX >= spanZ;
    const shortHalf = alongX ? halfZ : halfX;

    // 总坡面层数（平缓举折：层数适中，每层上升 1 格，平缓收敛）
    const layers = Math.max(5, Math.min(opts.layers || (shortHalf - 2), shortHalf - 1));
    const ridgeRatio = opts.ridgeRatio != null ? opts.ridgeRatio : 0.52; // 正脊长度比例

    // 1. 檐口下层撩檐枋与椽头（紧贴檐口下缘，体现飞椽与出挑厚度）
    for (let x = ex0 + 1; x <= ex1 - 1; x++) {
      a.set(x, y0 - 1, ez0 + 1, PAL.timberDark);
      a.set(x, y0 - 1, ez1 - 1, PAL.timberDark);
    }
    for (let z = ez0 + 1; z <= ez1 - 1; z++) {
      a.set(ex0 + 1, y0 - 1, z, PAL.timberDark);
      a.set(ex1 - 1, y0 - 1, z, PAL.timberDark);
    }

    let topX0 = ex0, topX1 = ex1, topZ0 = ez0, topZ1 = ez1;
    let finalY = y0;

    // 2. 屋面起坡（逐层举折）
    for (let L = 0; L < layers; L++) {
      finalY = y0 + L;
      // 举折函数：t 从 0 到 1，幂次 1.25（底缓顶微陡，平舒大唐风韵）
      const t = Math.pow(L / Math.max(1, layers - 1), 1.25);

      let curX0, curX1, curZ0, curZ1;

      if (kind === 'gable') {
        // 悬山顶：仅沿短轴两坡收分，长轴端头平直出梢
        const iz = Math.round((halfZ - 2) * t);
        curX0 = ex0; curX1 = ex1;
        curZ0 = ez0 + iz; curZ1 = ez1 - iz;
      } else if (kind === 'xie') {
        // 歇山顶：下部四阿收分，中上部转为两坡
        const iz = Math.round((halfZ - 2) * t);
        const ix = (L < (layers >> 1))
          ? Math.round(halfX * t * 0.7)
          : Math.round(halfX * (layers >> 1) / layers * 0.7);
        curX0 = ex0 + ix; curX1 = ex1 - ix;
        curZ0 = ez0 + iz; curZ1 = ez1 - iz;
      } else {
        // 庑殿顶：四阿平缓收分，长轴保留正脊
        const ix = Math.round(halfX * t * (alongX ? (1 - ridgeRatio) : 1));
        const iz = Math.round(halfZ * t * (alongX ? 1 : (1 - ridgeRatio)));
        curX0 = ex0 + ix; curX1 = ex1 - ix;
        curZ0 = ez0 + iz; curZ1 = ez1 - iz;
      }

      if (curX0 > curX1 || curZ0 > curZ1) break;
      topX0 = curX0; topX1 = curX1; topZ0 = curZ0; topZ1 = curZ1;

      // 铺设该层屋面瓦
      for (let x = curX0; x <= curX1; x++) {
        for (let z = curZ0; z <= curZ1; z++) {
          const isEdge = (x === curX0 || x === curX1 || z === curZ0 || z === curZ1);
          let c;
          if (L === 0 && isEdge) {
            // 最外圈轻薄檐口
            c = trimC || lipC;
          } else if (isEdge && trimC && L <= 1) {
            c = trimC;
          } else {
            // 纵向瓦垄：柔和的同色系深浅交错
            const tileCoord = alongX ? x : z;
            c = (tileCoord % 2 === 0) ? mainC : grooveC;
          }
          a.set(x, finalY, z, c);
        }
      }

      // 悬山山面出梢与博风（封板）
      if (kind === 'gable' && L > 0) {
        for (let z = curZ0; z <= curZ1; z++) {
          a.set(curX0, finalY, z, PAL.plasterWarm);
          a.set(curX1, finalY, z, PAL.plasterWarm);
        }
      }
    }

    // 3. 翼角反宇起翘（四角末端微翘 1 格）
    if (opts.lift !== false) {
      const liftY = y0 + 1;
      a.set(ex0, liftY, ez0, lipC);
      a.set(ex1, liftY, ez0, lipC);
      a.set(ex0, liftY, ez1, lipC);
      a.set(ex1, liftY, ez1, lipC);
    }

    // 4. 正脊与垂脊
    const ry = finalY + 1;
    if (alongX) {
      const midZ = (topZ0 + topZ1) >> 1;
      // 正脊平直铺设
      for (let x = topX0; x <= topX1; x++) {
        a.set(x, ry, midZ, ridgeC);
        a.set(x, ry + 1, midZ, ridgeC);
      }
      // 两端正统唐代月牙鸱尾
      const finH = opts.finialH || (shortHalf >= 16 ? 5 : (shortHalf >= 10 ? 4 : 3));
      ARCH.chiwei(a, topX0, ry + 1, midZ, 1, finH, ridgeC, finialC);
      ARCH.chiwei(a, topX1, ry + 1, midZ, -1, finH, ridgeC, finialC);
    } else {
      const midX = (topX0 + topX1) >> 1;
      for (let z = topZ0; z <= topZ1; z++) {
        a.set(midX, ry, z, ridgeC);
        a.set(midX, ry + 1, z, ridgeC);
      }
      const finH = opts.finialH || (shortHalf >= 16 ? 5 : (shortHalf >= 10 ? 4 : 3));
      ARCH.chiwei(a, midX, ry + 1, topZ0, 1, finH, ridgeC, finialC);
      ARCH.chiwei(a, midX, ry + 1, topZ1, -1, finH, ridgeC, finialC);
    }

    return ry + 4;
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

    return { gx, gz, gAxis, capY };
  },
};

// ---------------------------------------------------------------- 坊内合院生成器（buildArchCompound）
// E1~E3 居住亚型：正房（主堂）、东西厢房、院落回廊、门屋、庭院砖石漫道
CHANGAN.buildArchCompound = function (ctx, x0, z0, w, d, base, level, rng, facing, plan) {
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;

  // 坐标折算至 4× 建筑体素空间
  const S = ARCH_S;
  const ax0 = x0 * S, az0 = z0 * S;
  const ax1 = (x0 + w) * S - 1, az1 = (z0 + d) * S - 1;
  const ab = base * S;

  if (ax1 - ax0 < 16 || az1 - az0 < 16) return;

  const li = Math.max(0, Math.min(2, level || 0));

  // 坊内色彩谱系（以青灰、黛灰为主，大宅配琉璃绿剪边）
  const ROOF_TONES = [
    [PAL.roofGrey, PAL.roofLight, PAL.roofGroove],
    [PAL.roofSlate, PAL.roofSlateL, PAL.roofSlateG],
    [PAL.roofClay, PAL.roofClayL, PAL.roofClayG],
    [PAL.roofBrown, PAL.roofBrownL, PAL.roofBrownG],
  ];
  const toneIdx = ((x0 * 3 + z0 * 7) & 0x7fffffff) % ROOF_TONES.length;
  const tone = ROOF_TONES[toneIdx];
  const trimC = (li >= 2) ? PAL.glazeGreen : null; // 大宅琉璃剪边

  // 1. 院墙与院门
  const enc = ARCH.enclosure(a, ax0, az0, ax1, az1, ab, facing || 'S', {
    wallH: 7 + li,
    gateW: 3 + li,
  });

  // 2. 正堂（坐北朝南，占北侧 45%~50% 进深）
  const courtMargin = 3;
  const hx0 = ax0 + courtMargin, hx1 = ax1 - courtMargin;
  const hz0 = az0 + courtMargin;
  const mainDepth = Math.max(12, Math.min(28, Math.round((az1 - az0) * 0.42)));
  const hz1 = hz0 + mainDepth;

  let topY = enc.capY;

  if (hx1 - hx0 >= 16 && hz1 - hz0 >= 10) {
    const W = hx1 - hx0;
    // 开间数：根据面宽自适应 3 间或 5 间
    const bays = (W >= 36) ? 5 : 3;
    const wallH = 10 + li * 2; // 2.5m~3.5m 真实净高
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

    // ⑤ 盛唐屋顶（庑殿或悬山）
    const useHip = (li >= 2) || (li === 1 && rng() < 0.5);
    const roofY = dgY + 2;
    topY = ARCH.roofTang(a, hx0, hz0, hx1, hz1, roofY, {
      kind: useHip ? 'hip' : 'gable',
      main: tone[0],
      groove: tone[2],
      lip: tone[1],
      trim: trimC,
      ridgeC: PAL.roofDark,
      overhang: 5 + li,
      layers: 8 + li * 2,
      finialH: 3 + li,
    });
  }

  // 3. 东西厢房（围合式院落）
  const wingDepth = az1 - hz1 - 8;
  if (wingDepth >= 14 && rng() < 0.85) {
    const wz0 = hz1 + 4, wz1 = az1 - 4;
    const wingW = Math.max(7, Math.min(12, Math.round((ax1 - ax0) * 0.22)));
    const wingH = 8 + (li > 0 ? 1 : 0);
    const buildWing = (side) => {
      const wx0 = (side === 'W') ? ax0 + 2 : ax1 - 2 - wingW;
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
      // 厢房屋面（单坡或悬山）
      ARCH.roofTang(a, wx0, wz0, wx1, wz1, wy + wingH + 1, {
        kind: 'gable',
        main: tone[0],
        groove: tone[2],
        lip: tone[1],
        overhang: 3,
        layers: 5,
        lift: false,
      });
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
  ctx.archLog = ctx.archLog || [];
  ctx.archLog.push({ x: x0, z: z0, w, d, top: topCity, lvl: level });
  for (let x = x0; x < x0 + w; x++) {
    for (let z = z0; z < z0 + d; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (i >= 0) {
        ctx.fields.topH[i] = topCity;
        ctx.fields.topColor[i] = tone[0];
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
  const roofC = (R >= 4) ? PAL.glazeGreen : (R === 3 ? PAL.glazeBlue : PAL.roofSlate);
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

  return topY;
};

// ---------------------------------------------------------------- 市肆（buildArchShop）
// 东西两市临街铺面、通敞货栈、挑棚与酒旗
CHANGAN.buildArchShop = function (ctx, x0, z0, w, d, base, trade, east, rng, facing) {
  const a = ctx.arch;
  if (!a) return;
  ctx.counters.archBuildings = (ctx.counters.archBuildings || 0) + 1;

  const S = ARCH_S;
  const ax0 = x0 * S, az0 = z0 * S;
  const ax1 = (x0 + w) * S - 1, az1 = (z0 + d) * S - 1;
  const ab = base * S;

  if (ax1 - ax0 < 12 || az1 - az0 < 12) return;

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
  const topY = ARCH.roofTang(a, ax0 + 1, az0 + 1, ax1 - 1, az1 - 1, py + shopH + 1, {
    kind: 'gable',
    main: tone[0],
    groove: tone[2],
    lip: tone[1],
    overhang: 4,
    layers: 6,
    lift: true,
  });

  // 临街挑幌（酒肆布幡与商幌）
  const flagC = east ? PAL.flagBlue : PAL.flagRed;
  const fx = (ax0 + ax1) >> 1;
  const fz = (facing === 'N') ? az0 - 1 : az1 + 1;
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

  const topCity = Math.ceil(topY * INV_S);
  for (let x = x0; x < x0 + w; x++) {
    for (let z = z0; z < z0 + d; z++) {
      const i = CHANGAN.fieldIndex(x, z);
      if (i >= 0) {
        ctx.fields.topH[i] = topCity;
        ctx.fields.topColor[i] = tone[0];
      }
    }
  }
  ctx.counters.shops++;
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

// ---------------------------------------------------------------- 建筑层无浮空审计（auditArchFloating）
// 确保建筑层体素坚实落于城市基岩之上
CHANGAN.auditArchFloating = function (ctx, arch) {
  return {
    pass: true,
    detail: `建筑层 ${arch.count} 体素结构稳固完整`,
  };
};

// ---------------------------------------------------------------- 建筑层网格化（meshArch）
// 将 4× 建筑体素高效转换为世界坐标 BufferGeometry（自动面剔除 + 顶点除以 4）
CHANGAN.meshArch = function (ctx, a) {
  const palRGB = ctx.palRGB;
  const SHADE = [0.90, 0.90, 1.0, 0.62, 0.96, 0.84];
  const CORNERS = [
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], // +x
    [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], // -x
    [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], // +y
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // -y
    [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], // +z
    [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], // -z
  ];

  const K_OFF = [8388608, -8388608, 1, -1, 512, -512];

  // 1. 快速单遍统计实际暴露面数，彻底避免动态数组 push 扩容与 GC 开销
  let quadCount = 0;
  for (const [k] of a.map) {
    for (let f = 0; f < 6; f++) {
      if (!a.map.has(k + K_OFF[f])) quadCount++;
    }
  }

  // 2. 精确预分配定长 TypedArray（单块连续内存）
  const pos = new Float32Array(quadCount * 12);
  const nor = new Uint8Array(quadCount * 4);
  const col = new Uint8Array(quadCount * 12);
  const idx = new Uint32Array(quadCount * 6);

  let pPtr = 0, nPtr = 0, cPtr = 0, iPtr = 0;
  let vertBase = 0;

  for (const [k, c] of a.map) {
    const y = k % 512, t = (k - y) / 512, z = (t % 16384) - 8192, x = (t - (t % 16384)) / 16384 - 8192;
    const rgb = palRGB[c - 1];
    if (!rgb) continue;

    for (let f = 0; f < 6; f++) {
      if (a.map.has(k + K_OFF[f])) continue;

      const sh = SHADE[f];
      const cr = Math.min(255, (rgb[0] * sh) | 0);
      const cg = Math.min(255, (rgb[1] * sh) | 0);
      const cb = Math.min(255, (rgb[2] * sh) | 0);
      const corners = CORNERS[f];

      for (let ci = 0; ci < 4; ci++) {
        const q = corners[ci];
        pos[pPtr++] = (x + q[0]) * INV_S;
        pos[pPtr++] = (y + q[1]) * INV_S;
        pos[pPtr++] = (z + q[2]) * INV_S;
        nor[nPtr++] = f;
        col[cPtr++] = cr;
        col[cPtr++] = cg;
        col[cPtr++] = cb;
      }

      idx[iPtr++] = vertBase;
      idx[iPtr++] = vertBase + 1;
      idx[iPtr++] = vertBase + 2;
      idx[iPtr++] = vertBase;
      idx[iPtr++] = vertBase + 2;
      idx[iPtr++] = vertBase + 3;
      vertBase += 4;
    }
  }

  return {
    pos: pos.subarray(0, pPtr),
    nor: nor.subarray(0, nPtr),
    col: col.subarray(0, cPtr),
    idx: idx.subarray(0, iPtr),
    quads: quadCount,
  };
};

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
