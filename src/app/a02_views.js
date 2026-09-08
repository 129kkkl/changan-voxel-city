// a02_views.js — 十九机位 + LORE 卡片；相机由 meta.viewAnchors 解算
const VIEW_KEYS = '1234567890ABCDEFGHI';

export const VIEW_DEFS = [
  { id: 'mingde', title: '国门明德', badge: '礼制中轴', sub: '明德门 · 五门道国门',
    lore: '明德门是外郭正南门，十二门中唯一的五门道国门。天子南郊祭天，车驾由此出城。立于门外北望，朱雀大街如一条黄土御道洞穿全城，两侧坊墙低伏、青槐夹道，尽处依次叠出皇城朱雀门与宫城承天门。三点一线的中轴，是宇文恺按礼制留给盛唐的城市脊梁。',
    cam: A => ({ pos: [A.mingde.x - 6, A.mingde.y + 8, A.mingde.z + 36], target: [A.mingde.x, A.mingde.y + 4, A.mingde.z - 70] }) },
  { id: 'axis', title: '天街纵目', badge: '朱雀御道', sub: '青槐夹道 · 坊门重重',
    lore: '朱雀大街是长安的呼吸。御道宽阔得近乎空旷，路拱微起，两侧土明沟与槐行把尺度压低。沿街不见店铺——里坊制把商业锁进东西两市，大街只留下墙、槐、水沟与丹粉坊门。低空向前推进时，重重坊门如节拍器，把全城的肃穆敲进视野。',
    cam: A => ({ pos: [A.axis.x, A.axis.y + 8, 252], target: [A.axis.x, A.axis.y + 3, 40] }) },
  { id: 'hengjie', title: '横街广场', badge: '宫皇之间', sub: '承天门前 · 元旦大朝',
    lore: '宫城与皇城之间的横街，是全城最宽的广场。元旦大朝、改元大赦、万国朝贡，仪仗在此铺开。北面承天门门观如阙，南面皇城百司廊院压阵。箱庭把这条横街做成礼制的停顿：御道的纵深在这里横展开来，黄土与朱红对撞，朝会的空阔比任何殿宇都更有压迫感。',
    cam: A => ({ pos: [A.hengjie.x - 40, A.hengjie.y + 18, A.hengjie.z + 8], target: [A.hengjie.x + 6, A.hengjie.y + 8, A.hengjie.z - 36] }) },
  { id: 'hanyuan', title: '龙尾含元', badge: '东内礼制', sub: '含元殿 · 三出大台',
    lore: '含元殿踞龙首原南沿，殿基高出平地十余米。三条龙尾道自台南盘下，左右翔鸾、栖凤二阁夹持，重檐庑殿压住天际。自龙尾道下仰拍，三层大台如山，朱红柱列嵌在白粉壁上，青灰瓦与琉璃剪边只在檐口一闪。这是盛唐政治的正面，也是全城最强的礼制重音。',
    cam: A => ({ pos: [A.hanyuan.x + 42, A.hanyuan.y + 14, A.hanyuan.z + 28], target: [A.hanyuan.x, A.hanyuan.y + 8, A.hanyuan.z] }) },
  { id: 'hanyuanTop', title: '含元俯瞰', badge: '龙首原上', sub: '南望一百〇八坊',
    lore: '登上含元殿高台南望，棋盘才真正摊开。街东万年、街西长安，朱雀街如中缝，坊墙如线，瓦海如潮。东北是大明宫自身的殿庭，东南隐约可见乐游原与曲江。宇文恺比附乾卦六爻的六坡，在这一眼里变成柔和的黄土起伏。最高礼制视点，看的不是宫阙，是一座被规划出来的世界。',
    cam: A => ({ pos: [A.hanyuan.x - 8, A.hanyuan.y + 42, A.hanyuan.z + 24], target: [A.hanyuan.x - 30, 10, 50] }) },
  { id: 'taiye', title: '太液蓬莱', badge: '大明宫苑', sub: '太液池 · 蓬莱山',
    lore: '含元、宣政、紫宸以北，太液池展开一湾清碧。池中筑蓬莱山，岛上置亭，回廊贴水。麟德殿的宴饮声仿佛还能隔水传来。盛唐的政治中心并不只有朝会的肃杀，还有这一处帝王园林的留白。水榭、柳岸、石桥把礼制城市里最柔软的一段，轻轻放在龙首原的北坡。',
    cam: A => ({ pos: [A.taiye.x - 28, A.taiye.y + 14, A.taiye.z + 18], target: [A.taiye.x + 8, A.taiye.y + 4, A.taiye.z - 8] }) },
  { id: 'xingqing', title: '花萼龙池', badge: '南内兴庆', sub: '兴庆池 · 花萼相辉楼',
    lore: '兴庆宫由隆庆坊扩建，占一坊半，布局故意不对称——这是它与太极、大明最醒目的区别。龙池居中，池畔花萼相辉楼、勤政务本楼临街而立，像一座被允许靠近里坊的宫殿。夹城复道贴着东墙北上大明、南下芙蓉园，天子可以不出郭城，在封闭廊道里走完东内与南内。',
    cam: A => ({ pos: [A.xingqing.x - 24, A.xingqing.y + 16, A.xingqing.z + 22], target: [A.xingqing.x + 6, A.xingqing.y + 4, A.xingqing.z - 6] }) },
  { id: 'westMarket', title: '西市胡尘', badge: '利人金市', sub: '井字街 · 波斯邸 · 驼队',
    lore: '西市是长安的胃口。井字街把两坊之地切成九区，市墙八门晨开暮闭。胡商的尖顶帽与酒旗挤在一行行邸店之间，柜坊、药材、绢帛、麸行杂沓一处。永安渠贴着市东，水岸码头卸下西域来的货。驼铃自开远门入城，到这里才真正停住。气质杂而盛，是丝路在城墙以内的落点。',
    cam: A => ({ pos: [A.westMarket.x - 22, A.westMarket.y + 14, A.westMarket.z + 22], target: [A.westMarket.x + 4, A.westMarket.y + 2, A.westMarket.z - 4] }) },
  { id: 'eastMarket', title: '东市珍奇', badge: '都会市', sub: '市楼 · 二百二十行',
    lore: '东市对面是权贵宅第更密的街东。同样的井字街与市楼，行肆却偏向珍奇、书坊、高端邸店。市署平准旗挂在攒尖楼头，日中鼓三百声而众以会，日入前七刻钲响而散。两市对称，气质不同：西市是胡尘与铜臭，东市是绢帛与香料。箱庭里用旗幌密度和色温把这份贵气轻轻托出来。',
    cam: A => ({ pos: [A.eastMarket.x + 20, A.eastMarket.y + 16, A.eastMarket.z + 20], target: [A.eastMarket.x - 4, A.eastMarket.y + 2, A.eastMarket.z - 4] }) },
  { id: 'dayanta', title: '雁塔登高', badge: '晋昌坊', sub: '大慈恩寺 · 楼阁式塔',
    lore: '大雁塔是楼阁式方塔：七层、平座、逐层收分，砖灰为主。玄奘译经于此，进士及第后有雁塔题名的风俗。立在平座层级南望曲江、北望瓦海，塔身把长安的天际线钉住一个直角。它与荐福寺密檐小雁塔成对——一方正雄健，一修长柔和——盛唐的两座塔，是两种时间写在同一座城里。',
    cam: A => ({ pos: [A.dayanta.x + 22, A.dayanta.y + 4, A.dayanta.z + 26], target: [A.dayanta.x, A.dayanta.y - 8, A.dayanta.z - 6] }) },
  { id: 'xiaoyanta', title: '小雁晨钟', badge: '开化安仁', sub: '荐福寺 · 密檐方塔',
    lore: '小雁塔是密檐式方塔，层层叠收，轮廓比大雁更软。荐福寺廊院围着它，晨钟从密檐之间漏下来。开化、安仁两坊因寺而名，朱雀街东侧的这一段因此有了竖向的停顿。密檐的影子扫过粉墙与松竹，像把一部经卷竖着插进棋盘。钟声不是装饰，是里坊时间的另一种鼓点。',
    cam: A => ({ pos: [A.xiaoyanta.x - 16, A.xiaoyanta.y + 2, A.xiaoyanta.z + 20], target: [A.xiaoyanta.x, A.xiaoyanta.y + 4, A.xiaoyanta.z - 4] }),
    light: 'dawn' },
  { id: 'qinglong', title: '乐游青龙', badge: '乐游原', sub: '新昌坊 · 青龙寺',
    lore: '乐游原是城东南最高处，青龙寺踞其上。登高可俯瞰东南坊里与曲江一带，春日士女游原，诗里写过多少次。六坡之中，这里的隆起最像“原”：不是山，是黄土高地。寺院放在高台上，松柏压住坡线，瓦海在脚下展开。长安不是平的，这一眼把东南高、西北低的地势说完。',
    cam: A => ({ pos: [A.qinglong.x, A.qinglong.y + 10, A.qinglong.z + 48], target: [A.qinglong.x, A.qinglong.y + 2, A.qinglong.z + 8] }) },
  { id: 'jingshan', title: '靖善梵阁', badge: '九五高坡', sub: '大兴善寺 · 密宗祖庭',
    lore: '靖善坊被大兴善寺占尽一坊。九五坡最尊，不置民居，以大兴善寺与街西崇业坊玄都观对镇，应“飞龙在天”。中轴南段因此有了一处佛法的重音：廊院、大殿、高阁压住坡顶，松竹破开棋盘的均质。密宗的香火与朱雀街的空阔并置，盛唐的精神生活不是藏在巷子里，是被规划进城市骨架。',
    cam: A => ({ pos: [A.jingshan.x - 20, A.jingshan.y + 14, A.jingshan.z + 18], target: [A.jingshan.x + 4, A.jingshan.y + 6, A.jingshan.z - 8] }) },
  { id: 'wardGate', title: '坊门昼启', badge: '里坊生活', sub: '十字街 · 巷曲 · 宅院',
    lore: '推开丹粉坊门，尺度骤然变小。大坊十字街切十六区，区内巷曲再分，沿巷生长合院。外闭内敞：大街上看见的是墙，门内才是井台、乌头门、直棂窗与槐影。平康、崇仁一带更有北里与昼夜灯火的特许气息。里坊制的灵魂不在棋盘的整齐，在这扇门把城市分成两种声音。',
    cam: A => ({ pos: [A.wardGate.x - 5, A.wardGate.y + 4.0, A.wardGate.z + 18], target: [A.wardGate.x, A.wardGate.y + 2.5, A.wardGate.z] }) },
  { id: 'lane', title: '巷曲井台', badge: '行人近景', sub: '井台 · 乌头门 · 直棂窗',
    lore: '第一人称走进巷曲，才能看清唐风的句子：夯土院墙、板门、直棂窗的竖密棂条，贵族宅第的乌头门两柱出头。井台在巷口，石栏一圈，是生活的句读。屋顶是平缓的悬山或歇山，出檐深远，鸱尾内收而不外卷。朱、白、灰三色在近处也不喧哗。箱庭的近景要经得起贴脸，靠的是语法而不是贴图。',
    cam: A => ({ pos: [A.lane.x, A.lane.y + 0.2, A.lane.z], target: [A.lane.x, A.lane.y - 0.2, A.lane.z + 26] }) },
  { id: 'qujiang', title: '曲江流饮', badge: '南郊园林', sub: '曲江池 · 芙蓉园 · 杏园',
    lore: '曲江池与芙蓉园占了城东南一角。黄渠补给池水，小岛上亭阁须先堆岛台，游船绕行。上巳节士女游春、杏园赐宴，诗酒与水光搅在一起。紫云楼一类的高阁是点缀，真正的主角是那一片被允许“空着”的水。礼制棋盘在这里松绑，盛唐把游赏写成城市功能的一部分，而不是城墙外的野。',
    cam: A => ({ pos: [A.qujiang.x - 22, A.qujiang.y + 16, A.qujiang.z + 18], target: [A.qujiang.x + 10, A.qujiang.y + 3, A.qujiang.z - 8] }) },
  { id: 'jinguang', title: '金光驼影', badge: '丝路西门', sub: '金光门 / 开远门 · 渭水',
    lore: '开远门是丝绸之路西行的起点，金光门与春明门对开，横街贯穿两市。驼队自西门入城，沿金光—春明一线走向西市码头。城外北望渭水苍黄，南眺终南山只是一抹青灰剪影。门墩包砖、城楼重檐，夯土墙在阳光里发暖。胡商、驮铃、城壕与远山，把长安从一座中国都城，接上整条欧亚的路。',
    cam: A => ({ pos: [A.kaiyuan.x - 36, A.kaiyuan.y + 18, A.kaiyuan.z + 12], target: [A.jinguang.x + 20, A.jinguang.y + 4, A.jinguang.z + 40] }) },
  { id: 'wardCorner', title: '坊角鸟瞰', badge: 'P1 判定机位', sub: '主街 · 十字街 · 巷 同框',
    lore: 'P1 规划判定专用机位：斜俯角把主街、坊内十字街、巷与院落收进同一帧，用来回答"街道宽度级差能否一眼分辨"。与 axis/wardGate/lane 一起构成固定对照机位组，不得为好看而改。',
    cam: A => ({ pos: [A.wardGate.x + 36, A.wardGate.y + 32, A.wardGate.z + 40], target: [A.wardGate.x - 4, A.wardGate.y + 2, A.wardGate.z - 12] }) },
  { id: 'curfew', title: '暮鼓夜禁', badge: '宵禁', sub: '坊门闭合 · 金吾巡街',
    lore: '日入前后，街鼓从承天门一线敲开。市门先闭，坊门次第合上，丹粉门扉落下，顶面高度改变，街巷真的走不通了。金吾卫骑巡大街，武侯铺与坊门楼亮起灯笼，万家灯火只在墙内。正月十五上元例外：灯轮灯树，特许夜行。长安的时间不是装饰用的天空盒，是一门会关门的制度。',
    cam: A => ({ pos: [A.axis.x - 14, A.axis.y + 8, 140], target: [A.axis.x + 8, A.axis.y + 3, 70] }),
    light: 'dusk' },
];

