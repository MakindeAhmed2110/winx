import { useState } from "react";

const FAQS = [
  {
    q: "What is Winx?",
    a: "Winx is a privacy-native perpetual DEX on Robinhood Chain. You trade with size, side, and margin sealed - so the public tape cannot copy you, hunt you, or force your hand.",
  },
  {
    q: "How does private trading work?",
    a: "You shield collateral into private notes, then open and close positions with zero-knowledge proofs. The chain verifies correctness. It never learns your size, side, or leftover margin.",
  },
  {
    q: "Do I need a new wallet?",
    a: "No. Winx works with your existing wallet. Shield, trade, and unshield from the same account you already use on Robinhood Chain.",
  },
  {
    q: "Is Winx custodial?",
    a: "No. Funds stay under your control. Shielded notes are owned by your keys. Winx never holds your collateral as a custodian.",
  },
  {
    q: "What can I trade?",
    a: "Perpetuals - long or short with up to 100x leverage. Shield crypto, stocks, and RWAs on Robinhood, then trade without painting your book.",
  },
  {
    q: "What stays private?",
    a: "Your positions, size, side, and PnL. The orderbook clears without disclosing your intent. There is no public map of who is long or short.",
  },
] as const;

export function FaqSection() {
  const [open, setOpen] = useState(0);

  return (
    <section className="faq-section relative z-10 w-full">
      <div className="faq-inner mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 md:grid-cols-[minmax(0,0.32fr)_minmax(0,1fr)] md:gap-16 md:px-8 md:py-24">
        <h2 className="faq-title">FAQ</h2>

        <ul className="faq-list">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <li key={item.q} className={`faq-item ${isOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="faq-trigger"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span className="faq-q">{item.q}</span>
                  <span className="faq-chevron" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M3.2 5.2L7 9l3.8-3.8"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                <div className="faq-panel" role="region">
                  <div className="faq-panel-inner">
                    <p className="faq-a">{item.a}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
