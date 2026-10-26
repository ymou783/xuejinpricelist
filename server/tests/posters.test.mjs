import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../app.mjs";
import { setPassword } from "../auth.mjs";
import { atomicWrite, createStore } from "../store.mjs";
import { parseCatalog } from "../../src/catalog.ts";
import { cdnImageInfo, publicAddress } from "../cdn-info.mjs";
import { posterDraft, publishable } from "../posters.mjs";
let dir, instance, server, origin, cookie, csrf;
const seed = JSON.parse(await readFile(new URL("../../public/catalog.json",import.meta.url),"utf8"));
const base = seed.entries[0];
async function call(url, method="GET", body, extra={}) {
  return fetch(origin + "/api/admin/" + url, { method, headers:{ origin, cookie, "x-csrf-token":csrf, ...(body ? {"content-type":"application/json"} : {}), ...extra }, body:body ? JSON.stringify(body) : undefined });
}
async function create(fields={}) {
  const r=await call("posters","POST",{ draft:{ ...base, ...fields } }); assert.equal(r.status,201); return (await r.json()).record;
}
async function update(r,fields={},action="draft") {
  const res=await call("posters/"+r.draft.id,"PUT",{draft:{...r.draft,...fields},version:r.version,action});
  assert.equal(res.status,200,JSON.stringify(await res.clone().json())); return (await res.json()).record;
}
before(async()=>{
  dir=await mkdtemp(path.join(tmpdir(),"xuejin-library-test-"));
  const password=randomBytes(24).toString("base64url"); await setPassword(dir,password);
  instance=await createApp({directory:dir,imageInfo:async(_domain,key)=>{ if(key==="images/good.jpg") return {width:1600,height:2400}; throw Object.assign(new Error("图片不存在"),{status:400}); }});
  server=instance.app.listen(0,"127.0.0.1"); await new Promise(r=>server.once("listening",r)); origin="http://127.0.0.1:"+server.address().port;
  const login=await fetch(origin+"/api/admin/login",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({password})});
  cookie=login.headers.get("set-cookie").split(";")[0]; csrf=(await login.json()).csrf;
});
after(async()=>{instance.dispose();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});

