export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="anim-ribbon absolute -left-[10%] top-[8%] h-[42vh] w-[120%] opacity-80">
        <div
          className="h-full w-full blur-[2px]"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 40% 40%, rgba(42,75,255,0.55), transparent 62%), radial-gradient(ellipse 55% 45% at 70% 55%, rgba(122,43,255,0.5), transparent 60%), radial-gradient(ellipse 40% 35% at 20% 70%, rgba(226,59,255,0.28), transparent 55%)",
            maskImage:
              "radial-gradient(ellipse 80% 70% at 50% 50%, black 10%, transparent 72%)",
          }}
        />
      </div>
      <div className="anim-drift absolute -right-[8%] bottom-[4%] h-[38vh] w-[90%] opacity-70">
        <div
          className="h-full w-full"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 60% 50%, rgba(42,75,255,0.45), transparent 65%), radial-gradient(ellipse 45% 40% at 30% 60%, rgba(226,59,255,0.22), transparent 60%)",
            filter: "blur(18px)",
          }}
        />
      </div>
      <div className="noise" />
    </div>
  );
}
