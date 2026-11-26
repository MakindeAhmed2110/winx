import { Link } from "react-router";
import { FaqSection } from "./FaqSection";
import { FeatureStrip } from "./FeatureStrip";
import { SiteFooter } from "./SiteFooter";
import { WinxCa } from "./WinxCa";
import {
  MarketVisual,
  OrderbookVisual,
  SettlementVisual,
} from "./Illustrations";

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink text-paper">
      <div className="noise" />

      {/* Hero - Rooq color rhythm: brand wash → desk backlight → ink floor */}
      <section className="hero relative z-10 overflow-hidden">
        <img
          src="/hero-glow.webp?v=12"
          alt=""
          aria-hidden
          className="hero-glow pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_40%]"
        />
        {/* Soft brand pool under the desk - rhymes with violet glow in trading_ui */}
        <div className="hero-pool" aria-hidden />
        {/* Floor: brand tint settles into solid ink */}
        <div className="hero-floor" aria-hidden />

        <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pt-7 md:gap-4 md:px-8 md:pt-9">
          <a href="/" className="flex shrink-0 items-center gap-3 no-underline md:gap-3.5">
            <img src="/logo/inverse-logomark.svg" alt="" className="h-9 w-auto md:h-10" />
            <span className="brand text-base tracking-[0.14em] text-paper md:text-lg">Winx</span>
          </a>
          <nav className="ml-auto flex items-center" aria-label="Site">
            <Link to="/docs" className="text-sm font-semibold text-paper/80 no-underline hover:text-paper">
              Docs
            </Link>
          </nav>
          <div className="min-w-0">
            <WinxCa placement="nav" />
          </div>
          <Link
            to="/trade"
            className="shrink-0 rounded-full border border-white/14 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-paper no-underline backdrop-blur-sm transition hover:border-white/28 hover:bg-white/[0.07]"
          >
            Launch app
          </Link>
        </header>

        <div className="hero-copy relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-5 pt-16 text-center md:px-8 md:pt-20">
          <h1 className="anim-rise text-[clamp(2.5rem,6.2vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.03em] text-paper">
            <span className="md:whitespace-nowrap">Hide your positions</span>
            {" "}
            from the public.
          </h1>
          <p className="anim-rise-delay mx-auto mt-5 max-w-xl text-base leading-relaxed text-fog md:mt-6 md:text-lg">
            Winx is a private perpetual DEX. Size, side, and margin stay sealed - so the market
            cannot copy you, hunt you, or force your hand.
          </p>
          <div className="anim-rise-late mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-9">
            <Link to="/trade" className="btn-signal rounded-full px-7 py-3.5 no-underline">
              Start trading
            </Link>
            <a
              href="https://x.com/winxperp"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost rounded-full px-7 py-3.5 no-underline"
            >
              @winxperp
            </a>
          </div>
        </div>

        <div className="hero-stage relative z-10 mx-auto mt-12 w-full px-3 md:mt-14 md:px-5">
          <div className="hero-desk">
            <img
              src="/trading_ui.png"
              alt="Winx trading desk - private perps interface"
              className="hero-desk-img block h-auto w-full"
            />
            <div className="hero-desk-fade" aria-hidden />
          </div>
        </div>
      </section>

      <FeatureStrip />

      {/* Private orderbook */}
      <section id="orderbook" className="relative z-10 mx-auto max-w-5xl scroll-mt-8 px-5 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <p className="eyebrow">Private orderbook</p>
            <h2 className="mt-5 text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              Depth without disclosure.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-fog">
              The book can clear. Your size does not paint it. Orders settle as commitments so
              nobody can read your intent from the tape.
            </p>
          </div>
          <OrderbookVisual />
        </div>
      </section>

      {/* Private market */}
      <section className="relative z-10 mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <div className="md:order-2">
            <p className="eyebrow">Private market</p>
            <h2 className="mt-5 text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              Avoid the manipulations of an open book.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-fog">
              Markets stay liquid. Positions stay sealed. There is no public map of who is long or
              short - and nothing for a predator to squeeze against.
            </p>
          </div>
          <div className="md:order-1">
            <MarketVisual />
          </div>
        </div>
      </section>

      {/* Private settlement */}
      <section id="settlement" className="relative z-10 mx-auto max-w-5xl scroll-mt-8 px-5 py-16 md:px-8 md:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Private settlement</p>
          <h2 className="mt-5 text-3xl font-medium tracking-[-0.03em] md:text-4xl">
            The chain verifies the proof, not the trade.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-fog">
            PnL moves through shielded notes. A Groth16 proof proves the close or liquidation was
            correct - without revealing size, side, or leftover margin.
          </p>
        </div>
        <div className="mt-12">
          <SettlementVisual />
        </div>
      </section>

      <FaqSection />

      <SiteFooter />
    </div>
  );
}
