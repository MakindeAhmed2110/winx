"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { WINX_TOKEN } from "../landing/WinxCa";

const EXPLORER = `https://robinhoodchain.blockscout.com/token/${WINX_TOKEN}`;

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "wallets", label: "Wallets" },
  { id: "privacy", label: "Privacy" },
  { id: "markets", label: "Markets" },
  { id: "trading", label: "Trading" },
  { id: "settlement", label: "Settlement" },
  { id: "fees", label: "Fees & $WINX" },
  { id: "security", label: "Security" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function DocsPage() {
  const [active, setActive] = useState<SectionId>("overview");

  useEffect(() => {
    const nodes = SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (node): node is HTMLElement => node != null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.id;
        if (id && SECTIONS.some((section) => section.id === id)) {
          setActive(id as SectionId);
        }
      },
      { rootMargin: "-18% 0px -55% 0px", threshold: [0.15, 0.4, 0.7] },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="docs-page">
      <header className="docs-nav">
        <Link to="/" className="docs-brand" aria-label="Winx home">
          <img src="/logo/inverse-logomark.svg" alt="" />
          <span>Winx</span>
        </Link>
        <nav className="docs-nav-links" aria-label="Site">
          <Link to="/">Home</Link>
          <Link to="/docs" aria-current="page">
            Docs
          </Link>
          <a href="https://x.com/winxperp" target="_blank" rel="noreferrer">
            X
          </a>
          <a href={EXPLORER} target="_blank" rel="noreferrer">
            $WINX
          </a>
        </nav>
        <Link to="/trade" className="docs-launch">
          Launch app
        </Link>
      </header>

      <div className="docs-body">
        <aside className="docs-side">
          <p>Tech</p>
          <nav aria-label="Documentation">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={active === section.id ? "is-active" : undefined}
                onClick={() => setActive(section.id)}
              >
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="docs-main">
          <section id="overview" className="docs-block">
            <p className="docs-kicker">Overview</p>
            <h1>How Winx trades</h1>
            <p className="docs-lede">
              Winx is a non-custodial perpetual DEX on Robinhood Chain. You connect the wallet you
              already have, shield USDW into a private note, and open a long or a short. The chain
              checks a zero-knowledge proof that the trade was valid. It never learns the size, the
              side, or the margin you posted.
            </p>
            <p>
              A normal perp exchange publishes the book. Anyone can see who is leaning long, how
              large the position is, and where a liquidation would hurt. Winx keeps that off the
              tape. The market still has a mark, a leverage cap, and a way to settle. Your position
              is a commitment, not a public row.
            </p>
            <p>
              Testnet is live. The desk lists crypto and tokenized stock perps. Collateral is USDW.
              When you close, profit comes back as a new shielded note you can withdraw to the same
              wallet. On mainnet, trading fees buy back $WINX.
            </p>
            <div className="docs-cards">
              <article>
                <p>Wallets</p>
                <h2>Your keys stay on your wallet. Notes are commitments.</h2>
              </article>
              <article>
                <p>Privacy</p>
                <h2>Size, side, and margin stay sealed from the public book.</h2>
              </article>
              <article>
                <p>Markets</p>
                <h2>Crypto and stock perps, each with its own mark and leverage.</h2>
              </article>
            </div>
          </section>

          <section id="wallets" className="docs-block">
            <p className="docs-kicker">Wallets</p>
            <h2>One wallet, private notes</h2>
            <p>
              You do not create a Winx account or hand the app a seed phrase. Sign in with the
              wallet you already use on Robinhood Chain. That signature opens a session. It does
              not transfer the wallet, and Winx never stores the private key.
            </p>
            <p>
              Trading collateral is USDW. Shielding locks a chosen amount into the vault and mints
              a private note: a commitment that says the funds exist, without writing the amount in
              the clear. The secret that opens the note stays with you. From there you trade
              against the note, not against a public balance that the book can read.
            </p>
            <p>
              When a trade pays you, the payout is another note. Unshielding proves you own it and
              sends USDW back to the same wallet. Gas is ETH on Robinhood Chain. The faucet on
              testnet sends 1,000 USDW and 0.025 ETH to the connected address, once every 24 hours,
              so a new wallet can shield and close without waiting on a separate funding step.
            </p>
            <div className="docs-table" role="table" aria-label="What your wallet holds">
              <div role="row">
                <span role="columnheader">How you sign in</span>
                <span role="columnheader">You keep</span>
                <span role="columnheader">Winx sees</span>
              </div>
              <div role="row">
                <span role="cell">Existing wallet</span>
                <span role="cell">The keys</span>
                <span role="cell">A session signature</span>
              </div>
              <div role="row">
                <span role="cell">Shield</span>
                <span role="cell">The note secret</span>
                <span role="cell">A commitment</span>
              </div>
              <div role="row">
                <span role="cell">Unshield</span>
                <span role="cell">USDW back in the wallet</span>
                <span role="cell">The withdrawal, not the history of the trade</span>
              </div>
              <div role="row">
                <span role="cell">Gas</span>
                <span role="cell">ETH on Robinhood Chain</span>
                <span role="cell">The transaction, not the position</span>
              </div>
            </div>
          </section>

          <section id="privacy" className="docs-block">
            <p className="docs-kicker">Privacy</p>
            <h2>The book can clear. Your size does not paint it.</h2>
            <p>
              On an open perp book, your order is the information. A large long tells the market
              where you can be leaned on. A visible liquidation price tells them where to push.
              Winx is built so that read is not available. Size, side, and margin stay sealed. So
              does leftover equity after a close.
            </p>
            <p>
              What the chain stores is a commitment and, later, a proof. The proof shows the open
              or the close followed the rules: enough margin for the leverage, a mark inside the
              allowed band, a note that had not already been spent. It does not show the numbers
              that went into that check. There is no public map of who is long or short, and the
              tape does not print your intent.
            </p>
            <p>
              The mark itself is public. A market still has a price, a 24h change, and a funding
              rate where the venue publishes one. Privacy covers your position, not the asset you
              chose. Other traders can see that BTC is trading. They cannot see that you are the
              one holding it, or how large you are.
            </p>
          </section>

          <section id="markets" className="docs-block">
            <p className="docs-kicker">Markets</p>
            <h2>Listed perps, each with its own mark</h2>
            <p>
              The desk lists crypto perps and tokenized stock perps. Each market has its own
              contract id, price decimals, and leverage cap. BTC and ETH sit at the top of the
              book. Names like SOL, DOGE, NVDA, TSLA, and META trade as their own markets, not as
              a copy of the BTC feed.
            </p>
            <p>
              Crypto marks come from the live book. Stock marks come from the Robinhood quote for
              that ticker, so a stock perp does not inherit a crypto print. The 24h change on every
              row is read from CoinMarketCap, including the Robinhood tokenized stocks that
              CoinMarketCap lists. The dollar move and the percent sit next to the mark. They are
              not a guess from the last two prices on the page.
            </p>
            <p>
              You pick the market, see the mark, the oracle, open interest, and funding where the
              venue reports them, then choose long or short. The leverage slider stops at that
              market's cap. A 10x stock and a higher-leverage crypto market do not share a limit.
            </p>
          </section>

          <section id="trading" className="docs-block">
            <p className="docs-kicker">Trading</p>
            <h2>Long or short, then prove the close</h2>
            <p>
              A trade starts with collateral that is already shielded. You choose the market, the
              side, the leverage, and the size in USDW. Winx builds a proof that this open is
              allowed against your note and the current mark, then submits it. If the mark moves
              while the proof is being built, the desk retries against the live price instead of
              failing on a stale number.
            </p>
            <p>
              The position then lives with you, not on a public positions table. You still see your
              own entry, mark, and unrealized PnL. Nobody else gets that row. Closing proves the
              payout: what the note should be worth after the move, the fees, and the side you
              took. A winning close leaves a new note you can withdraw. A losing close consumes
              margin and can leave no payout.
            </p>
            <p>
              Close one position from its row, or close every open position in order. A single
              close shows the result. Closing several keeps going through the list and stops if one
              of them fails, so a later position is not skipped. On testnet the faucet is there so
              the first shield and the first close have both USDW and the ETH for gas.
            </p>
          </section>

          <section id="settlement" className="docs-block">
            <p className="docs-kicker">Settlement</p>
            <h2>The chain verifies the proof, not the trade</h2>
            <p>
              Settlement is a Groth16 proof checked by the contracts. The verifier accepts or
              rejects the proof. It does not receive the position in plaintext. That is the whole
              point of the circuit: the chain can be sure the math was honest without learning the
              inputs you want hidden.
            </p>
            <p>
              An open consumes the margin note and records a private position. A close consumes
              that position and, when equity remains, creates a payout note. Withdrawing that note
              is a separate step, back to your wallet as USDW. Liquidation uses the same shape. The
              proof shows the position was under water at the mark. It does not publish the size
              that was liquidated or the margin that was left.
            </p>
            <p>
              Marks used for settlement are pushed by the feed for that market, so a new listing
              does not settle against someone else's price. If a close is sent at the wrong second
              relative to the mark, the desk times the transaction instead of broadcasting a proof
              the contract would reject.
            </p>
          </section>

          <section id="fees" className="docs-block">
            <p className="docs-kicker">Fees & $WINX</p>
            <h2>$WINX on Robinhood</h2>
            <p>
              $WINX is the token that sits beside the exchange, on Robinhood Chain. The contract
              below is the one to hold, bridge, or verify. It is not the testnet USDW you trade
              with. USDW is the collateral inside the desk. $WINX is the asset tied to the protocol.
            </p>
            <p>
              On mainnet, all trading fees buy back $WINX. Fees taken when positions open and close
              are used to buy the token, instead of being left as exchange revenue with no link to
              it. Testnet is for trading the desk. The buyback is the mainnet rule.
            </p>
            <p className="docs-ca">
              <code>{WINX_TOKEN}</code>
              <a href={EXPLORER} target="_blank" rel="noreferrer">
                View on explorer
              </a>
            </p>
          </section>

          <section id="security" className="docs-block">
            <p className="docs-kicker">Security</p>
            <h2>Non-custodial by construction</h2>
            <p>
              Winx does not take custody of collateral. Shielded notes are owned by the secret you
              hold. The vault can release USDW only when a proof shows that note is yours and has
              not already been spent. A session signature lets the desk submit transactions you
              approve. It is not a grant of the wallet.
            </p>
            <p>
              The privacy is in what the chain stores, not in hiding the site behind a login. Your
              own browser keeps the notes you need in order to prove the next trade and to recover
              a payout. Losing that local state without a backup means the secret for an unspent
              note is gone, even though the commitment is still on the contract. Treat the note
              backup the way you treat a key.
            </p>
            <p>
              Testnet contracts and marks can be reset as the desk is still opening markets. Mainnet
              is the deployment where fees buy back $WINX and where the positions you seal are the
              ones that matter. Until then, use the faucet, trade small, and confirm the $WINX
              contract on the explorer before you buy the token.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
