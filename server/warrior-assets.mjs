import { mkdir, writeFile, readFile, copyFile, rm, access, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHmac, createHash } from "node:crypto";
import https from "node:https";
import sharp from "sharp";
import { problem } from "./posters.mjs";

const variants = ["original",360,600,900,1200,1800,2500].map(v=>v+".webp");
export function cosConfiguration(env=process.env) {
  if (env.WARRIOR_STORAGE !== "cos") return null;
  const { COS_BUCKET:bucket, COS_REGION:region, COS_SECRET_ID:secretId, COS_SECRET_KEY:secretKey, COS_SECURITY_TOKEN:securityToken }=env;
  if (!/^[a-z0-9-]+-\d+$/.test(bucket||"") || !/^ap-[a-z0-9-]+$/.test(region||"") || !secretId || !secretKey) throw problem("COS 上传配置未完成，请配置桶名、地域与服务器密钥。",503);
  return {bucket,region,secretId,secretKey,securityToken};
}
export function cosAuthorization(config,key,now=Math.floor(Date.now()/1000)) {
  const host=config.bucket+".cos."+config.region+".myqcloud.com", encoded="/"+key.split("/").map(encodeURIComponent).join("/");
  const time=(now-30)+";"+(now+600), hmac=(key,text)=>createHmac("sha1",key).update(text).digest("hex");
  const signedHeaders="host"+(config.securityToken?";x-cos-security-token":"");
  const headerString="host="+encodeURIComponent(host)+(config.securityToken?"&x-cos-security-token="+encodeURIComponent(config.securityToken):"");
  const string="put\n"+encoded+"\n\n"+headerString+"\n";
  const signature=hmac(hmac(config.secretKey,time),"sha1\n"+time+"\n"+createHash("sha1").update(string).digest("hex")+"\n");
  return {host,encoded,authorization:`q-sign-algorithm=sha1&q-ak=${config.secretId}&q-sign-time=${time}&q-key-time=${time}&q-header-list=${signedHeaders}&q-url-param-list=&q-signature=${signature}`};
}
async function cosPut(config,key,body) {
  const {host,encoded,authorization}=cosAuthorization(config,key);
  await new Promise((resolve,reject)=>{
    const req=https.request({hostname:host,path:encoded,method:"PUT",headers:{Host:host,Authorization:authorization,"Content-Type":"image/webp","Content-Length":body.length,"Cache-Control":"public, max-age=31536000, immutable",...(config.securityToken?{"x-cos-security-token":config.securityToken}:{})}},res=>{
      res.resume();res.on("end",()=>res.statusCode>=200&&res.statusCode<300?resolve():reject(problem("COS 上传失败（"+res.statusCode+"），原发布内容未改变。",502)));
    });
    const timer=setTimeout(()=>req.destroy(new Error("timeout")),15000);req.on("close",()=>clearTimeout(timer));
    req.on("error",()=>reject(problem("无法连接 COS，请检查服务器上传配置后重试。",502)));req.end(body);
  });
}
export function warriorAssets(directory,{config=()=>cosConfiguration(),put=cosPut,quotaBytes=Number(process.env.WARRIOR_UPLOAD_QUOTA_MB||512)*1024*1024}={}) {
  const base=path.join(directory,"warrior-private");
  const manifest=async id=>{try{return JSON.parse(await readFile(path.join(base,id,"owner.json"),"utf8"));}catch(e){if(e.code==="ENOENT")return null;throw e;}};
  return {
    manifest,
    isPublic:async(id,file)=>{try{await access(path.join(directory,"uploads",id,file));return true;}catch{return false;}},
    privateFile:(id,file)=>path.join(base,id,file),
    upload:async(buffer,profileId)=>{
      if(!Number.isFinite(quotaBytes)||quotaBytes<=0)throw problem("图片空间配置无效，请联系管理员。",503);
      let meta;try{meta=await sharp(buffer,{limitInputPixels:40000000}).metadata();}catch{throw problem("图片无法识别，或超过 4000 万像素。");}
      if(!["jpeg","png","webp"].includes(meta.format)||(meta.pages??1)>1)throw problem("请选择静态 JPG、PNG 或 WebP 图片。");
      const id=randomUUID(), folder=path.join(base,id);await mkdir(folder,{recursive:true});
      try{
        const output=await sharp(buffer,{limitInputPixels:40000000}).rotate().webp({quality:95}).toFile(path.join(folder,"original.webp"));
        for(const width of [360,600,900,1200,1800,2500])await sharp(buffer,{limitInputPixels:40000000}).rotate().resize({width,withoutEnlargement:true}).webp({quality:84}).toFile(path.join(folder,width+".webp"));
        const asset={source:"upload",objectKey:id+"/original.webp",width:output.width,height:output.height,alt:"武将介绍"};
        const bytes=(await Promise.all(variants.map(file=>stat(path.join(folder,file))))).reduce((total,s)=>total+s.size,0);
        const folders=await readdir(base);let used=0;
        for(const other of folders){const owner=await manifest(other);if(owner?.profileId===profileId)used+=owner.bytes||0;}
        if(used+bytes>quotaBytes)throw problem("个人图片空间已满，请联系管理员整理未使用的图片。");
        await writeFile(path.join(folder,"owner.json"),JSON.stringify({profileId,asset,bytes,createdAt:Date.now()}),{mode:0o600});return asset;
      }catch(e){await rm(folder,{recursive:true,force:true});throw e;}
    },
    owned:async(draft,record)=>{
      const published=[record.published?.avatar,...(record.published?.images||[]).map(p=>p.image)].filter(Boolean);
      for(const asset of [draft.avatar,...draft.images.map(p=>p.image)].filter(Boolean)){
        if(asset.source==="upload"){
          const owner=await manifest(asset.objectKey.split("/")[0]);
          if(owner?.profileId!==record.draft.id || asset.width!==owner.asset.width || asset.height!==owner.asset.height)throw problem("只能使用自己上传的图片，图片尺寸由服务器读取。",403);
        }else if(!published.some(i=>i.source===asset.source&&i.objectKey===asset.objectKey&&i.width===asset.width&&i.height===asset.height))throw problem("只能使用自己已审核的图片或重新上传图片。",403);
      }
    },
    publish:async draft=>{
      const result=structuredClone(draft), settings=config();
      const release=async asset=>{
        if(!asset||asset.source!=="upload")return asset;
        const id=asset.objectKey.split("/")[0], owner=await manifest(id);if(!owner)return asset;
        if(owner.profileId!==draft.id)throw problem("图片不属于当前武将。",403);
        if(settings){
          const key="images/warriors/"+draft.id+"/"+id+".webp";
          await put(settings,key,await readFile(path.join(base,id,"original.webp")));return {...asset,source:"cdn",objectKey:key};
        }
        const target=path.join(directory,"uploads",id);await mkdir(target,{recursive:true});
        for(const file of variants)await copyFile(path.join(base,id,file),path.join(target,file));return asset;
      };
      result.avatar=await release(result.avatar);for(const photo of result.images)photo.image=await release(photo.image);
      return result;
    },
  };
}
