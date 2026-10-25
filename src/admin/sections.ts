import type { Catalog } from "../catalog";

export const sectionFields = {
  home: ["brand", "heading", "cdnDomain"], banners: ["banners"], posters: ["entries"],
  contact: ["contacts"], benefits: ["benefits"], rights: ["ownerRights"],
} as const;
export type AdminSection = keyof typeof sectionFields;
export function sectionDirty(section: AdminSection, draft: Catalog, saved: Catalog) {
  return sectionFields[section].some(key => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]));
}
export function mergeSection(base: Catalog, source: Catalog, section: AdminSection): Catalog {
  const result = { ...base };
  for (const key of sectionFields[section]) Object.assign(result, { [key]: structuredClone(source[key]) });
  return result;
}
