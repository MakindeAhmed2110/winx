type Props = {
  className?: string;
  showWordmark?: boolean;
};

export function BrandMark({ className = "", showWordmark = true }: Props) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src="/logo/inverse-logomark.svg"
        alt=""
        className="h-8 w-auto md:h-9"
        width={78}
        height={61}
      />
      {showWordmark ? (
        <span className="brand relative text-lg text-paper md:text-xl">Winx</span>
      ) : null}
    </div>
  );
}