let _app = null;
let _tween = null;
export let currentViewId = VIEW_DEFS[0].id;
let _tourTimer = 0;
let _tourOn = false;

export function viewById(id) {
  return VIEW_DEFS.find(v => v.id === id) || VIEW_DEFS[0];
}

export function initViewPanel() {
  const host = document.getElementById('landmark-list');
  if (!host) return;
  host.innerHTML = '';
  VIEW_DEFS.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'landmark';
    b.type = 'button';
    b.dataset.view = v.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<kbd>${VIEW_KEYS[i]}</kbd>${v.title}`;
    b.addEventListener('click', () => { stopAutoTour(); goToView(v.id); });
    host.appendChild(b);
  });
}

export function bindViews(app) { _app = app; }

export function showLore(v) {
  const card = document.getElementById('lore-card');
  const badge = document.getElementById('lore-badge');
  const title = document.getElementById('lore-title');
  const sub = document.getElementById('lore-sub');
  const desc = document.getElementById('lore-desc');
  if (badge) badge.textContent = v.badge;
  if (title) title.textContent = v.title;
  if (sub) sub.textContent = v.sub;
  if (desc) desc.textContent = v.lore;
  if (card) card.setAttribute('aria-hidden', 'false');
}

export function goToView(id, instant) {
  const v = viewById(id);
  const A = _app && _app.meta && _app.meta.viewAnchors;
  if (!A) return;
  currentViewId = v.id;
  document.querySelectorAll('.landmark').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v.id)));
  showLore(v);
  if (typeof stopWalk === 'function') stopWalk();
  let cam;
  try { cam = v.cam(A); } catch { return; }
  const toP = new THREE.Vector3(cam.pos[0], cam.pos[1], cam.pos[2]);
  const toT = new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2]);
  if (instant) {
    Engine.camera.position.copy(toP);
    Engine.controls.target.copy(toT);
    Engine.controls.update();
    _tween = null;
  } else {
    _tween = {
      t0: performance.now(), dur: 1400,
      fromP: Engine.camera.position.clone(), toP,
      fromT: Engine.controls.target.clone(), toT,
    };
  }
  if (v.light && typeof setLightMode === 'function' && Life && !Life.autoFlow) setLightMode(v.light);
}

export function tickCamera() {
  if (!_tween) return;
  const u = Math.min(1, (performance.now() - _tween.t0) / _tween.dur);
  const s = u * u * (3 - 2 * u);
  Engine.camera.position.lerpVectors(_tween.fromP, _tween.toP, s);
  Engine.controls.target.lerpVectors(_tween.fromT, _tween.toT, s);
  Engine.controls.update();
  if (u >= 1) _tween = null;
}

export function cycleView(dir) {
  const i = VIEW_DEFS.findIndex(v => v.id === currentViewId);
  const n = (i + dir + VIEW_DEFS.length) % VIEW_DEFS.length;
  goToView(VIEW_DEFS[n].id);
}

export function viewByKey(ch) {
  const i = VIEW_KEYS.indexOf(ch.toUpperCase());
  if (i >= 0) goToView(VIEW_DEFS[i].id);
}

export function startAutoTour() {
  _tourOn = true;
  const btn = document.getElementById('auto-rotate');
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
  clearInterval(_tourTimer);
  _tourTimer = setInterval(() => cycleView(1), 9000);
}

export function stopAutoTour() {
  _tourOn = false;
  clearInterval(_tourTimer);
  const btn = document.getElementById('auto-rotate');
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); }
}

export function toggleAutoTour() {
  if (_tourOn) stopAutoTour(); else { goToView(currentViewId); startAutoTour(); }
  return _tourOn;
}
