/**
 * Figma "Footer": 32px tall, #121315, 25px side padding, 8px top and 6px
 * bottom. Two status badges on the left, the version on the right. Desktop
 * only; phones have the bottom dock instead.
 */
export function TradeFooter() {
  return (
    <footer className="relative z-20 hidden h-8 shrink-0 items-center justify-between bg-[#121315] px-[25px] pt-2 pb-1.5 lg:flex">
      <div className="flex items-start gap-2.5">
        <FooterBadge dot="/icons/dot-online.svg" className="bg-[rgba(19,221,197,0.15)] text-[#13ddc5]">
          Online
        </FooterBadge>
        <FooterBadge dot="/icons/dot-private.svg" className="bg-[rgba(177,95,248,0.15)] text-[#b15ff8]">
          Private settlement
        </FooterBadge>
      </div>
      <span className="text-[12px] uppercase leading-normal tracking-[-0.24px] text-white opacity-50 [text-box:trim-both_cap_alphabetic]">
        Powered by Winx v1.0
      </span>
    </footer>
  );
}

/** Figma footer badge: 6px dot and 11px label, 5px apart, on a 15% tint. */
function FooterBadge({
  dot,
  className,
  children,
}: {
  dot: string;
  className: string;
  children: string;
}) {
  return (
    <span
      className={`flex items-center justify-center gap-[5px] px-2.5 py-[5px] backdrop-blur-[5.4px] ${className}`}
    >
      <img src={dot} alt="" width={6} height={6} className="block shrink-0" />
      <span className="text-[11px] uppercase leading-normal tracking-[-0.22px] [text-box:trim-both_cap_alphabetic]">
        {children}
      </span>
    </span>
  );
}
