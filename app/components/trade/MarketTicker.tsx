import { markets } from "../../lib/config";
import {
  formatCompactUsd,
  formatCountdown,
  formatPct,
  formatUsd,
} from "../../lib/format";
import type { MarketKey } from "../../hooks/useTradeDesk";
import { useCmcQuote } from "../../hooks/useCmcQuote";
import { useLiveMark } from "../../hooks/use-live-mark";
import { useMarketStats } from "../../hooks/use-market-stats";
import { useNow } from "../../hooks/use-poll";
import { useRhQuote } from "../../hooks/useRhQuote";
import { MarketPicker } from "./MarketPicker";

type Props = {
  marketKey: MarketKey;
  onSelect: (key: MarketKey) => void;
  /** Unused once Extended stats load; kept for call-site compatibility. */
  markUsd: number | null;
  leverage?: number;
};

export function MarketTicker({ marketKey, onSelect, markUsd, leverage }: Props) {
  const market = markets[marketKey];
  const { data: stats } = useMarketStats(market.extendedMarket, 3000);
  const live = useLiveMark(market.extendedMarket);
  const cmc = useCmcQuote(market.extendedMarket ? market.cmcId : undefined);
  const rh = useRhQuote(market.extendedMarket ? "" : market.rh);
  const now = useNow();
  const decimals = market.priceDecimals;

  const mark = live ?? stats?.markPrice ?? rh.price ?? cmc.price ?? markUsd;
  const oracle = stats?.indexPrice ?? markUsd ?? rh.price ?? cmc.price ?? null;
  const changePct = stats?.dailyChangePct ?? (market.extendedMarket ? cmc.changePct : null);
  const changeUp = changePct == null ? undefined : changePct >= 0;
  const funding = stats?.fundingRate;
  const fundingUp = funding == null ? undefined : funding >= 0;
  const fundingCountdown =
    stats && now > 0
      ? formatCountdown(stats.nextFundingTs / 1000 - now).slice(3)
      : null;

  return (
    <div className="trade-ticker flex flex-col items-stretch gap-3 xl:flex-row xl:items-center xl:gap-6 2xl:gap-8">
      <div className="trade-ticker-pair flex min-w-0 items-center justify-between gap-3">
        <div className="trade-ticker-id flex min-w-0 flex-col items-start gap-[5px]">
          <MarketPicker marketKey={marketKey} onSelect={onSelect} />
          {market.maxLeverage > 0 && leverage != null ? (
            <span className="trade-pair-lev lg:hidden">{leverage}x</span>
          ) : null}
        </div>
        <div className="trade-ticker-quote lg:hidden">
          <span className="trade-ticker-quote-px">
            {formatUsd(mark, decimals === 0 ? 1 : decimals)}
          </span>
          <span
            className={`trade-ticker-quote-chg ${
              changeUp === true ? "is-up" : changeUp === false ? "is-down" : ""
            }`}
          >
            {formatPct(changePct, 1, true)} (24h)
          </span>
        </div>
      </div>

      <div className="trade-ticker-scroll no-scrollbar -mx-4 hidden min-w-0 flex-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:px-0">
        <div className="trade-ticker-stats flex w-max min-w-full items-center gap-5 uppercase 2xl:gap-6">
          <TickerStat
            label="Mark"
            value={formatUsd(mark, decimals === 0 ? 2 : decimals)}
          />
          <TickerStat
            label="Oracle"
            value={formatUsd(oracle, decimals === 0 ? 3 : Math.max(decimals, 2))}
          />
          <TickerStat
            label="24h change"
            value={formatPct(changePct, 2, true)}
            tone={changeUp === true ? "up" : changeUp === false ? "down" : undefined}
          />
          <TickerStat
            label="24h volume"
            value={formatCompactUsd(stats?.dailyVolume ?? rh.volume ?? cmc.volume)}
          />
          <TickerStat
            label="Open interest"
            value={formatCompactUsd(stats?.openInterest)}
          />
          <TickerStat
            label="Funding / countdown"
            value={
              funding == null
                ? "—"
                : `${funding.toFixed(4)}%${fundingCountdown ? ` - ${fundingCountdown}` : ""}`
            }
            tone={fundingUp === true ? "up" : fundingUp === false ? "down" : undefined}
          />
          <div className="trade-ticker-status ml-auto">
            <span className="trade-ticker-dot" />
            Private settlement
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="trade-ticker-stat">
      <span className="trade-ticker-label">{label}</span>
      <span
        className={`trade-ticker-value ${
          tone === "up" ? "is-up" : tone === "down" ? "is-down" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
