// 数据与编辑契约检查；--baseline <备份/src> 读取冻结版本，--mesh 测真实网格。
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const args=process.argv.slice(2),bi=args.indexOf('--baseline');
const src=bi>=0?path.resolve(args[bi+1]):path.resolve(__dirname,'../src');
const files=['g01_core','g02_skeleton','g03_wards','g04_proto','g04_landmark','g05_detail','g06_audit_mesh','g08_arch',...(fs.existsSync(path.join(src,'gen/g09_refine.js'))?['g09_refine']:[]),'g07_pipeline'];
const seeds=args.includes('--all')?[0x5a17c4a9,0x0d7a11c9,0x9e3779b9]:[0x5a17c4a9];
const results=[];
for(const seed of seeds){
 const s={console};vm.createContext(s);for(const f of files)vm.runInContext(fs.readFileSync(path.join(src,'gen',f+'.js'),'utf8'),s,{filename:f});
 const C=vm.runInContext('CHANGAN',s);
 vm.runInContext(`const countRoof=ARCH.roofTang;ARCH.roofTang=function(...args){this._unused=0;CHANGAN.roofCount=(CHANGAN.roofCount||0)+1;return countRoof(...args);};`,s);
 if(!args.includes('--mesh')){C.meshAll=()=>[];C.meshArch=()=>({quads:0});C.meshArchChunks=()=>[];}
 const r=C.generate(seed,()=>{}, {plan:'C'});
 if(!r.ok){console.error(r.error,r.audits?.filter(a=>!a.pass));process.exitCode=1;continue;}
 const row={seed:seed.toString(16),...r.stats,roofs:C.roofCount,counters:r._ctx.counters};
 if(bi<0){
  const ctx=r._ctx,k=ctx.arch.map.keys().next().value;
  const [x,y,z]=vm.runInContext(`archDecode(${k})`,s),before=ctx.arch.get(x,y,z);
  let e=C.applyOps(ctx,[{version:2,layer:'arch',x,y,z,c:0}]);assert.equal(ctx.arch.get(x,y,z),0);assert.equal(e.applied[0].before,before);assert(e.dirtyArch.length);
  C.applyOps(ctx,[{version:2,layer:'arch',x,y,z,c:before}]);assert.equal(ctx.arch.get(x,y,z),before);
  const legacy={x:0,y:1,z:0,c:5},old=ctx.store.get(0,1,0);e=C.applyOps(ctx,[legacy]);assert.equal(e.applied[0].before,old);C.applyOps(ctx,[{...legacy,c:old}]);
  assert.equal(C.applyOps(ctx,[{x:NaN,y:1,z:0,c:5}]).applied.length,0);
  const fixture=new C.ArchStore();fixture.fill(0,4,0,7,7,7,5);
  const m=C.meshArchPart(ctx,fixture,[...fixture.map.keys()]);assert.equal(m.quads,6,'实心方盒应合并成六面');
  const detached=new C.ArchStore();detached.set(0,480,0,5);assert.equal(C.auditArchFloating(ctx,detached).pass,false,'浮空检测必须真实失败');
  row.contracts='arch delete/restore, legacy edit, invalid input, greedy six faces, floating detection PASS';
 }
 results.push(row);console.log(JSON.stringify(row));
}
const oi=args.indexOf('--out');if(oi>=0)fs.writeFileSync(args[oi+1],JSON.stringify(results,null,2));
