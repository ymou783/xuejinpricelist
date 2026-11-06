import { Plus, Trash2 } from "lucide-react";
import { warriorTextLimits, type Warrior } from "../catalog";
import { UploadField } from "../admin/UploadField";
import { CdnImageFields } from "../admin/CdnImageFields";
import { contentId } from "../admin/contentId";
interface Props { draft:Warrior;csrf:string;domain:string;self?:boolean;onChange:(draft:Warrior)=>void;onBusy:(busy:boolean)=>void;onError:(error:unknown)=>void }
export function WarriorFields({draft,csrf,domain,self=false,onChange,onBusy,onError}:Props){
  const patch=(change:Partial<Warrior>)=>onChange({...draft,...change});
  return <div className="warrior-fields">
    <div className="form-two-columns">
      <label className="form-field"><span>武将昵称</span><input aria-label="武将昵称" maxLength={50} value={draft.name} placeholder="你的公开昵称" onChange={e=>patch({name:e.target.value})}/></label>
      <label className="form-field"><span>标签（选填）</span><input aria-label="武将标签" maxLength={200} value={draft.tags.join("，")} placeholder="技术，娱乐，教学" onChange={e=>patch({tags:e.target.value.split(/[，,]/)})}/></label>
    </div>
    <p className="field-help">昵称为发布必填项，其余文字可留空。标签用逗号分隔，最多 8 个，每个不超过 20 字。</p>
    <label className="form-field"><span>一句话介绍（选填）</span><input aria-label="一句话介绍" maxLength={200} value={draft.summary} placeholder="让老板快速了解你的特点" onChange={e=>patch({summary:e.target.value})}/></label>
    {([{key:"bio",label:"个人介绍"},{key:"maps",label:"擅长地图与玩法"},{key:"style",label:"服务风格"},{key:"notes",label:"下单须知"}] as const).map(f=><label className="form-field" key={f.key}><span>{f.label}（选填）</span><textarea aria-label={f.label} rows={f.key==="bio"?4:3} maxLength={warriorTextLimits[f.key]} value={draft[f.key]} onChange={e=>patch({[f.key]:e.target.value})}/></label>)}
    <section className="editable-item" aria-label="武将头像设置"><h3>头像（选填）</h3><UploadField self={self} csrf={csrf} domain={domain} image={draft.avatar} label="上传武将头像" onBusy={onBusy} onError={onError} onUploaded={image=>patch({avatar:{...image,alt:draft.name||"武将头像"}})}/>
      {!self?<CdnImageFields csrf={csrf} image={draft.avatar} alt={draft.name||"武将头像"} onChange={avatar=>patch({avatar})}/>:null}
      {draft.avatar?<button className="text-danger" type="button" onClick={()=>patch({avatar:undefined})}>移除头像</button>:null}
    </section>
    <div className="form-subheading"><h3>介绍图片与战绩截图（选填）</h3><button type="button" className="button button-secondary" onClick={()=>patch({images:[...draft.images,{id:contentId("photo"),title:""}]})}><Plus size={18}/>添加介绍图片</button></div>
    {draft.images.map((photo,index)=><section className="editable-item" key={photo.id} aria-label={"介绍图片 "+(index+1)}>
      <div className="form-subheading"><h3>图片 {index+1}</h3><button type="button" className="text-danger" aria-label={"删除介绍图片 "+(index+1)} onClick={()=>patch({images:draft.images.filter(p=>p.id!==photo.id)})}><Trash2 size={16}/>删除</button></div>
      <label className="form-field"><span>图片标题（选填）</span><input aria-label={"介绍图片标题 "+(index+1)} maxLength={80} value={photo.title} onChange={e=>patch({images:draft.images.map(p=>p.id===photo.id?{...p,title:e.target.value}:p)})}/></label>
      <UploadField self={self} csrf={csrf} image={photo.image} domain={domain} label={"上传介绍图片 "+(index+1)} onBusy={onBusy} onError={onError} onUploaded={image=>patch({images:draft.images.map(p=>p.id===photo.id?{...p,image:{...image,alt:photo.title||draft.name||"武将介绍"}}:p)})}/>
      {!self?<CdnImageFields csrf={csrf} image={photo.image} alt={photo.title||draft.name||"武将介绍"} onChange={image=>patch({images:draft.images.map(p=>p.id===photo.id?{...p,image}:p)})}/>:null}
    </section>)}
  </div>;
}
