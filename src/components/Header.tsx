import wordmark from "../assets/wordmark.webp";
export function Header({ brand }: { brand: string }) {
  return <header className="site-header"><div className="shell header-inner">
    <a className="brand" href="./" aria-label={brand + "首页"}><img src={wordmark} width="432" height="144" alt={brand + " SNOW ASHES ESPORTS"} /></a>
    <span className="header-label"><span className="desktop-label">三角洲</span>价目表</span>
  </div></header>;
}
