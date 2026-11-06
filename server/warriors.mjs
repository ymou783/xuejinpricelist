import { randomUUID } from "node:crypto";
import { cleanWarrior, validWarrior, warriorTextLimits } from "../src/catalog.ts";
import { digest, libraryRevision, managed, posterDraft, problem, publicEntries, touch, validId } from "./posters.mjs";

export function warriorDraft(value = {}, id) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !validId(id)) throw problem("武将资料格式不正确。");
  const result = { id };
  for (const [key, max] of Object.entries(warriorTextLimits)) {
    const text = value[key] ?? "";
    if (typeof text !== "string" || text.length > max) throw problem("请检查武将昵称和介绍的填写长度。");
    result[key] = text;
  }
  const tags = value.tags ?? [], images = value.images ?? [], ids = value.posterIds ?? [];
  if (!Array.isArray(tags) || tags.length > 8 || tags.some(t => typeof t !== "string" || !t.trim() || t.length > 20)
    || !Array.isArray(images) || images.some(p => !p || !validId(p.id) || typeof p.title !== "string" || p.title.length > 80) || new Set(images.map(p => p.id)).size !== images.length
    || !Array.isArray(ids) || ids.some(p => !validId(p)) || new Set(ids).size !== ids.length
    || (value.recommended !== undefined && typeof value.recommended !== "boolean")) throw problem("请检查标签、介绍图片和关联价目海报。");
  const image = i => posterDraft({ title: result.name, image: { ...i, alt: i?.alt || result.name || "武将介绍" } }, id).image;
  if (value.avatar !== undefined) { if (!value.avatar) throw problem("头像格式不正确。"); result.avatar = image(value.avatar); }
  result.tags = [...new Set(tags.map(t => t.trim()))]; result.recommended = value.recommended ?? false;
  result.images = images.map(p => ({ id: p.id, title: p.title, ...(p.image === undefined ? {} : { image: image(p.image) }) }));
  result.posterIds = ids; return result;
}
export function publishWarrior(value) {
  if (!validWarrior(value)) throw problem("请填写武将昵称，并补全已添加图片的路径和原图宽高；其余文字可留空。可先保存草稿。");
  return cleanWarrior({ ...value, name: value.name.trim() });
}
function recordOf(records, id, version) {
  const r = records.find(r => r.draft.id === id);
  if (!r) throw problem("武将已删除，请刷新列表。", 404);
  if (version !== undefined && version !== r.version) throw problem("这位武将已在其他窗口修改，请重新打开后编辑。", 409);
  return r;
}
export function warriorOperations(read, edit, release = async draft=>draft, owns = async()=>{}) {
  return {
    listWarriors: async (query = {}) => {
      const { warriorRecords: records } = await read();
      const words = String(query.q ?? "").normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const matched = records.filter(r => (!query.status || query.status === "all" || (query.status==="pending" ? Boolean(r.submission) : query.status==="rejected" ? Boolean(r.rejection)&&!r.submission : r.status === query.status))
        && words.every(w => (r.draft.name + " " + r.draft.tags.join(" ")).normalize("NFKC").toLocaleLowerCase().includes(w)));
      const pages = Math.max(1, Math.ceil(matched.length / 6)), page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
      return { total: matched.length, count: records.length, page, pages, revision: libraryRevision(records),
        items: matched.slice((page - 1) * 6, page * 6).map(r => ({ id: r.draft.id, name: r.draft.name, tags: r.draft.tags, avatar: r.draft.avatar,
          recommended: r.draft.recommended, status: r.status, version: r.version, position: records.indexOf(r) + 1,
          pending:Boolean(r.submission),rejection:r.rejection||"",ownerAccountId:r.ownerAccountId,
          hasChanges: r.status === "published" && digest(r.draft) !== (r.approvedDigest||digest(r.published)) })) };
    },
    getWarrior: async id => ({ record: recordOf((await read()).warriorRecords, id) }),
    createWarrior: draft => edit(doc => {
      const record = touch({ draft: warriorDraft(draft, "warrior-" + randomUUID()), status: "draft" });
      doc.warriorRecords.push(record); return { record };
    }),
    updateWarrior: (id, draft, version, action) => edit(async doc => {
      const r = recordOf(doc.warriorRecords, id, version);
      if (typeof version !== "string" || !["draft", "publish", "offline", "delete"].includes(action)) throw problem("请选择保存草稿、发布或下架。");
      if (action === "delete") { if(r.ownerAccountId)throw problem("这位武将已绑定账号，请下架资料并按需停用账号。");doc.warriorRecords = doc.warriorRecords.filter(item => item !== r); return { ok: true }; }
      if (action === "offline") r.status = r.status === "draft" ? "draft" : "offline";
      else {
        if(r.submission)throw problem("存在待审核版本，请先审核或退回后编辑。",409);
        const next = warriorDraft(draft, id);
        const published = action === "publish" ? await release(publishWarrior(next)) : null;
        r.draft = next;
        if (published) { r.published = published; r.approvedDigest=digest(next);r.status = "published";r.rejection=""; }
      }
      touch(r); return { record: r };
    }),
    selfWarrior: async profileId => ({record:recordOf((await read()).warriorRecords,profileId)}),
    saveSelfWarrior: (profileId,accountId,value,version,action) => edit(async doc=>{
      const r=recordOf(doc.warriorRecords,profileId,version);
      if(r.ownerAccountId!==accountId)throw problem("无法编辑其他武将的资料。",403);
      if(doc.accounts.find(a=>a.id===accountId)?.disabled)throw problem("账号已停用。",403);
      if(typeof version!=="string"||!["draft","submit","withdraw"].includes(action))throw problem("操作不正确。");
      if(action==="withdraw"){r.submission=null;r.rejection="";touch(r);return {record:r};}
      if(r.submission)throw problem("请先撤回待审核内容，再修改并提交。",409);
      if(value?.id!==undefined&&value.id!==profileId)throw problem("无法编辑其他武将的资料。",403);
      if(value?.recommended!==r.draft.recommended || JSON.stringify(value?.posterIds)!==JSON.stringify(r.draft.posterIds))throw problem("推荐与关联价目表由管理员设置。",403);
      const draft=warriorDraft(value,profileId);await owns(draft,r);
      if(action==="submit")publishWarrior(draft);
      r.draft=draft;r.rejection="";
      if(action==="submit")r.submission={id:randomUUID(),draft:structuredClone(draft),submittedAt:new Date().toISOString()};
      touch(r);return {record:r};
    }),
    reviewWarrior: (id,version,submissionId,decision,reason,controls={}) => edit(async doc=>{
      if(typeof version!=="string")throw problem("请重新打开待审核资料后操作。");
      if(!controls||typeof controls!=="object"||Array.isArray(controls))throw problem("审核设置不正确。");
      const r=recordOf(doc.warriorRecords,id,version);
      if(!r.submission||r.submission.id!==submissionId)throw problem("该审核版本已撤回或更新，请重新打开。",409);
      if(!["approve","reject"].includes(decision))throw problem("审核操作不正确。");
      if(decision==="reject"){
        if(typeof reason!=="string"||!reason.trim()||reason.length>1000)throw problem("请填写退回原因，最多 1000 字。");r.rejection=reason.trim();
      }else{
        const next=warriorDraft({...r.submission.draft,recommended:controls.recommended??r.draft.recommended,posterIds:controls.posterIds??r.draft.posterIds},id);const published=await release(publishWarrior(next));
        r.published=published;r.draft=next;r.approvedDigest=digest(next);r.status="published";r.rejection="";
      }
      r.submission=null;touch(r);return {record:r};
    }),
    moveWarrior: (id, position, revision) => edit(doc => {
      if (revision !== libraryRevision(doc.warriorRecords)) throw problem("武将顺序已变化，请刷新后再排序。", 409);
      const r = recordOf(doc.warriorRecords, id);
      if (!Number.isInteger(position) || position < 1 || position > doc.warriorRecords.length) throw problem("排序位置超出范围。");
      const rows = doc.warriorRecords.filter(item => item !== r); rows.splice(position - 1, 0, r); doc.warriorRecords = rows; return { ok: true };
    }),
  };
}
export { managed, publicEntries };
