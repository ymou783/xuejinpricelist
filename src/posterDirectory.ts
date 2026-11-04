import type { CategoryId, Poster, SectionId } from "./catalog";

export type PosterSection = CategoryId | "latest";
export interface DirectoryState { query: string; newOnly: boolean; page: number; selected: string | null }
export const POSTERS_PER_PAGE = 6;

export function isPosterSection(section: SectionId | null): section is PosterSection {
  return section !== null && section !== "contact" && section !== "benefits" && section !== "rights";
}

function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase().trim(); }
export function titleTerms(query: string) { return normalize(query).split(/\s+/).filter(Boolean); }
export function matchesTitle(title: string, terms: string[]) {
  const normalized = normalize(title);
  return terms.every(term => normalized.includes(term));
}

export function posterDirectory(entries: Poster[], section: PosterSection, state: DirectoryState) {
  const terms = titleTerms(state.query);
  const category = entries.filter(p => section === "latest" ? p.isNew : p.category === section);
  const matches = category.filter(p => (!state.newOnly || p.isNew) && matchesTitle(p.title, terms));
  const pages = Math.max(1, Math.ceil(matches.length / POSTERS_PER_PAGE));
  const selectedIndex = state.selected ? matches.findIndex(p => p.id === state.selected) : -1;
  const page = selectedIndex >= 0 ? Math.floor(selectedIndex / POSTERS_PER_PAGE) + 1 : Math.max(1, Math.min(pages, state.page));
  return { matches, categoryCount: category.length, pages, page, items: matches.slice((page - 1) * POSTERS_PER_PAGE, page * POSTERS_PER_PAGE) };
}
export type PosterDirectoryModel = ReturnType<typeof posterDirectory>;
