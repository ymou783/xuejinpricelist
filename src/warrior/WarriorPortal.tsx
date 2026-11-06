import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, LogOut, Save, Send, Shield, UserRound } from "lucide-react";
import wordmark from "../assets/wordmark.webp";
import type { ImageAsset, Warrior } from "../catalog";
import { ApiError, warriorRequest } from "../admin/api";
import { AdminDialog } from "../admin/AdminDialog";
import { WarriorFields } from "../components/WarriorFields";
import { WarriorProfile } from "../components/WarriorPanel";
import { normalizedWarrior, type ManagedWarrior } from "../warriorTypes";
import "../admin/admin.css";
import "./portal.css";
const ImageViewer=lazy(()=>import("../components/ImageViewer"));
interface Session{authenticated:boolean;username?:string;csrf?:string}
export default function WarriorPortal(){
  const initial=new URLSearchParams(location.hash.slice(1));
  const [session,setSession]=useState<Session>({authenticated:false}),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[uploads,setUploads]=useState(0);
  const [mode,setMode]=useState<"login"|"register"|"reset">(initial.has("invite")?"register":initial.has("reset")?"reset":"login");
  const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[token,setToken]=useState(initial.get("invite")||initial.get("reset")||"");
  const [saved,setSaved]=useState<ManagedWarrior|null>(null),[draft,setDraft]=useState<Warrior|null>(null),[domain,setDomain]=useState("img.xuejinclub.com");
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[preview,setPreview]=useState(false),[image,setImage]=useState<{title:string;image:ImageAsset}|null>(null);
  const dirty=!!draft&&!!saved&&JSON.stringify(draft)!==JSON.stringify(saved.draft);
  const onError=(e:unknown)=>{if(e instanceof ApiError&&e.status===401){setSession({authenticated:false});setSaved(null);setDraft(null);}setError(e instanceof Error?e.message:"操作失败，请重试。");};
  const load=async()=>{const result=await warriorRequest<{record:ManagedWarrior;cdnDomain:string}>("profile");setSaved(result.record);setDraft(result.record.draft);setDomain(result.cdnDomain);};
  useEffect(()=>{const update=()=>{const params=new URLSearchParams(location.hash.slice(1));if(params.has("reset")||params.has("invite")){setMode(params.has("reset")?"reset":"register");setToken((params.get("reset")??params.get("invite")??"").slice(0,100));setError("");setNotice("");}};update();window.addEventListener("hashchange",update);return()=>window.removeEventListener("hashchange",update);},[]);
  useEffect(()=>{document.title="武将入口｜雪烬电竞";let cancelled=false;void warriorRequest<Session>("session").then(async s=>{if(cancelled)return;setSession(s);if(s.authenticated)await load();}).catch(e=>{if(!cancelled)onError(e);}).finally(()=>{if(!cancelled)setChecking(false);});return()=>{cancelled=true;};},[]);
  useEffect(()=>{if(!dirty&&!uploads)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty,uploads]);
  const authenticate=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      if(mode==="reset"){await warriorRequest("reset-password",{method:"POST",body:JSON.stringify({token,password})});setSession({authenticated:false});setSaved(null);setDraft(null);setMode("login");setNotice("密码已更新，请使用新密码登录。");}
      else{const s=await warriorRequest<Session>(mode,{method:"POST",body:JSON.stringify({username,password,invite:token})});setSession(s);await load();}
      setPassword("");setToken("");history.replaceState(null,"",location.pathname);
    }catch(e){onError(e);}finally{setBusy(false);}
  };
  const run=async(action:"draft"|"submit"|"withdraw")=>{
    if(!draft||!saved||busy||uploads)return;
    if(action==="withdraw"&&!confirm("撤回这次待审核资料，继续修改？当前公开版本会保留。"))return;
    setBusy(true);setError("");setNotice("");
    try{const result=await warriorRequest<{record:ManagedWarrior}>("profile",{method:"PUT",body:JSON.stringify({draft:normalizedWarrior(draft),version:saved.version,action})},session.csrf);setSaved(result.record);setDraft(result.record.draft);setNotice(action==="submit"?"已提交审核，请等待管理员处理。":action==="withdraw"?"已撤回，可以继续修改。":"草稿已保存。");}
    catch(e){onError(e);}finally{setBusy(false);}
  };
  const logout=async()=>{if(dirty&&!confirm("有未保存的资料，仍要退出？"))return;setBusy(true);try{await warriorRequest("logout",{method:"POST"},session.csrf);setSession({authenticated:false});setSaved(null);setDraft(null);setMode("login");setToken("");setError("");setNotice("");history.replaceState(null,"",location.pathname);}catch(e){onError(e);}finally{setBusy(false);}};
  const openImage=(id:string)=>{const asset=id==="avatar"?draft?.avatar:draft?.images.find(p=>p.id===id)?.image;if(asset)setImage({title:draft?.name||"武将介绍",image:asset});};
  if(checking)return <div className="app-loading" role="status">正在检查登录状态…</div>;
  return <div className="warrior-portal"><header className="portal-header"><a href="/"><img src={wordmark} alt="雪烬电竞" width={216} height={72}/></a><span>武将入口</span>{session.authenticated?<button className="button button-secondary" disabled={busy||uploads>0} onClick={()=>void logout()}><LogOut size={18}/>退出登录</button>:<a className="portal-back" href="/"><ArrowLeft size={17}/>返回网站</a>}</header>
    {!session.authenticated||(mode==="reset"&&!!token)?<main className="portal-login"><div className="portal-login-heading"><span className="portal-symbol"><Shield size={32}/></span><h1>{mode==="register"?"加入武将名册":mode==="reset"?"重置武将密码":"我的武将介绍"}</h1><p>自己填写与上传，审核通过后公开展示。</p></div>
      <div className="portal-auth-tabs" role="group" aria-label="武将登录方式">{([{id:"login",title:"账号登录"},{id:"register",title:"邀请码注册"},{id:"reset",title:"重置密码"}]as const).map(m=><button type="button" key={m.id} aria-pressed={mode===m.id} disabled={busy} onClick={()=>{setMode(m.id);setError("");setNotice("");}}>{m.title}</button>)}</div>
      <form onSubmit={e=>void authenticate(e)}><fieldset className="admin-fieldset" disabled={busy}>
        {mode!=="login"?<label className="form-field"><span>{mode==="register"?"邀请码":"重置码"}</span><input aria-label={mode==="register"?"邀请码":"重置码"} required maxLength={100} value={token} autoComplete="off" onChange={e=>setToken(e.target.value)}/></label>:null}
        {mode!=="reset"?<label className="form-field"><span>账号名</span><input aria-label="武将账号名" required minLength={3} maxLength={32} pattern="(?:[a-zA-Z0-9_]|-)+" placeholder="3–32 位字母、数字、下划线或短横线" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>:null}
        <label className="form-field"><span>{mode==="login"?"密码":"设置密码"}</span><input aria-label="武将密码" type="password" required minLength={12} maxLength={200} autoComplete={mode==="login"?"current-password":"new-password"} placeholder="至少 12 个字符" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button className="button button-primary" type="submit">{busy?"正在处理…":mode==="login"?"登录武将入口":mode==="register"?"注册并开始填写":"更新密码"}</button>
      </fieldset></form><p className="field-help">邀请码和重置码由管理员提供；管理员后台账号与武将账号分别使用。</p>
    </main>:<main className="portal-workspace"><div className="portal-workspace-heading"><div><p className="portal-eyebrow"><UserRound size={16}/>{session.username}</p><h1>我的武将介绍</h1></div>{draft?<button className="button button-secondary" onClick={()=>setPreview(true)}><Eye size={18}/>预览介绍</button>:null}</div>
      {saved&&draft?<><div className={"portal-review-state"+(saved.rejection?" is-rejected":"")}><button type="button" className="text-link" disabled={busy||uploads>0} onClick={()=>{if(!dirty||confirm("刷新将放弃未保存的修改，继续？"))void load().catch(onError);}}>刷新审核状态</button><strong>{saved.submission?"等待审核":saved.rejection?"已退回修改":saved.status==="published"?"已发布":saved.status==="offline"?"资料已下架":"尚未发布"}</strong><p>{saved.submission?"本次提交已固定。如需修改，请先撤回再重新提交。":saved.rejection||"修改后提交审核，审核通过前继续展示原发布版本。"}</p></div>
        <fieldset className="admin-fieldset" disabled={busy||uploads>0||!!saved.submission}><WarriorFields self draft={draft} csrf={session.csrf!} domain={domain} onChange={d=>{setDraft(d);setError("");setNotice("");}} onBusy={v=>setUploads(n=>n+(v?1:-1))} onError={onError}/></fieldset>
        <div className="portal-savebar">{saved.submission?<button className="button button-secondary" disabled={busy||uploads>0} onClick={()=>void run("withdraw")}>撤回修改</button>:<><button className="button button-secondary" disabled={busy||uploads>0} onClick={()=>void run("draft")}><Save size={18}/>保存草稿</button><button className="button button-primary" disabled={busy||uploads>0} onClick={()=>void run("submit")}><Send size={18}/>{busy?"正在处理…":"提交审核"}</button></>}<span role="status">{uploads?"正在处理图片…":dirty?"有未保存修改":"资料已保存"}</span></div>
      </>:<div className="admin-empty-message"><p>资料暂未加载。</p><button className="button button-secondary" onClick={()=>void load().catch(onError)}>重新加载资料</button></div>}
    </main>}
    <div className="portal-messages">{error?<div className="admin-error" role="alert">{error}{session.authenticated?<button type="button" className="text-link" onClick={()=>{if(!dirty||confirm("重新加载会放弃未保存的修改，继续？"))void load().then(()=>setError("")).catch(onError);}}>重新加载资料</button>:null}</div>:null}<p className="admin-notice" role="status">{notice}</p></div>
    {preview&&draft?<AdminDialog title="介绍预览" onClose={()=>setPreview(false)} wide><div className="admin-dialog-body"><WarriorProfile warrior={normalizedWarrior(draft)} domain={domain} onImage={openImage}/></div></AdminDialog>:null}
    {image?<Suspense fallback={null}><ImageViewer key={image.image.objectKey} poster={image} domain={domain} onClose={()=>setImage(null)}/></Suspense>:null}
  </div>;
}
