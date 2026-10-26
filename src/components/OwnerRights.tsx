import { Crown } from "lucide-react";
import type { Benefit } from "../catalog";
import { ImagePreview } from "./ImagePreview";

export function OwnerRights({ items, domain, onOpenImage }: { items: Benefit[]; domain: string; onOpenImage: (id: string) => void }) {
  return <section className="owner-rights" id="rights" aria-labelledby="owner-rights-title">
    <h2 id="owner-rights-title" className="section-title"><Crown aria-hidden="true" />老板权益</h2>
    <div className={"owner-rights-content" + (items.length ? "" : " is-empty")}>
      {items.length ? items.map(item => <article key={item.id}><h3>{item.title}</h3>{item.body.trim() ? <p>{item.body}</p> : null}{item.image ? <ImagePreview key={item.image.objectKey} image={item.image} title={item.title} domain={domain} variant="rights" onOpen={() => onOpenImage(item.id)} /> : null}</article>)
        : <p className="owner-rights-pending">权益内容待补充</p>}
    </div>
  </section>;
}
