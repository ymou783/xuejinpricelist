import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../app.mjs";
import { setPassword } from "../auth.mjs";
import { warriorAssets, cosAuthorization, cosConfiguration } from "../warrior-assets.mjs";
import { createStore } from "../store.mjs";
let dir,instance,server,origin,admin;
const password=randomBytes(24).toString("base64url");
const image=await sharp({create:{width:120,height:180,channels:3,background:"#556bc4"}}).png().toBuffer();
async function call(url,method="GET",body,actor=admin,headers={}){
 return fetch(origin+url,{method,headers:{origin,...(actor?{cookie:actor.cookie,"x-csrf-token":actor.csrf}:{}),...(body?{"content-type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined});
}
async function json(res,status=200){assert.equal(res.status,status,await res.clone().text());return res.json();}
async function invite(){return json(await call("/api/admin/warrior-invites","POST",{label:"测试邀请"}));}
async function actor(token,username="user_"+randomBytes(5).toString("hex")){
 const res=await call("/api/warrior/register","POST",{username,password,invite:token},null);const data=await json(res);return {cookie:res.headers.get("set-cookie").split(";")[0],csrf:data.csrf,profileId:data.profileId,username};
}
async function profile(a){return (await json(await call("/api/warrior/profile","GET",undefined,a))).record;}
async function save(a,r,fields={},action="draft"){return json(await call("/api/warrior/profile","PUT",{draft:{...r.draft,...fields},version:r.version,action},a));}
async function upload(a,buffer=image){const form=new FormData();form.append("image",new Blob([buffer],{type:"image/png"}),"photo.png");return fetch(origin+"/api/warrior/upload",{method:"POST",headers:{origin,cookie:a.cookie,"x-csrf-token":a.csrf},body:form});}
async function review(r,decision="approve",reason=""){return json(await call("/api/admin/warriors/"+r.draft.id+"/review","POST",{version:r.version,submissionId:r.submission.id,decision,reason}));}
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),"xuejin-portal-test-"));await setPassword(dir,password);instance=await createApp({directory:dir});server=instance.app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));origin="http://127.0.0.1:"+server.address().port;
 const res=await call("/api/admin/login","POST",{password},null);const data=await json(res);admin={cookie:res.headers.get("set-cookie").split(";")[0],csrf:data.csrf};
});
after(async()=>{instance.dispose();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
test("invitation registration consumes codes once atomically and never exposes hashes",async()=>{
 const i=await invite();const results=await Promise.all([call("/api/warrior/register","POST",{username:"race_one",password,invite:i.token},null),call("/api/warrior/register","POST",{username:"race_two",password,invite:i.token},null)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 const cookie=results.find(r=>r.status===200).headers.get("set-cookie");assert.ok(cookie.includes("HttpOnly")&&cookie.includes("SameSite=Strict"));
 const list=await json(await call("/api/admin/warrior-invites"));assert.ok(list.items.some(v=>v.id===i.id&&v.usedAt));assert.ok(list.items.every(v=>!v.hash&&!v.token));
 const publicData=await(await fetch(origin+"/catalog.json")).json();for(const key of ["_warriorLibrary","_warriorAccounts","_warriorInvites"])assert.equal(publicData[key],undefined);
 const revoked=await invite();await json(await call("/api/admin/warrior-invites/"+revoked.id+"/revoke","POST",{}));assert.equal((await call("/api/warrior/register","POST",{username:"revoked",password,invite:revoked.token},null)).status,400);
});
test("self-service requests require login, origin and CSRF and cannot change other profiles or admin fields",async()=>{
 const a=await actor((await invite()).token),b=await actor((await invite()).token),r=await profile(a);
 assert.equal((await call("/api/warrior/profile","GET",undefined,null)).status,401);
 assert.equal((await call("/api/admin/warriors","GET",undefined,a)).status,401);
 for(const headers of [{origin:"https://example.org"},{"x-csrf-token":""}])assert.equal((await call("/api/warrior/profile","PUT",{version:r.version,draft:r.draft,action:"draft"},a,headers)).status,403);
 for(const fields of [{id:b.profileId},{recommended:true},{posterIds:["basic-price-list"]}])assert.equal((await call("/api/warrior/profile","PUT",{version:r.version,draft:{...r.draft,...fields},action:"draft"},a)).status,403);
 assert.equal((await json(await call("/api/warrior/profile?profileId="+b.profileId,"GET",undefined,a))).record.draft.id,a.profileId);
});
test("unapproved uploads are private and ownership/dimensions are enforced; approval publishes real optimized variants",async()=>{
 const a=await actor((await invite()).token),b=await actor((await invite()).token);let r=await profile(a);const asset=await json(await upload(a),201);assert.equal(asset.width,120);assert.equal(asset.height,180);
 const url=origin+"/uploads/"+asset.objectKey.split("/")[0]+"/360.webp";
 assert.equal((await fetch(url)).status,404);assert.equal((await fetch(url,{headers:{cookie:b.cookie}})).status,404);assert.equal((await fetch(url,{headers:{cookie:a.cookie}})).status,200);assert.equal((await fetch(url,{headers:{cookie:admin.cookie}})).status,200);
 const rb=await profile(b);assert.equal((await call("/api/warrior/profile","PUT",{draft:{...rb.draft,avatar:asset},version:rb.version,action:"draft"},b)).status,403);
 assert.equal((await call("/api/warrior/profile","PUT",{draft:{...r.draft,avatar:{...asset,width:999}},version:r.version,action:"draft"},a)).status,403);
 r=(await save(a,r,{name:"自助测试武将",avatar:asset,images:[{id:"shot",title:"战绩",image:asset}]},"submit")).record;
 assert.ok(!(await(await fetch(origin+"/catalog.json")).json()).warriors.some(w=>w.id===r.draft.id));
 r=(await review(r)).record;const published=(await(await fetch(origin+"/catalog.json")).json()).warriors.find(w=>w.id===r.draft.id);assert.equal(published.name,"自助测试武将");
 const publicImage=await fetch(url);assert.equal(publicImage.status,200);assert.equal((await sharp(Buffer.from(await publicImage.arrayBuffer())).metadata()).format,"webp");
 assert.equal((await upload(a,Buffer.from('<svg><script>alert(1)</script></svg>'))).status,400);
});
test("submissions are immutable, withdrawal invalidates approval, rejection is private, last published snapshot survives",async()=>{
 const a=await actor((await invite()).token);let r=await profile(a);r=(await save(a,r,{name:"已发布昵称"},"submit")).record;r=(await review(r)).record;
 r=(await save(a,r,{name:"新昵称待审核"},"submit")).record;const old=r;
 assert.equal((await call("/api/admin/warriors/"+r.draft.id+"/review","POST",{submissionId:r.submission.id,decision:"approve"})).status,400);
 assert.equal((await call("/api/warrior/profile","PUT",{draft:{...r.draft,name:"偷偷换内容"},version:r.version,action:"draft"},a)).status,409);
 r=(await save(a,r,{},"withdraw")).record;
 assert.equal((await call("/api/admin/warriors/"+r.draft.id+"/review","POST",{version:old.version,submissionId:old.submission.id,decision:"approve"})).status,409);
 r=(await save(a,r,{},"submit")).record;r=(await review(r,"reject","请补充你的擅长玩法")).record;
 assert.equal((await profile(a)).rejection,"请补充你的擅长玩法");const publicData=await(await fetch(origin+"/catalog.json")).json();assert.equal(publicData.warriors.find(w=>w.id===r.draft.id).name,"已发布昵称");assert.ok(!JSON.stringify(publicData).includes("请补充你的擅长玩法"));
 r=(await save(a,r,{maps:"教学"},"submit")).record;r=(await review(r)).record;assert.equal((await(await fetch(origin+"/catalog.json")).json()).warriors.find(w=>w.id===r.draft.id).maps,"教学");
});
test("staged upload storage has a configurable capacity and failed uploads leave no image directory",async()=>{
 const tmp=await mkdtemp(path.join(tmpdir(),"xuejin-quota-test-"));try{
  const assets=warriorAssets(tmp,{quotaBytes:1});await assert.rejects(assets.upload(image,"warrior-quota"),/图片空间已满/);
  assert.deepEqual(await readdir(path.join(tmp,"warrior-private")),[]);
 }finally{await rm(tmp,{recursive:true,force:true});}
});
test("password reset codes are one-use, old sessions expire and disabled accounts cannot authenticate",async()=>{
 const a=await actor((await invite()).token);const account=(await json(await call("/api/admin/warrior-accounts?q="+a.username))).items[0];
 const reset=await json(await call("/api/admin/warrior-accounts/"+account.id+"/reset","POST",{}));const next=randomBytes(24).toString("hex");
 assert.equal((await call("/api/warrior/reset-password","POST",{token:reset.token,password:next},null)).status,200);
 assert.equal((await call("/api/warrior/profile","GET",undefined,a)).status,401);
 assert.equal((await call("/api/warrior/reset-password","POST",{token:reset.token,password:next},null)).status,400);
 const login=await call("/api/warrior/login","POST",{username:a.username,password:next},null);const data=await json(login);const logged={cookie:login.headers.get("set-cookie").split(";")[0],csrf:data.csrf};
 await json(await call("/api/admin/warrior-accounts/"+account.id,"PUT",{disabled:true}));assert.equal((await call("/api/warrior/profile","GET",undefined,logged)).status,401);
 assert.equal((await call("/api/warrior/login","POST",{username:a.username,password:next},null)).status,401);
 await json(await call("/api/admin/warrior-accounts/"+account.id,"PUT",{disabled:false}));assert.equal((await call("/api/warrior/login","POST",{username:a.username,password:next},null)).status,200);
});
test("COS publishing is opt-in, signs a fixed Tencent host and does not publish metadata after a transport failure",async()=>{
 assert.equal(cosConfiguration({}),null);assert.throws(()=>cosConfiguration({WARRIOR_STORAGE:"cos"}),/COS/);
 const config={bucket:"test-bucket-123456",region:"ap-shanghai",secretId:"test-id",secretKey:"test-key"},requests=[];
 const signing=cosAuthorization(config,"images/warriors/test/photo.webp",1700000000);assert.equal(signing.host,"test-bucket-123456.cos.ap-shanghai.myqcloud.com");assert.match(signing.authorization,/q-sign-algorithm=sha1/);assert.ok(!signing.authorization.includes(config.secretKey));
 const tmp=await mkdtemp(path.join(tmpdir(),"xuejin-cos-test-"));try{
   let fail=false;const assets=warriorAssets(tmp,{config:()=>config,put:async(_c,key,body)=>{if(fail)throw new Error("transport unavailable");requests.push({key,body});}});const store=createStore(tmp,assets.publish,assets.owned);
   let {record:r}=await store.createWarrior({name:"COS 测试"});const asset=await assets.upload(image,r.draft.id);r=(await store.updateWarrior(r.draft.id,{...r.draft,avatar:asset},r.version,"publish")).record;
   assert.equal(r.published.avatar.source,"cdn");assert.ok(requests[0].key.startsWith("images/warriors/"+r.draft.id+"/"));assert.equal((await sharp(requests[0].body).metadata()).format,"webp");
   fail=true;await assert.rejects(store.updateWarrior(r.draft.id,{...r.draft,name:"不该发布"},r.version,"publish"),/transport/);
   assert.equal((await store.snapshot()).catalog.warriors.find(w=>w.id===r.draft.id).name,"COS 测试");
 }finally{await rm(tmp,{recursive:true,force:true});}
});
