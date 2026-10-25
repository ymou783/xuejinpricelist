import { Crown } from "lucide-react";
import type { Benefit } from "../catalog";

export function OwnerRights({ items }: { items: Benefit[] }) {
  return <section className="owner-rights" aria-labelledby="owner-rights-title">
    <h2 id="owner-rights-title" className="section-title"><Crown aria-hidden="true" />老板权益</h2>
    <div className={"owner-rights-content" + (items.length ? "" : " is-empty")}>
      {items.length ? items.map(item => <article key={item.id}><h3>{item.title}</h3><p>{item.body}</p></article>)
        : <p className="owner-rights-pending">权益内容待补充</p>}
    </div>
  </section>;
}
