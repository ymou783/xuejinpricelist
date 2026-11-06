import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { digest, problem, touch } from "./posters.mjs";
import { warriorDraft } from "./warriors.mjs";
const derive = promisify(scrypt);
export async function credentials(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 200) throw problem("密码需要 12 至 200 个字符。");
  const salt = randomBytes(32).toString("hex"), key = (await derive(password, salt, 64)).toString("hex"); return { salt, key };
}
export function usernameOf(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{3,32}$/.test(value)) throw problem("账号名使用 3 至 32 位字母、数字、下划线或短横线。");
  return value.toLowerCase();
}
function usable(doc, token, kind) {
  if (typeof token !== "string" || token.length > 100) throw problem("邀请码或重置码无效、已使用或已过期。");
  const invite = doc.invites.find(i => i.hash === digest(token.trim()) && i.kind === kind && !i.usedAt && !i.revoked && i.expiresAt > Date.now());
  if (!invite) throw problem("邀请码或重置码无效、已使用或已过期。"); return invite;
}
const publicAccount = a => ({ id: a.id, username: a.username, profileId: a.profileId, disabled: a.disabled, createdAt: a.createdAt });
export function warriorAccounts(read, edit) {
  return {
    createWarriorInvite: (label = "", accountId) => edit(doc => {
      if (typeof label !== "string" || label.length > 80) throw problem("备注最多 80 字。");
      if (accountId && !doc.accounts.some(a => a.id === accountId)) throw problem("账号不存在。", 404);
      const token = randomBytes(32).toString("base64url"), kind = accountId ? "reset" : "register";
      if (accountId) for (const old of doc.invites) if (old.accountId === accountId && old.kind === "reset") old.revoked = true;
      const invite = { id: randomUUID(), label, accountId, kind, hash: digest(token), expiresAt: Date.now() + (accountId ? 86400000 : 7 * 86400000), createdAt: Date.now() };
      doc.invites.push(invite); return { id: invite.id, token, expiresAt: invite.expiresAt, kind };
    }),
    listWarriorInvites: async () => ({ items: (await read()).invites.filter(i => i.kind === "register").slice().reverse().slice(0,100).map(({hash,accountId,...i}) => i) }),
    revokeWarriorInvite: id => edit(doc => { const i = doc.invites.find(i => i.id === id); if (!i) throw problem("邀请码不存在。",404); i.revoked = true; return {ok:true}; }),
    registerWarrior: (username, password, token) => edit(doc => {
      username = usernameOf(username); const invite = usable(doc, token, "register");
      if (doc.accounts.some(a => a.username === username)) throw problem("账号名已被使用，请更换。");
      const id = "account-" + randomUUID(), profileId = "warrior-" + randomUUID();
      const account = { id, username, ...password, profileId, disabled: false, authVersion: randomUUID(), createdAt: new Date().toISOString() };
      doc.accounts.push(account); doc.warriorRecords.push(touch({ draft: warriorDraft({}, profileId), status: "draft", ownerAccountId: id }));
      invite.usedAt = Date.now(); return { account: publicAccount(account) };
    }),
    getWarriorCredentials: async username => (await read()).accounts.find(a => a.username === username),
    getWarriorAccount: async id => (await read()).accounts.find(a => a.id === id),
    resetWarriorPassword: (token, password) => edit(doc => {
      const invite = usable(doc, token, "reset"), a = doc.accounts.find(a => a.id === invite.accountId);
      if (!a || a.disabled) throw problem("账号已停用，请联系管理员。");
      Object.assign(a, password, { authVersion: randomUUID() }); invite.usedAt = Date.now(); return { ok: true };
    }),
    listWarriorAccounts: async (query={}) => {
      const doc=await read(), q=String(query.q ?? "").normalize("NFKC").toLowerCase().trim();
      const rows=doc.accounts.filter(a => (a.username + " " + (doc.warriorRecords.find(r=>r.draft.id===a.profileId)?.draft.name || "")).normalize("NFKC").toLowerCase().includes(q));
      const pages=Math.max(1,Math.ceil(rows.length/6)), page=Math.min(pages,Math.max(1,Math.floor(Number(query.page)||1)));
      return {items:rows.slice((page-1)*6,page*6).map(publicAccount),total:rows.length,page,pages};
    },
    disableWarriorAccount: (id, disabled) => edit(doc => {
      const a=doc.accounts.find(a=>a.id===id); if(!a)throw problem("账号不存在。",404);
      if(typeof disabled!=="boolean")throw problem("账号状态不正确。");a.disabled=disabled;a.authVersion=randomUUID();return {ok:true};
    }),
  };
}
