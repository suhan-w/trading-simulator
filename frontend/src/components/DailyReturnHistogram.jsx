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
export default function DailyReturnHistogram({ title, tooltipText, rows, height = 220 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !rows?.length) return undefined;

    const chart = createChart(el, {
      ...layoutOpts,
      width: el.clientWidth,
      height,
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
      if (el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [rows, height]);

  return (
    <section className="cs-card overflow-hidden">
      <div className="cs-card-header pb-2">
        <CardHeaderTitle title={title} tooltipText={tooltipText} headingLevel={3} />
      </div>
      <div className="px-3 pb-3 pt-0">
        {!rows?.length ? (
          <p className="py-10 text-center text-xs font-mono text-muted">No daily data in this range.</p>
        ) : (
          <div ref={containerRef} className="w-full" style={{ height }} />
        )}
      </div>
    </section>
  );
}
