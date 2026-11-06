import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createApp } from "../app.mjs";
import { setPassword } from "../auth.mjs";
import { createStore } from "../store.mjs";
import { parseCatalog } from "../../src/catalog.ts";
let dir, instance, server, origin, cookie, csrf;
const seed = JSON.parse(await readFile(new URL("../../public/catalog.json", import.meta.url), "utf8"));
const image = seed.entries[0].image;
const call = (url, method="GET", body, headers={}) => fetch(origin+"/api/admin/"+url,{method,headers:{origin,cookie,"x-csrf-token":csrf,...(body?{"content-type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined});
const publicData = async () => (await (await fetch(origin+"/catalog.json")).json());
const create = async (draft={}) => {const res=await call("warriors","POST",{draft});assert.equal(res.status,201);return (await res.json()).record;};
const save = async (r,fields={},action="draft") => {const res=await call("warriors/"+r.draft.id,"PUT",{draft:{...r.draft,...fields},version:r.version,action});assert.equal(res.status,200,JSON.stringify(await res.clone().json()));return (await res.json()).record;};
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),"xuejin-warriors-test-"));const password=randomBytes(24).toString("base64url");await setPassword(dir,password);
 instance=await createApp({directory:dir});server=instance.app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));origin="http://127.0.0.1:"+server.address().port;
 const res=await fetch(origin+"/api/admin/login",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({password})});cookie=res.headers.get("set-cookie").split(";")[0];csrf=(await res.json()).csrf;
});
after(async()=>{instance.dispose();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
test("warrior APIs enforce authentication, origin and CSRF; old catalogs gain an empty directory",async()=>{
 assert.equal((await call("warriors","GET",undefined,{cookie:""})).status,401);
 for(const headers of [{origin:"https://example.org"},{"x-csrf-token":""}])assert.equal((await call("warriors","POST",{draft:{}},headers)).status,403);
 assert.equal((await(await call("session")).json()).warriorLibrary,true);
 const legacy={...seed};delete legacy.warriors;assert.deepEqual(parseCatalog(legacy).warriors,[]);
});
test("blank warrior drafts persist privately; publish needs a name and complete optional images",async()=>{
 let r=await create();r=await save(r,{summary:"私有介绍"});
 assert.equal((await call("warriors/"+r.draft.id,"PUT",{draft:r.draft,version:r.version,action:"publish"})).status,400);
 assert.ok(!(await publicData()).warriors.some(w=>w.id===r.draft.id));assert.equal((await publicData())._warriorLibrary,undefined);
 assert.equal((await createStore(dir).getWarrior(r.draft.id)).record.draft.summary,"私有介绍");
 const bad={...r.draft,name:"测试武将",avatar:{source:"cdn",objectKey:"images/a.jpg",width:0,height:0,alt:"头像"}};
 assert.equal((await call("warriors/"+r.draft.id,"PUT",{draft:bad,version:r.version,action:"publish"})).status,400);
 r=await save(r,{name:"仅昵称也能发布",summary:""},"publish");assert.equal((await publicData()).warriors.find(w=>w.id===r.draft.id).name,"仅昵称也能发布");
 const backup=JSON.parse(await readFile(path.join(dir,"catalog.json.before-warrior-library.bak"),"utf8"));assert.equal(backup._warriorLibrary,undefined);assert.deepEqual(backup.entries,seed.entries);
});
test("published warriors retain snapshots while edited; conflicts cannot overwrite or leak drafts",async()=>{
 let r=await create({name:"云影",tags:["技术","教学"],recommended:true,avatar:image,images:[{id:"photo-a",title:"介绍",image}],posterIds:[seed.entries[0].id]});r=await save(r,{},"publish");const old=r;
 r=await save(r,{name:"云影新草稿",bio:"未发布内容"});assert.equal((await publicData()).warriors.find(w=>w.id===r.draft.id).name,"云影");
 assert.equal((await call("warriors/"+r.draft.id,"PUT",{draft:old.draft,version:old.version,action:"publish"})).status,409);
 const small=(await(await call("content?excludePosters=1")).json());assert.deepEqual(small.catalog.warriors,[]);
 const saved=await call("content/sections/contact","PUT",{revision:small.sectionRevisions.contact,value:{contacts:[{id:"warrior-test-contact",label:"客服",value:"测试"}]}});assert.equal(saved.status,200);
 const snap=await(await call("content")).json();const legacy={...snap.catalog};delete legacy.warriors;
 assert.equal((await call("content","PUT",{catalog:legacy,revision:snap.revision})).status,200);
 assert.equal((await publicData()).warriors.find(w=>w.id===r.draft.id).name,"云影");assert.equal((await createStore(dir).getWarrior(r.draft.id)).record.draft.bio,"未发布内容");
 r=await save(r,{},"publish");assert.equal((await publicData()).warriors.find(w=>w.id===r.draft.id).name,"云影新草稿");
 r=await save(r,{},"offline");assert.ok(!(await publicData()).warriors.some(w=>w.id===r.draft.id));r=await save(r,{},"publish");
 assert.equal((await call("warriors/"+r.draft.id,"PUT",{version:r.version,action:"delete"})).status,200);assert.equal((await call("warriors/"+r.draft.id)).status,404);
 assert.deepEqual((await publicData()).entries,seed.entries);
});
test("warrior library pagination/search and cross-page ordering are persistent and reject stale sorting",async()=>{
 const rows=[];for(let i=0;i<14;i++){let r=await create({name:"分页武将 "+String(i).padStart(2,"0"),tags:["娱乐"]});r=await save(r,{},"publish");rows.push(r);}
 const list=await(await call("warriors?q="+encodeURIComponent("分页武将")+"&page=2")).json();assert.equal(list.items.length,6);assert.equal(list.pages,3);assert.equal(list.total,14);assert.equal(list.items[0].name,"分页武将 06");
 const all=await(await call("warriors")).json();const id=rows.at(-1).draft.id;
 assert.equal((await call("warriors/"+id+"/move","POST",{position:1,revision:all.revision})).status,200);
 assert.equal((await publicData()).warriors[0].id,id);
 assert.equal((await call("warriors/"+id+"/move","POST",{position:2,revision:all.revision})).status,409);
 assert.equal((await createStore(dir).listWarriors({})).items[0].id,id);
});
test("warrior validation rejects unsafe images, duplicate tags/photos and overlong descriptions",async()=>{
 for(const draft of [{name:"x",avatar:{...image,objectKey:"../secret"}},{name:"x",tags:["a".repeat(21)]},{name:"x",images:[{id:"a",title:"",image},{id:"a",title:"",image}]},{name:"x",posterIds:["../x"]},{name:"x",bio:"x".repeat(6001)}]){
  assert.equal((await call("warriors","POST",{draft})).status,400);
 }
 const raw={...seed,warriors:[{id:"x",name:"x",avatar:{...image,width:0}}]};assert.throws(()=>parseCatalog(raw),/武将/);
});
