import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, MessageCircle, Search, Share2, Shield, Star, UserRound, X } from "lucide-react";
import type { Catalog, ImageAsset, Poster, Warrior } from "../catalog";
import type { DirectoryState } from "../posterDirectory";
import { matchesTitle, titleTerms } from "../posterDirectory";
import { imageUrl } from "../cdn";
import { copyText } from "../clipboard";
import { ImagePreview } from "./ImagePreview";
import { routeHash } from "../hooks/usePageRoute";
import "./warriors.css";

export function WarriorAvatar({image,name,domain}:{image?:ImageAsset;name:string;domain:string}){
  const [failed,setFailed]=useState(false);
  return image&&!failed?<img key={image.objectKey} src={imageUrl(domain,image,360)} alt={image.alt||name} width={120} height={120} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span className="warrior-avatar-fallback" aria-label={name||"待补充头像"}>{name?Array.from(name)[0]:<UserRound size={42}/>}</span>;
}
export function WarriorProfile({warrior,domain,posters=[],onImage,onPoster,onContact}:{warrior:Warrior;domain:string;posters?:Poster[];onImage:(id:string)=>void;onPoster?:(poster:Poster)=>void;onContact?:()=>void}){
  return <div className="warrior-profile">
    <div className="warrior-profile-intro">
      {warrior.avatar?<button type="button" className="warrior-avatar warrior-avatar-button" aria-label="放大查看武将头像" onClick={()=>onImage("avatar")}><WarriorAvatar key={warrior.avatar.objectKey} image={warrior.avatar} name={warrior.name} domain={domain}/></button>:<div className="warrior-avatar"><WarriorAvatar name={warrior.name} domain={domain}/></div>}
      <div><div className="warrior-name-line"><h3>{warrior.name||"昵称待填写"}</h3>{warrior.recommended?<span className="warrior-recommended"><Star size={13}/>推荐</span>:null}</div>
        {warrior.tags.length?<div className="warrior-tags">{warrior.tags.map(tag=><span key={tag}>{tag}</span>)}</div>:null}
        {warrior.summary.trim()?<p className="warrior-summary">{warrior.summary}</p>:null}
      </div>
    </div>
    {([{key:"bio",label:"个人介绍"},{key:"maps",label:"擅长地图与玩法"},{key:"style",label:"服务风格"},{key:"notes",label:"下单须知"}]as const).map(f=>warrior[f.key].trim()?<section className="warrior-profile-section" key={f.key}><h4>{f.label}</h4><p>{warrior[f.key]}</p></section>:null)}
    {warrior.images.length?<section className="warrior-profile-section"><h4>介绍图片与战绩</h4><div className="warrior-gallery">{warrior.images.map(photo=>photo.image?<div key={photo.id}>{photo.title?<h5>{photo.title}</h5>:null}<ImagePreview key={photo.image.objectKey} variant="rights" image={photo.image} title={photo.title||warrior.name} domain={domain} onOpen={()=>onImage(photo.id)}/></div>:null)}</div></section>:null}
    {posters.length?<section className="warrior-profile-section"><h4>相关价目表</h4><div className="warrior-price-links">{posters.map(p=><a key={p.id} href={`#${p.category}/${p.id}`} onClick={e=>{if(!onPoster||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();onPoster(p);}}><span>{p.title}</span><ArrowRight size={18}/></a>)}</div></section>:null}
    {onContact?<button className="button button-primary" type="button" onClick={onContact}><MessageCircle size={18}/>联系客服咨询</button>:null}
  </div>;
}
interface Props{data:Catalog|null;status:string;activeId:string|null;state:DirectoryState&{tag:string};imageOpen:boolean;onRetry:()=>void;onBack:()=>void;onChange:(change:Partial<DirectoryState&{tag:string}>)=>void;onOpen:(id:string,page:number)=>void;onImage:(id:string)=>void;onPoster:(poster:Poster)=>void;onContact:()=>void}
export function WarriorPanel({data,status,activeId,state,imageOpen,onRetry,onBack,onChange,onOpen,onImage,onPoster,onContact}:Props){
  const dialog=useRef<HTMLDialogElement>(null),scroll=useRef<HTMLDivElement>(null);const [copied,setCopied]=useState(""),[error,setError]=useState(""),[jump,setJump]=useState("");
  const people=data?.warriors??[];
  const matched=useMemo(()=>people.filter(w=>(!state.tag||w.tags.includes(state.tag))&&(!state.newOnly||w.recommended)&&matchesTitle(w.name,titleTerms(state.query))).sort((a,b)=>Number(b.recommended)-Number(a.recommended)),[data,state.query,state.tag,state.newOnly]);
  const pages=Math.max(1,Math.ceil(matched.length/6)),selectedIndex=matched.findIndex(w=>w.id===state.selected);
  const page=selectedIndex>=0?Math.floor(selectedIndex/6)+1:Math.min(pages,Math.max(1,state.page)),items=matched.slice((page-1)*6,page*6);
  const active=activeId?people.find(w=>w.id===activeId):null;
  useEffect(()=>{setCopied("");setError("");},[activeId]);
  const tags=[...new Set(people.flatMap(w=>w.tags))];
  useLayoutEffect(()=>{const e=dialog.current,overflow=document.body.style.overflow;document.body.style.overflow="hidden";e?.showModal();return()=>{e?.close();document.body.style.overflow=overflow;};},[]);
  useLayoutEffect(()=>{scroll.current?.scrollTo({top:0});},[activeId,page,state.query,state.tag,state.newOnly]);
  useLayoutEffect(()=>{
    if(activeId||imageOpen||!state.selected)return;
    const frame=requestAnimationFrame(()=>{const card=Array.from(scroll.current?.querySelectorAll<HTMLElement>("[data-warrior-id]")??[]).find(e=>e.dataset.warriorId===state.selected);card?.scrollIntoView({block:"nearest"});card?.querySelector<HTMLAnchorElement>("a")?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);
  },[activeId,imageOpen,state.selected,page]);
  const copy=async(kind:"share"|"consult")=>{try{await copyText(kind==="share"?location.href.split("#")[0]+"#warriors/"+active!.id:`我想咨询【${active!.name}】的陪玩服务，请帮我确认安排。`,dialog.current??document.body);setCopied(kind);setError("");}catch{setError("复制暂时不可用，请选中文字手动复制。");}};
  return <dialog ref={dialog} className="content-panel directory-panel warrior-panel" aria-labelledby="warrior-panel-title" onCancel={e=>{e.preventDefault();onBack();}}>
    <header className="panel-header"><button type="button" className="icon-button" aria-label={activeId?"返回武将列表":"返回首页"} onClick={onBack}><ArrowLeft/></button><h2 id="warrior-panel-title">{activeId?active?.name||"武将介绍":"武将介绍"}</h2><button type="button" className="icon-button" aria-label="关闭武将介绍" onClick={onBack}><X/></button></header>
    {status!=="ready"?<div className="panel-empty"><p>{status==="loading"?"正在加载武将资料…":"武将资料暂时无法加载"}</p>{status==="error"?<button className="button button-primary" onClick={onRetry}>重新加载</button>:null}</div>:activeId?active?<>
      <div className="panel-scroll" ref={scroll}><WarriorProfile warrior={active} domain={data!.cdnDomain} posters={data!.entries.filter(p=>active.posterIds.includes(p.id))} onImage={onImage} onPoster={onPoster} onContact={onContact}/></div>
      <footer className="warrior-detail-footer"><button type="button" className="button button-secondary" onClick={()=>void copy("consult")}>{copied==="consult"?<Check size={17}/>:<Copy size={17}/>}复制咨询信息</button><button type="button" className="button button-secondary" onClick={()=>void copy("share")}><Share2 size={17}/>{copied==="share"?"链接已复制":"分享介绍"}</button><span role="status">{error||(copied==="consult"?"咨询信息已复制":"")}</span></footer>
    </>:<div className="panel-empty"><h3>这位武将暂未公开展示</h3><p>资料可能正在审核或已下架。</p><button className="button button-primary" onClick={onBack}>返回武将列表</button></div>:<>
      <div className="warrior-list-tools"><form className="directory-search" role="search" aria-label="搜索武将" onSubmit={e=>e.preventDefault()}><Search size={20}/><label className="sr-only" htmlFor="warrior-name-search">搜索武将昵称</label><input id="warrior-name-search" type="search" placeholder="搜索武将昵称" maxLength={80} value={state.query} onChange={e=>onChange({query:e.target.value,page:1})}/>{state.query?<button type="button" className="icon-button" aria-label="清空武将搜索" onClick={()=>onChange({query:"",page:1})}><X size={18}/></button>:null}</form>
        <div className="warrior-filters"><label><span className="sr-only">按标签筛选武将</span><select aria-label="武将标签筛选" value={state.tag} onChange={e=>onChange({tag:e.target.value,page:1})}><option value="">全部标签</option>{tags.map(t=><option key={t} value={t}>{t}</option>)}</select></label><button className="button button-secondary" type="button" aria-pressed={state.newOnly} onClick={()=>onChange({newOnly:!state.newOnly,page:1})}><Star size={17}/>{state.newOnly?"已选推荐":"只看推荐"}</button><span role="status">共 {matched.length} 位</span></div>
      </div>
      <div className="directory-scroll" ref={scroll}>{items.length?<div className="warrior-grid">{items.map(w=><article className={"warrior-card"+(state.selected===w.id?" is-selected":"")} data-warrior-id={w.id} key={w.id}><a href={routeHash({...state,section:"warriors",poster:w.id,page})} onClick={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();onOpen(w.id,page);}} aria-label={"查看武将："+w.name}>
        <div className="warrior-card-portrait"><div className="warrior-avatar"><WarriorAvatar key={w.avatar?.objectKey||w.id} image={w.avatar} name={w.name} domain={data!.cdnDomain}/></div>{w.recommended?<span className="warrior-recommended"><Star size={13}/>推荐</span>:null}</div>
        <div className="warrior-card-copy"><h3>{w.name}</h3>{w.tags.length?<div className="warrior-tags">{w.tags.map(t=><span key={t}>{t}</span>)}</div>:null}{w.summary.trim()?<p>{w.summary}</p>:null}<span className="warrior-card-more">查看介绍<ArrowRight size={16}/></span></div>
      </a></article>)}</div>:<div className="directory-empty"><Shield size={40}/><h3>{people.length?"没有找到匹配的武将":"武将资料整理中"}</h3><p>{people.length?"试试其他昵称或调整筛选条件。":"审核通过的武将介绍将在这里展示。"}</p>{state.query||state.tag||state.newOnly?<button className="button button-secondary" onClick={()=>onChange({query:"",tag:"",newOnly:false,page:1})}>清除搜索和筛选</button>:null}</div>}</div>
      <footer className="directory-pagination"><div className="directory-page-controls"><button className="button button-secondary" disabled={page<=1} onClick={()=>onChange({page:page-1})}><ArrowLeft size={18}/>上一页</button><span className="directory-page-number" role="status">第 {page} / {pages} 页</span><button className="button button-secondary" disabled={page>=pages} onClick={()=>onChange({page:page+1})}>下一页<ArrowRight size={18}/></button></div><form className="directory-page-jump" onSubmit={e=>{e.preventDefault();const p=Number(jump);if(Number.isInteger(p)&&p>=1&&p<=pages){onChange({page:p});setJump("");}}}><span>每页 6 位</span>{pages>1?<><input aria-label="武将跳转页码" type="number" min={1} max={pages} required value={jump} placeholder={String(page)} onChange={e=>setJump(e.target.value)}/><button className="button button-secondary" type="submit">跳转</button></>:null}</form></footer>
    </>}
  </dialog>;
}
