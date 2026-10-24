import { ChevronRight, Compass, Dice5, Gem, Gift, Headphones, MessageCircle } from "lucide-react";
import { categories, type SectionId } from "../catalog";
import flame from "../assets/ice-flame-1200.webp";
import smallFlame from "../assets/ice-flame-600.webp";
const icons = [Compass, Dice5, Gem, Headphones];
function NewIcon() { return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c-1 5-3 7-8 9 5 1 7 3 8 8 1-5 3-7 8-8-5-2-7-4-8-9Z" /><path d="m24 19 1.3 4.7L30 25l-4.7 1.3L24 31l-1.3-4.7L18 25l4.7-1.3Z" fill="currentColor" stroke="none" /></svg>; }
interface Props { heading: string; subtitle: string; onOpen: (section: SectionId) => void }
export function CategoryHome({ heading, subtitle, onOpen }: Props) {
  return <main className="shell home-main" id="categories">
    <section className="home-hero" aria-labelledby="page-title">
      <img className="hero-art" src={flame} srcSet={`${smallFlame} 600w, ${flame} 1200w`} sizes="(max-width: 700px) 280px, 700px" width="1200" height="858" alt="" fetchPriority="high" />
      <div className="hero-copy"><h1 id="page-title">{heading}</h1><p>{subtitle}</p></div>
    </section>
    <section className="category-section" aria-labelledby="category-heading">
      <h2 id="category-heading" className="section-title">价目分类</h2>
      <a href="#latest" className="latest-entry entry" onClick={e => { e.preventDefault(); onOpen("latest"); }}>
        <span className="entry-icon"><NewIcon /></span><span className="entry-copy"><strong>趣味单上新</strong><span>最近上新，来点新鲜玩法。</span></span><ChevronRight className="entry-chevron" aria-hidden="true" />
      </a>
      <div className="category-grid">{categories.map((category, index) => {
        const Icon = icons[index]; return <a key={category.id} href={"#" + category.id} className="category-entry entry" onClick={e => { e.preventDefault(); onOpen(category.id); }}>
          <span className="entry-icon"><Icon aria-hidden="true" /></span><span className="category-label"><strong>{category.title}</strong><ChevronRight className="entry-chevron" aria-hidden="true" /></span>
        </a>;
      })}</div>
      <div className="utility-grid">
        <a href="#contact" className="utility-entry entry" onClick={e => { e.preventDefault(); onOpen("contact"); }}><span className="entry-icon"><MessageCircle aria-hidden="true" /></span><span className="entry-copy"><strong>联系客服</strong><span>咨询与下单</span></span><ChevronRight className="entry-chevron" aria-hidden="true" /></a>
        <a href="#benefits" className="utility-entry entry" onClick={e => { e.preventDefault(); onOpen("benefits"); }}><span className="entry-icon"><Gift aria-hidden="true" /></span><span className="entry-copy"><strong>预存福利</strong><span>查看福利详情</span></span><ChevronRight className="entry-chevron" aria-hidden="true" /></a>
      </div>
    </section>
  </main>;
}
