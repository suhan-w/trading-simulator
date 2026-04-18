import { createChart, ColorType } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { isoOrDateToTime } from "../utils/chartTime";
import CardHeaderTitle from "./CardHeaderTitle";

const BG = "#ffffff";
const GRID = "rgba(17, 17, 17, 0.04)";
const PROFIT = "#2d8a55";
const DANGER = "#c0392b";

const layoutOpts = {
  layout: {
    background: { type: ColorType.Solid, color: BG },
    textColor: "#aaaaaa",
    fontSize: 11,
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: GRID },
    horzLines: { color: GRID },
  },
  rightPriceScale: { borderColor: "rgba(17,17,17,0.06)" },
  timeScale: { borderColor: "rgba(17,17,17,0.06)", timeVisible: true, secondsVisible: false },
};

/** @param {{ date: string, return_pct: number }[]} rows */
export default function DailyReturnHistogram({
  title = "",
  tooltipText = "",
  rows,
  height = 220,
  embedded = false,
  /** Grow to parent height (e.g. Performance chart cards); `height` is the minimum pixel height */
  fillHeight = false,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !rows?.length) return undefined;

    const chartHeight = () =>
      fillHeight ? Math.max(el.clientHeight || 0, height) : height;

    const chart = createChart(el, {
      ...layoutOpts,
      width: el.clientWidth,
      height: chartHeight(),
    });
    const series = chart.addHistogramSeries({
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    series.setData(
      rows.map((r) => ({
        time: isoOrDateToTime(r.date),
        value: r.return_pct,
        color: r.return_pct >= 0 ? PROFIT : DANGER,
      }))
    );
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth <= 0) return;
      if (fillHeight) {
        const h = Math.max(el.clientHeight, height);
        if (h > 0) chart.applyOptions({ width: el.clientWidth, height: h });
      } else {
        chart.applyOptions({ width: el.clientWidth });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [rows, height, fillHeight]);

  const body = !rows?.length ? (
    <p
      className={`text-center font-mono text-sm text-[#888] ${
        fillHeight ? "flex min-h-0 flex-1 items-center justify-center py-8" : "py-10"
      }`}
    >
      No data available for this range
    </p>
  ) : (
    <div
      ref={containerRef}
      className={`w-full ${fillHeight ? "min-h-0 flex-1" : ""}`}
      style={fillHeight ? { minHeight: height } : { height }}
    />
  );

  if (embedded) {
    return body;
  }

  return (
    <section className="cs-card overflow-hidden">
      <div className="cs-card-header pb-2">
        <CardHeaderTitle title={title} tooltipText={tooltipText} headingLevel={3} />
      </div>
      <div className="px-3 pb-3 pt-0">{body}</div>
    </section>
  );
}
