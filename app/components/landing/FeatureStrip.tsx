/** Feature strip - mobile marquee, desktop static grid. */

const FEATURES = [
  {
    title: "Trade perpetuals privately. Long/Short with up to 100X leverage.",
    src: "/features/rocket.svg",
  },
  {
    title: "Shield crypto, stocks, RWAs on Robinhood.",
    src: "/features/shield.svg",
  },
  {
    title: "Hide your positions, size, and PnL.",
    src: "/features/phone.svg",
  },
] as const;

function FeatureCard({ title, src }: { title: string; src: string }) {
  return (
    <li className="feature-card">
      <div className="feature-illust-wrap">
        <img src={`${src}?v=2`} alt="" className="feature-illust-img" />
      </div>
      <p className="feature-card-copy">{title}</p>
    </li>
  );
}

export function FeatureStrip() {
  return (
    <section className="feature-strip relative z-10 w-full py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
        <h2 className="feature-strip-title">
          <span className="block text-paper">Positions were public.</span>
          <span className="feature-strip-accent mt-1 block md:mt-2">
            {">>> "}Until Winx.
          </span>
        </h2>
      </div>

      <div className="feature-marquee" aria-label="Winx features">
        <ul className="feature-marquee-track">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} title={f.title} src={f.src} />
          ))}
          {FEATURES.map((f) => (
            <FeatureCard key={`dup-${f.title}`} title={f.title} src={f.src} />
          ))}
        </ul>
      </div>
    </section>
  );
}
