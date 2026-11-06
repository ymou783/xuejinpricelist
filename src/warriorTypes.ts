import type { Warrior, ImageAsset } from "./catalog";
export interface ManagedWarrior { draft: Warrior; published?: Warrior; status:"draft"|"published"|"offline"; version:string; updatedAt:string; ownerAccountId?:string; rejection?:string; submission?:{id:string;draft:Warrior;submittedAt:string}|null }
export interface WarriorRow { id:string;name:string;avatar?:ImageAsset;tags:string[];recommended:boolean;status:ManagedWarrior["status"];version:string;position:number;pending:boolean;rejection:string;hasChanges:boolean;ownerAccountId?:string }
export interface WarriorPage { items:WarriorRow[];total:number;count:number;page:number;pages:number;revision:string }
export interface WarriorAccount { id:string;username:string;profileId:string;disabled:boolean;createdAt:string }
export interface Invite { id:string;label:string;expiresAt:number;usedAt?:number;revoked?:boolean }
export function normalizedWarrior(draft:Warrior):Warrior { return {...draft,tags:[...new Set(draft.tags.map(t=>t.trim()).filter(Boolean))]}; }
