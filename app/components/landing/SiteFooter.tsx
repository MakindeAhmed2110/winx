import { Link } from "react-router";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Markets", to: "/markets" },
      { label: "Trade", to: "/trade" },
      { label: "Private orderbook", to: "/#orderbook" },
      { label: "Settlement", to: "/#settlement" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "How it works", to: "/#how" },
      { label: "FAQ", to: "/#faq" },
    ],
  },
  {
    title: "More",
    links: [
      { label: "Testnet explorer", href: "https://explorer.testnet.chain.robinhood.com" },
      { label: "GitHub", href: "https://github.com/MakindeAhmed2110/winx" },
    ],
  },
] as const;

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.3 9.3 0 0 1 2.5-.34c.85 0 1.7.11 2.5.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.6.69.49A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"
      />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-top">
        <div className="site-footer-brand">
          <a href="/" className="site-footer-logo">
            <img src="/logo/inverse-logomark.svg" alt="" />
            <span>Winx</span>
          </a>
          <p>
            Trade perps with leverage. Your size, side, and margin stay out of public view.
          </p>
          <div className="site-footer-socials">
            <a href="https://x.com/winxperp" target="_blank" rel="noreferrer">
              <XIcon />
              Follow @winxperp
            </a>
            <a href="https://github.com/MakindeAhmed2110/winx" target="_blank" rel="noreferrer">
              <GitHubIcon />
              GitHub
            </a>
          </div>
        </div>

        <nav className="site-footer-nav" aria-label="Footer">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="site-footer-label">{column.title}</p>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"href" in link ? (
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.to}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <p className="site-footer-mark" aria-hidden>
        WINX
      </p>
    </footer>
  );
}
