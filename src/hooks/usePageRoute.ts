import { useCallback, useEffect, useState } from "react";
import { categories, type SectionId } from "../catalog";
const sections = new Set<string>([...categories.map(c => c.id), "latest", "contact", "benefits"]);
interface PageRoute { section: SectionId | null; poster: string | null; selected: string | null }
function validPoster(value: string | null | undefined) { return value && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null; }
function read(): PageRoute {
  const [path, query] = location.hash.slice(1).split("?");
  const [section, rawPoster] = path.split("/");
  const poster = validPoster(rawPoster);
  return { section: sections.has(section) ? section as SectionId : null, poster, selected: poster ?? validPoster(new URLSearchParams(query).get("item")) };
}
export function usePageRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = () => setRoute(read());
    window.addEventListener("popstate", update); window.addEventListener("hashchange", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("hashchange", update); };
  }, []);
  const navigate = useCallback((section: SectionId, poster?: string) => {
    history.pushState({ xuejin: true }, "", "#" + section + (poster ? "/" + poster : "")); setRoute(read());
  }, []);
  const select = useCallback((section: SectionId, poster: string) => {
    history.pushState({ xuejin: true }, "", `#${section}?item=${poster}`); setRoute(read());
  }, []);
  const back = useCallback(() => {
    if (history.state?.xuejin) history.back();
    else {
      const current = read(); history.replaceState(null, "", location.pathname + location.search + (current.poster && current.section ? `#${current.section}?item=${current.poster}` : "")); setRoute(read());
    }
  }, []);
  return { ...route, navigate, select, back };
}
