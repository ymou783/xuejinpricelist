import { useCallback, useEffect, useState } from "react";
import { categories, type SectionId } from "../catalog";
const sections = new Set<string>([...categories.map(c => c.id), "latest", "contact", "benefits"]);
interface PageRoute { section: SectionId | null; poster: string | null }
function read(): PageRoute {
  const [section, poster] = location.hash.slice(1).split("/");
  return { section: sections.has(section) ? section as SectionId : null, poster: poster && /^[a-zA-Z0-9_-]+$/.test(poster) ? poster : null };
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
  const back = useCallback(() => {
    if (history.state?.xuejin) history.back();
    else {
      const current = read(); history.replaceState(null, "", location.pathname + location.search + (current.poster && current.section ? "#" + current.section : "")); setRoute(read());
    }
  }, []);
  return { ...route, navigate, back };
}
