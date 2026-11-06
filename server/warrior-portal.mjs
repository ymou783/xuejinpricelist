import multer from "multer";
import { randomBytes } from "node:crypto";
import { credentials, usernameOf } from "./warrior-accounts.mjs";
import { verifyPassword } from "./auth.mjs";
const cookie="xuejin_warrior",ttl=8*3600000;
export function installWarriorPortal({app,store,assets,sameOrigin,adminAuthenticate,adminCsrf,adminSession,cookieOptions,secureEqual}) {
  const sessions=new Map(),attempts=new Map(),uploads=new Map(),activeUploads=new Set();let signing=0,processing=0;
  const purge=setInterval(()=>{for(const [k,s]of sessions)if(s.expires<Date.now())sessions.delete(k);for(const [k,s]of attempts)if(s.until<Date.now())attempts.delete(k);for(const [k,s]of uploads)if(s.until<Date.now())uploads.delete(k);},60000);purge.unref();
  const tokenOf=req=>req.headers.cookie?.split(";").map(s=>s.trim()).find(s=>s.startsWith(cookie+"="))?.slice(cookie.length+1);
  async function session(req){
    const token=tokenOf(req),s=token&&sessions.get(token);if(!s||s.expires<Date.now()){if(token)sessions.delete(token);return null;}
    const a=await store.getWarriorAccount(s.id);if(!a||a.disabled||a.authVersion!==s.authVersion){sessions.delete(token);return null;}return {token,...s,account:a};
  }
  const auth=async(req,res,next)=>{const s=await session(req);if(!s)return res.status(401).json({error:"请先登录武将账号，或联系管理员确认账号状态。"});req.warriorSession=s;next();};
  const csrf=(req,res,next)=>secureEqual(req.get("x-csrf-token"),req.warriorSession.csrf)?next():res.status(403).json({error:"请重新登录后重试。"});
  const start=(req,res,a)=>{const old=tokenOf(req);if(old)sessions.delete(old);const token=randomBytes(32).toString("hex"),s={id:a.id,authVersion:a.authVersion,csrf:randomBytes(32).toString("hex"),expires:Date.now()+ttl};sessions.set(token,s);res.cookie(cookie,token,cookieOptions(req));res.json({authenticated:true,username:a.username,profileId:a.profileId,csrf:s.csrf});};
  const limited=async(req,res,work)=>{
    const key=req.ip,previous=attempts.get(key);if(previous?.until>Date.now()&&previous.count>=12)return res.status(429).json({error:"尝试次数较多，请 15 分钟后重试。"});
    if(signing>=4)return res.status(429).json({error:"正在处理登录，请稍后重试。"});
    if(attempts.size>10000)attempts.clear();attempts.set(key,{count:(previous?.until>Date.now()?previous.count:0)+1,until:Date.now()+900000});signing++;
    try{await work();attempts.delete(key);}finally{signing--;}
  };
  app.get("/api/warrior/session",async(req,res)=>{const s=await session(req);res.json(s?{authenticated:true,username:s.account.username,profileId:s.account.profileId,csrf:s.csrf}:{authenticated:false});});
  app.post("/api/warrior/register",sameOrigin,(req,res)=>limited(req,res,async()=>{
    const username=usernameOf(req.body?.username),password=await credentials(req.body?.password);
    const {account}=await store.registerWarrior(username,password,req.body?.invite);start(req,res,await store.getWarriorAccount(account.id));
  }));
  app.post("/api/warrior/login",sameOrigin,(req,res)=>limited(req,res,async()=>{
    const username=usernameOf(req.body?.username),a=await store.getWarriorCredentials(username);
    const valid=await verifyPassword(a||{salt:"0".repeat(64),key:"0".repeat(128)},req.body?.password);
    if(!valid||!a||a.disabled){const e=new Error("账号、密码不正确或账号已停用。");e.status=401;throw e;}start(req,res,a);
  }));
  app.post("/api/warrior/reset-password",sameOrigin,(req,res)=>limited(req,res,async()=>res.json(await store.resetWarriorPassword(req.body?.token,await credentials(req.body?.password)))));
  app.get("/api/warrior/profile",auth,async(req,res)=>{const result=await store.selfWarrior(req.warriorSession.account.profileId);const {catalog}=await store.snapshot(true);res.json({...result,cdnDomain:catalog.cdnDomain});});
  app.put("/api/warrior/profile",sameOrigin,auth,csrf,async(req,res)=>{const a=req.warriorSession.account;res.json(await store.saveSelfWarrior(a.profileId,a.id,req.body?.draft,req.body?.version,req.body?.action));});
  app.post("/api/warrior/logout",sameOrigin,auth,csrf,(req,res)=>{sessions.delete(req.warriorSession.token);res.clearCookie(cookie,{...cookieOptions(req),maxAge:undefined});res.json({ok:true});});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:1,fields:0}});
  app.post("/api/warrior/upload",sameOrigin,auth,csrf,(req,res,next)=>{
    const key=req.warriorSession.account.id,prev=uploads.get(key);
    if(processing>=2||activeUploads.has(key))return res.status(429).json({error:"图片正在处理中，请稍后再试。"});
    if(prev?.until>Date.now()&&prev.count>=20)return res.status(429).json({error:"图片上传较频繁，请稍后再试。"});
    uploads.set(key,{count:(prev?.until>Date.now()?prev.count:0)+1,until:Date.now()+600000});processing++;activeUploads.add(key);
    let done=false;const release=()=>{if(!done){done=true;processing--;activeUploads.delete(key);}};
    req.releaseWarriorUpload=release;req.warriorImageProcessing=false;
    const earlyRelease=()=>{if(!req.warriorImageProcessing)release();};res.once("finish",earlyRelease);res.once("close",earlyRelease);next();
  },upload.single("image"),async(req,res)=>{
    req.warriorImageProcessing=true;
    try{if(!req.file)return res.status(400).json({error:"请选择图片。"});res.status(201).json(await assets.upload(req.file.buffer,req.warriorSession.account.profileId));}finally{req.releaseWarriorUpload();}
  });
  app.get("/uploads/:id/:file",async(req,res,next)=>{
    if(!/^[a-f0-9-]{36}$/.test(req.params.id)||!/^(original|360|600|900|1200|1800|2500)\.webp$/.test(req.params.file))return next();
    const owner=await assets.manifest(req.params.id);if(!owner)return next();
    // Published local variants use the public copy; staged images require ownership or admin login.
    if(await assets.isPublic(req.params.id,req.params.file))return next();
    const admin=adminSession(req),s=admin?null:await session(req);
    res.set("Cache-Control","no-store");if(!admin&&s?.account.profileId!==owner.profileId)return res.status(404).end();
    res.sendFile(assets.privateFile(req.params.id,req.params.file));
  });
  app.get("/api/admin/warrior-invites",adminAuthenticate,async(_req,res)=>res.json(await store.listWarriorInvites()));
  app.post("/api/admin/warrior-invites",adminAuthenticate,sameOrigin,adminCsrf,async(req,res)=>res.json(await store.createWarriorInvite(req.body?.label)));
  app.post("/api/admin/warrior-invites/:id/revoke",adminAuthenticate,sameOrigin,adminCsrf,async(req,res)=>res.json(await store.revokeWarriorInvite(req.params.id)));
  app.get("/api/admin/warrior-accounts",adminAuthenticate,async(req,res)=>res.json(await store.listWarriorAccounts(req.query)));
  app.post("/api/admin/warrior-accounts/:id/reset",adminAuthenticate,sameOrigin,adminCsrf,async(req,res)=>res.json(await store.createWarriorInvite("重置密码",req.params.id)));
  app.put("/api/admin/warrior-accounts/:id",adminAuthenticate,sameOrigin,adminCsrf,async(req,res)=>res.json(await store.disableWarriorAccount(req.params.id,req.body?.disabled)));
  app.post("/api/admin/warriors/:id/review",adminAuthenticate,sameOrigin,adminCsrf,async(req,res)=>res.json(await store.reviewWarrior(req.params.id,req.body?.version,req.body?.submissionId,req.body?.decision,req.body?.reason,req.body?.controls)));
  return ()=>{clearInterval(purge);sessions.clear();};
}
