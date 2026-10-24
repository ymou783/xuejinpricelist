import { useCallback, useEffect, useState } from "react";
import { parseCatalog, type Catalog } from "../catalog";

type CatalogState =
  | { status: "loading"; data: null }
  | { status: "error"; data: null }
  | { status: "ready"; data: Catalog };

export function useCatalog() {
  const [state, setState] = useState<CatalogState>({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null });
    const load = async () => {
      try {
        const url = new URL(import.meta.env.BASE_URL + "catalog.json", window.location.href);
        const response = await fetch(url, { signal: controller.signal, cache: "no-cache" });
        if (!response.ok) throw new Error("Catalog unavailable");
        const data = parseCatalog(await response.json());
        if (!controller.signal.aborted) {
          document.title = data.brand + "｜" + data.heading;
          setState({ status: "ready", data });
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", data: null });
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  return { ...state, retry };
}