test("poster library and dimension APIs require session, same origin and CSRF",async()=>{
  assert.equal((await call("posters","GET",undefined,{cookie:""})).status,401);
  for(const [url,body] of [["posters",{draft:{}}],["posters/image-info",{objectKey:"images/good.jpg"}],["posters/batch",{items:[]}]]){
    assert.equal((await call(url,"POST",body,{"x-csrf-token":""})).status,403);
    assert.equal((await call(url,"POST",body,{origin:"https://example.org"})).status,403);
  }
  const session=await(await call("session")).json(); assert.equal(session.posterLibrary,true);
  const info=await call("posters/image-info","POST",{objectKey:"images/good.jpg"}); assert.equal(info.status,200);assert.deepEqual(await info.json(),{width:1600,height:2400});
  assert.equal((await call("posters/image-info","POST",{objectKey:"bad"})).status,400);
});
test("legacy posters migrate as published, retaining IDs, descriptions and order",async()=>{
  const page=await(await call("posters")).json();
  assert.deepEqual(page.items.map(r=>r.id),seed.entries.map(r=>r.id));assert.ok(page.items.every(r=>r.status==="published"&&!r.hasChanges));
  const record=(await(await call("posters/"+base.id)).json()).record;assert.deepEqual(record.draft,base);assert.deepEqual(record.published,base);
});
test("incomplete drafts persist independently and never appear in the public catalog",async()=>{
  const res=await call("posters","POST",{draft:{category:"fun"}});assert.equal(res.status,201);let r=(await res.json()).record;
  r=await update(r,{title:"未完成测试草稿"});assert.equal(r.status,"draft");
  const bad=await call("posters/"+r.draft.id,"PUT",{draft:r.draft,version:r.version,action:"publish"});assert.equal(bad.status,400);
  const publicData=await(await fetch(origin+"/catalog.json")).json();assert.equal(publicData.entries.some(p=>p.id===r.draft.id),false);assert.equal(publicData._posterLibrary,undefined);
  const backup=JSON.parse(await readFile(path.join(dir,"catalog.json.before-poster-library.bak"),"utf8"));assert.deepEqual(backup.entries,seed.entries);assert.equal(backup._posterLibrary,undefined);
  const again=await createStore(dir).getPoster(r.draft.id);assert.equal(again.record.draft.title,"未完成测试草稿");
  const ready=await create({title:"独立发布测试"});await update(ready,{},"publish");
  assert.ok((await(await fetch(origin+"/catalog.json")).json()).entries.some(p=>p.id===ready.draft.id));
});
test("poster descriptions are optional on publish and stay blank after reload and section saves",async()=>{
  let r=await create({title:"没有说明也可发布",description:""});r=await update(r,{},"publish");
  const live=(await(await fetch(origin+"/catalog.json")).json()).entries.find(p=>p.id===r.draft.id);assert.equal(live.description,"");assert.ok(live.image.alt);
  const restored=createStore(dir);assert.equal((await restored.snapshot()).catalog.entries.find(p=>p.id===r.draft.id).description,"");
  const snapshot=await restored.snapshot(true);await restored.saveSection("home",{...snapshot.catalog,heading:"说明可选测试"},snapshot.sectionRevisions.home);
  assert.equal((await createStore(dir).getPoster(r.draft.id)).record.draft.description,"");
});
test("saving edits as a draft preserves the last published snapshot, stale saves conflict",async()=>{
  let r=await create({title:"原发布标题"});r=await update(r,{},"publish");const old=r;
  r=await update(r,{title:"尚未发布的新标题",description:"私有草稿说明"});
  const published=(await(await fetch(origin+"/catalog.json")).json()).entries.find(p=>p.id===r.draft.id);assert.equal(published.title,"原发布标题");
  const stale=await call("posters/"+r.draft.id,"PUT",{draft:old.draft,version:old.version,action:"publish"});assert.equal(stale.status,409);
  const page=await(await call("posters?q=尚未发布")).json();assert.equal(page.items[0].hasChanges,true);
  await update(r,{},"publish");assert.equal((await(await fetch(origin+"/catalog.json")).json()).entries.find(p=>p.id===r.draft.id).title,"尚未发布的新标题");
});
test("batch publish reports incomplete rows separately, downlisting and deletion preserve other content",async()=>{
  const good=await create({title:"批量好海报",category:"special"});
  const blank=(await(await call("posters","POST",{draft:{category:"special"}})).json()).record;
  const result=await(await call("posters/batch","POST",{items:[good,blank].map(r=>({id:r.draft.id,version:r.version})),action:"publish"})).json();
  assert.deepEqual(result.succeeded,[good.draft.id]);assert.equal(result.failed[0].id,blank.draft.id);
  let r=(await(await call("posters/"+good.draft.id)).json()).record;
  let batch=await call("posters/batch","POST",{items:[{id:r.draft.id,version:r.version}],action:"offline"});assert.equal(batch.status,200);
  assert.equal((await(await fetch(origin+"/catalog.json")).json()).entries.some(p=>p.id===r.draft.id),false);
  r=(await(await call("posters/"+r.draft.id)).json()).record;assert.equal(r.status,"offline");assert.ok(r.published);
  r=await update(r,{},"publish");
  await call("posters/batch","POST",{items:[{id:r.draft.id,version:r.version}],action:"delete"});
  assert.equal((await call("posters/"+r.draft.id)).status,404);assert.equal((await call("posters/"+blank.draft.id)).status,200);
});
test("bulk category and new flags affect only explicit public fields and retain unpublished edits",async()=>{
  let r=await create({title:"保留已发布标题",category:"basic"});r=await update(r,{},"publish");
  r=await update(r,{title:"",description:"还未写完"});
  for(const [action,value] of [["category","companion"],["new",true]]){
    const batch=await(await call("posters/batch","POST",{items:[{id:r.draft.id,version:r.version}],action,value})).json();assert.equal(batch.succeeded.length,1);
    r=(await(await call("posters/"+r.draft.id)).json()).record;
  }
  const p=(await(await fetch(origin+"/catalog.json")).json()).entries.find(p=>p.id===r.draft.id);
  assert.equal(p.title,"保留已发布标题");assert.equal(p.category,"companion");assert.equal(p.isNew,true);assert.equal(r.draft.title,"");
});
test("batch import writes valid rows once, retains failures and safely retries stable IDs",async()=>{
  const items=[
    {id:"import-batch-good",draft:{...base,title:"批量导入好的图片"}},
    {id:"import-batch-blank",draft:{category:"fun"}},
    {id:"import-batch-bad",draft:{...base,image:{...base.image,objectKey:"../secret"}}},
  ];
  for(let i=0;i<2;i++){
    const response=await call("posters/import","POST",{items});assert.equal(response.status,200);const result=await response.json();
    assert.deepEqual(result.succeeded,["import-batch-good","import-batch-blank"]);assert.equal(result.failed[0].id,"import-batch-bad");
  }
  const rows=await(await call("posters?q=批量导入好的图片")).json();assert.equal(rows.total,1);assert.equal(rows.items[0].status,"draft");
  assert.equal((await(await fetch(origin+"/catalog.json")).json()).entries.some(p=>p.id==="import-batch-good"),false);
});
test("copy creates an unpublished draft; stable import IDs do not duplicate retried imports",async()=>{
  const r=await create({title:"复用海报"});
  const copy=(await(await call("posters/"+r.draft.id+"/copy","POST",{version:r.version})).json()).record;
  assert.notEqual(copy.draft.id,r.draft.id);assert.equal(copy.status,"draft");assert.equal(copy.draft.image.objectKey,r.draft.image.objectKey);
  const id="poster-idempotent-import";const body={id,draft:{...base,title:"幂等导入"}};
  await call("posters","POST",body);const again=await(await call("posters","POST",body)).json();assert.equal(again.reused,true);
  const page=await(await call("posters?q=幂等导入")).json();assert.equal(page.total,1);
});
test("search, status, category, new filters and page counts use the full server-side library",async()=>{
  await create({title:"Filter ＡＬＰＨＡ one",category:"fun",isNew:true});await create({title:"Filter alpha two",category:"fun",isNew:true});
  const result=await(await call("posters?q=FILTER+alpha&category=fun&status=draft&new=yes&pageSize=1&page=2")).json();
  assert.equal(result.total,2);assert.equal(result.pages,2);assert.equal(result.items.length,1);assert.match(result.items[0].title,/two/);assert.ok(result.counts.all>result.total);
  const defaultPage=await(await call("posters")).json();assert.equal(defaultPage.pageSize,6);assert.equal(defaultPage.items.length,6);
});
test("category sorting crosses pages, preserves other categories and rejects stale sort revisions",async()=>{
  const first=await create({title:"排序一",category:"special"}),second=await create({title:"排序二",category:"special"});
  const before=await(await call("posters?pageSize=100")).json();const other=before.items.filter(r=>r.category!=="special").map(r=>r.id);
  const moved=await call("posters/"+second.draft.id+"/move","POST",{position:1,revision:before.revision});assert.equal(moved.status,200);
  const stale=await call("posters/"+first.draft.id+"/move","POST",{position:1,revision:before.revision});assert.equal(stale.status,409);
  const after=await(await call("posters?pageSize=100")).json();assert.deepEqual(after.items.filter(r=>r.category!=="special").map(r=>r.id),other);
  assert.equal(after.items.filter(r=>r.category==="special")[0].id,second.draft.id);
});
test("unpublished category changes cannot move another public category during sorting",async()=>{
  let r=await create({title:"等待分类调整",category:"basic"});r=await update(r,{},"publish");r=await update(r,{category:"companion"});
  const before=await(await call("posters")).json();
  const res=await call("posters/"+r.draft.id+"/move","POST",{position:1,revision:before.revision});assert.equal(res.status,400);
  const pub=(await(await fetch(origin+"/catalog.json")).json()).entries.find(p=>p.id===r.draft.id);assert.equal(pub.category,"basic");
  r=await update(r,{},"publish");
  const after=await(await call("posters")).json();
  assert.equal((await call("posters/"+r.draft.id+"/move","POST",{position:1,revision:after.revision})).status,200);
});
test("large libraries have no fixed poster cap, paginated editing avoids sending megabyte catalogs",async()=>{
  const largeDir=path.join(dir,"large"),large=structuredClone(seed);
  large.entries=Array.from({length:1205},(_,i)=>({...base,id:"large-"+i,title:"海报 "+i,description:"长说明".repeat(600)}));
  assert.equal(parseCatalog(large).entries.length,1205);await atomicWrite(path.join(largeDir,"catalog.json"),large);
  const store=createStore(largeDir);const page=await store.listPosters({page:61,pageSize:20});assert.equal(page.total,1205);assert.equal(page.items.length,5);
  const r=(await store.getPoster("large-1204")).record;
  await store.updatePoster(r.draft.id,{...r.draft,title:"第1205张更新"},r.version,"publish");
  const restored=createStore(largeDir);assert.equal((await restored.snapshot()).catalog.entries.length,1205);
  const small=await restored.snapshot(true);assert.deepEqual(small.catalog.entries,[]);assert.ok(JSON.stringify(small).length<5000);
  await restored.saveSection("home",{brand:large.brand,heading:"海量海报首页",cdnDomain:large.cdnDomain},small.sectionRevisions.home);
  assert.equal((await restored.snapshot()).catalog.entries.at(-1).title,"第1205张更新");
  const password=randomBytes(24).toString("base64url");await setPassword(largeDir,password);
  const big=await createApp({directory:largeDir});const bigServer=big.app.listen(0,"127.0.0.1");await new Promise(resolve=>bigServer.once("listening",resolve));
  try{
    const url="http://127.0.0.1:"+bigServer.address().port;
    const login=await fetch(url+"/api/admin/login",{method:"POST",headers:{origin:url,"content-type":"application/json"},body:JSON.stringify({password})});
    const token=login.headers.get("set-cookie").split(";")[0],secret=(await login.json()).csrf,headers={origin:url,cookie:token,"x-csrf-token":secret,"content-type":"application/json"};
    const page=await(await fetch(url+"/api/admin/posters?page=61&pageSize=20",{headers})).json();assert.equal(page.total,1205);assert.equal(page.items.length,5);
    const current=(await(await fetch(url+"/api/admin/posters/large-1204",{headers})).json()).record;
    const update=await fetch(url+"/api/admin/posters/large-1204",{method:"PUT",headers,body:JSON.stringify({draft:{...current.draft,title:"HTTP独立保存成功"},version:current.version,action:"publish"})});assert.equal(update.status,200);
    const add=await fetch(url+"/api/admin/posters",{method:"POST",headers,body:JSON.stringify({draft:{...base,title:"超过1205张仍可新增"}})});assert.equal(add.status,201);
    const metadata=await(await fetch(url+"/api/admin/content?excludePosters=1",{headers})).text();assert.ok(metadata.length<5000);
    const published=await(await fetch(url+"/catalog.json")).text();assert.ok(published.length>1000000);assert.equal(JSON.parse(published).entries.length,1205);
  }finally{big.dispose();await new Promise(resolve=>bigServer.close(resolve));}

});
test("independent section versions survive poster changes and reject competing changes to the same section",async()=>{
  const snapshot=await(await call("content?excludePosters=1")).json();
  let r=await create({title:"海报操作不影响栏目保存"});await update(r,{},"publish");
  const value={contacts:[{id:"section-contact",label:"客服",value:"客服文字"}]};
  const save=await call("content/sections/contact","PUT",{value,revision:snapshot.sectionRevisions.contact});assert.equal(save.status,200);
  const stale=await call("content/sections/contact","PUT",{value:{contacts:[]},revision:snapshot.sectionRevisions.contact});assert.equal(stale.status,409);
  const disk=await createStore(dir).snapshot();assert.ok(disk.catalog.entries.some(p=>p.id===r.draft.id));assert.equal(disk.catalog.contacts[0].value,"客服文字");
});
test("draft validation rejects dangerous paths and invalid fields while permitting incomplete safe drafts",()=>{
  assert.doesNotThrow(()=>posterDraft({title:""},"blank"));
  for(const key of ["https://example.com/x.jpg","/images/a.jpg","../secret","images/../a","images/a.jpg?x=1","images\\a.jpg"]){
    assert.throws(()=>posterDraft({...base,image:{...base.image,objectKey:key}},"bad"),/图片路径/);
  }
  assert.throws(()=>publishable(posterDraft({},"blank")),/尚缺/);
});
test("CDN metadata reads small real image headers, handles rotated JPEG and refuses private destinations",async()=>{
  for(const ip of ["127.0.0.1","10.1.1.1","172.16.0.1","192.168.1.1","169.254.169.254","::1","::ffff:127.0.0.1","fc00::1","2001:db8::1"])assert.equal(publicAddress(ip),false,ip);
  for(const ip of ["1.1.1.1","8.8.8.8","2606:4700:4700::1111"])assert.equal(publicAddress(ip),true,ip);
  for(const format of ["png","webp","jpeg"]){
    const data=await sharp({create:{width:1200,height:1800,channels:3,background:"#abcdef"}})[format]().toBuffer();
    const size=await cdnImageInfo("images.example.com","images/海报 空格."+format,async(url,bytes)=>{assert.match(url.href,/images\/%E6%B5%B7%E6%8A%A5%20%E7%A9%BA%E6%A0%BC/);assert.equal(bytes,65536);return data.subarray(0,bytes);});
    assert.deepEqual(size,{width:1200,height:1800});
  }
  const rotated=await sharp({create:{width:100,height:200,channels:3,background:"#abc"}}).withMetadata({orientation:6}).jpeg().toBuffer();
  assert.deepEqual(await cdnImageInfo("images.example.com","rotated.jpg",async()=>rotated),{width:200,height:100});
  await assert.rejects(cdnImageInfo("images.example.com","../admin",async()=>Buffer.alloc(0)),/路径/);
  await assert.rejects(cdnImageInfo("images.example.com","x.jpg",async()=>Buffer.from("not an image")),/无法自动读取/);
});
