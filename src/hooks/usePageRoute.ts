import { useCallback, useEffect, useRef, useState } from "react";
import { categories, type SectionId } from "../catalog";
import { isPosterSection, type DirectoryState } from "../posterDirectory";
const sections = new Set<string>([...categories.map(c => c.id), "latest", "contact", "benefits", "rights"]);
interface PageRoute extends DirectoryState { section: SectionId | null; poster: string | null }
const defaults: DirectoryState = { query: "", newOnly: false, page: 1, selected: null };
function validPoster(value: string | null | undefined) { return value && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null; }
function read(): PageRoute {
  const [path, query] = location.hash.slice(1).split("?");
  const [section, rawPoster] = path.split("/");
  if (!sections.has(section)) return { ...defaults, section: null, poster: null };
  const params = new URLSearchParams(query), poster = validPoster(rawPoster), page = Number(params.get("page") ?? 1);
  return { section: section as SectionId, poster, selected: poster ?? validPoster(params.get("item")),
    query: (params.get("q") ?? "").slice(0, 80), newOnly: params.get("new") === "1", page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}
export function routeHash(route: { section: SectionId | null; poster?: string | null } & Partial<DirectoryState>) {
  if (!route.section) return "";
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  if (route.newOnly) params.set("new", "1");
  if (route.page && route.page > 1) params.set("page", String(route.page));
  if (!route.poster && route.selected) params.set("item", route.selected);
  return "#" + route.section + (route.poster ? "/" + route.poster : "") + (params.size ? "?" + params.toString() : "");
}
export function usePageRoute() {
  const [route, setRoute] = useState(read);
  const previous = useRef(route);
  const sync = useCallback((next: PageRoute) => { previous.current = next; setRoute(next); }, []);
  const write = useCallback((next: PageRoute, push = false) => {
    const url = location.pathname + location.search + routeHash(next);
    if (push) history.pushState({ xuejin: true }, "", url);
    else history.replaceState(history.state, "", url);
    sync(next);
  }, [sync]);
  useEffect(() => {
    const update = () => {
      let next = read(); const last = previous.current;
      // Closing a viewer, including browser Back, returns to the last image viewed.
      if (last.poster && !next.poster && next.section === last.section && isPosterSection(next.section)) {
        next = { ...next, query: last.query, newOnly: last.newOnly, page: last.page, selected: last.poster };
        history.replaceState(history.state, "", location.pathname + location.search + routeHash(next));
      }
      sync(next);
    };
    window.addEventListener("popstate", update); window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, [sync]);
  const navigate = useCallback((section: SectionId, poster?: string, page?: number) => {
    const current = read(), same = current.section === section;
    const directory: PageRoute = { ...(same ? current : defaults), section, poster: null,
      selected: poster ?? null, ...(page ? { page } : {}) };
    if (poster && isPosterSection(section)) write(directory, !same || Boolean(current.poster));
    write({ ...directory, poster: poster ?? null }, true);
  }, [write]);
  const select = useCallback((section: SectionId, poster: string) => {
    navigate(section, poster);
  }, [navigate]);
  const updateDirectory = useCallback((change: Partial<DirectoryState>) => {
    write({ ...read(), ...change, selected: null });
  }, [write]);
  const replacePoster = useCallback((poster: string, page: number) => {
    write({ ...read(), poster, selected: poster, page });
  }, [write]);
  const back = useCallback(() => {
    if (history.state?.xuejin) history.back();
    else {
      const current = read();
      write(current.poster ? { ...current, poster: null, selected: current.poster } : { ...defaults, section: null, poster: null });
      if (current.section === "rights") requestAnimationFrame(() => document.getElementById("rights")?.scrollIntoView({ block: "start" }));
    }
  }, [write]);
  return { ...route, navigate, select, updateDirectory, replacePoster, back };
}
