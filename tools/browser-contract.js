// 在一次隔离浏览器会话内验证真实 Worker、网格替换、撤销、存储恢复、昼夜及摄影 UI。
module.exports=async function(cdp){
 const checks=[];
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(expr,timeout=60000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await cdp.eval(expr))return;await sleep(150);}throw Error('等待超时: '+expr);};
 const check=async(name,expr)=>{if(!await cdp.eval(expr))throw Error(name);checks.push(name);};
 await check('file:// 离线启动',`location.protocol==='file:' && !!window.__CHANGAN_READY__`);
 await check('说明默认收起',`document.getElementById('lore-card').getAttribute('aria-hidden')==='true'`);
 await cdp.eval(`window.__CHANGAN__.applyQuality('photo')`);
 await check('摄影模式隐藏导航',`getComputedStyle(document.querySelector('.tour-panel')).display==='none' && getComputedStyle(document.querySelector('.telemetry')).display==='none'`);
 await cdp.eval(`document.getElementById('photo-exit').click()`);
 await check('摄影模式可退出',`!document.body.classList.contains('photo-mode')`);
 await cdp.eval(`window.__CHANGAN__.setHour(23)`);await sleep(1000);
 await check('深夜城门关闭',`window.__CHANGAN__.Life.doorsClosed===true`);
 await cdp.eval(`window.__CHANGAN__.setLightMode('noon')`);await sleep(1000);
 await check('正午城门开放',`window.__CHANGAN__.Life.doorsClosed===false`);
 // 从真实近景建筑面内取一个细体素。保存分块标识，检查异步网格实际被替换。
 await cdp.eval(`(()=>{
  const A=window.__CHANGAN__,ch=[...A.Engine.archChunks.entries()].find(([id,c])=>c.full.geometry.index.count>0);
  const g=ch[1].full.geometry,p=g.attributes.position,n=g.attributes.normal,ids=g.index.array;
  const center=[0,0,0];for(let j=0;j<3;j++){const i=ids[j];center[0]+=p.getX(i)/3;center[1]+=p.getY(i)/3;center[2]+=p.getZ(i)/3;}
  const i=ids[0],ns=[n.getX(i),n.getY(i),n.getZ(i)];
  window.__editProbe={id:ch[0],mesh:ch[1].full,op:{version:2,layer:'arch',x:Math.floor((center[0]-ns[0]*.01)*4),y:Math.floor((center[1]-ns[1]*.01)*4),z:Math.floor((center[2]-ns[2]*.01)*4),c:0}};
  A.submitEdits([window.__editProbe.op]);return true;
 })()`);
 await wait(`!window.__CHANGAN__.Editor.busy`);
 await check('建筑删除返回真实原色并替换网格',`window.__CHANGAN__.Editor.stack.at(-1).before>0 && window.__CHANGAN__.Engine.archChunks.get(window.__editProbe.id).full!==window.__editProbe.mesh`);
 await cdp.eval(`window.__CHANGAN__.undoEdit()`);await wait(`!window.__CHANGAN__.Editor.busy`);
 await check('撤销恢复编辑栈',`window.__CHANGAN__.Editor.stack.length===0`);
 // 保留一次建筑编辑和一条旧城市格记录，刷新验证迁移及回放。
 await cdp.eval(`(()=>{const A=window.__CHANGAN__;A.submitEdits([{...window.__editProbe.op,c:5}]);return true})()`);
 await wait(`!window.__CHANGAN__.Editor.busy`);
 await check('V2 持久化',`JSON.parse(localStorage.getItem('changan.edit.v2.'+window.__CHANGAN__.App.seed.toString(16))).ops.length===1`);
 await cdp.eval(`window.__CHANGAN_READY__=false`);await cdp.send('Page.reload');await wait(`!!window.__CHANGAN_READY__`,180000);await wait(`!window.__CHANGAN__.Editor.busy`);
 await check('刷新回放建筑编辑',`window.__CHANGAN__.Editor.stack.length===1&&window.__CHANGAN__.Editor.stack[0].layer==='arch'&&window.__CHANGAN__.Editor.stack[0].before>0`);
 await cdp.eval(`window.__CHANGAN__.undoEdit()`);await wait(`!window.__CHANGAN__.Editor.busy`);
 await cdp.eval(`(()=>{const k=window.__CHANGAN__.App.seed.toString(16);localStorage.removeItem('changan.edit.v2.'+k);localStorage.setItem('changan.edit.'+k,JSON.stringify([{x:0,y:1,z:0,c:5}]));window.__CHANGAN_READY__=false;return true})()`);
 await cdp.send('Page.reload');await wait(`!!window.__CHANGAN_READY__`,180000);await wait(`!window.__CHANGAN__.Editor.busy`);
 await check('旧城市格存档迁移且原记录保留',`(()=>{const A=window.__CHANGAN__,op=A.Editor.stack[0];return op?.layer==='city'&&op.version===2&&localStorage.getItem('changan.edit.'+A.App.seed.toString(16))!==null})()`);
 await cdp.eval(`window.__CHANGAN__.undoEdit()`);await wait(`!window.__CHANGAN__.Editor.busy`);
 await cdp.eval(`(()=>{const A=window.__CHANGAN__;A.goToView('axis',true);A.startWalk();A.Walk.pos.set(0,A.walkHeight(0,200)+1.65,200);return true})()`);
 await check('轴线可步行',`window.__CHANGAN__.canStep(0,200.1)`);
 await cdp.eval(`window.__CHANGAN__.stopWalk();window.__CHANGAN__.setLightMode('noon')`);
 return checks;
};
