import { createChart, ColorType } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { TitleMark } from "./SectionHeading";
import { isoOrDateToTime } from "../utils/chartTime";

const BG = "#ffffff";
const GOLD = "#c8963e";
const FILL_TOP = "rgba(200, 150, 62, 0.28)";
const FILL_BOTTOM = "rgba(200, 150, 62, 0.04)";
const DANGER = "#c0392b";
const DANGER_TOP = "rgba(192, 57, 43, 0.22)";
const DANGER_BOTTOM = "rgba(192, 57, 43, 0.04)";
const GRID = "rgba(17, 17, 17, 0.04)";

const layoutOpts = {
  layout: {
    background: { type: ColorType.Solid, color: BG },
    textColor: "#aaaaaa",
    fontSize: 12,
    fontFamily: "JetBrains Mono, ui-monospace, monospace",
  },
  grid: {
    vertLines: { color: GRID },
    horzLines: { color: GRID },
  },
  rightPriceScale: { borderColor: "rgba(17,17,17,0.06)" },
  timeScale: { borderColor: "rgba(17,17,17,0.06)", timeVisible: true, secondsVisible: false },
};

/** @param {{ time: string|number, value: number }[]} points */
export function LineChartPanel({ title, points, height = 240, variant = "gold", embedded = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !points?.length) return undefined;

    const chart = createChart(el, {
      ...layoutOpts,
      width: el.clientWidth,
      height,
    });
    const series = chart.addAreaSeries({
      lineColor: GOLD,
      topColor: FILL_TOP,
      bottomColor: FILL_BOTTOM,
      lineWidth: 2,
    });
    series.setData(
      points.map((p) => ({
        time: isoOrDateToTime(p.time),
        value: p.value,
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
  }, [title, height, points, variant]);

  const body = (
    <div className={embedded ? "px-3 pb-3 pt-0" : title ? "px-3 pb-3 pt-0" : "px-3 pb-3 pt-3"}>
      {!points?.length ? (
        <p className="py-10 text-center text-xs font-mono text-muted">No data for this range.</p>
      ) : (
        <div ref={containerRef} className="w-full" style={{ height }} />
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="cs-card overflow-hidden">
      {title ? (
        <div className="cs-card-header pb-2">
          <div className="flex items-center gap-2.5">
            <TitleMark />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
          </div>
        </div>
      ) : null}
      {body}
    </section>
  );
}

/**
 * @param {{ date: string, value: number }[]} portfolio
 * @param {{ date: string, value: number }[]} benchmark
 */
export function ComparisonChartPanel({ title, portfolio, benchmark, benchLabel, height = 260 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !portfolio?.length || !benchmark?.length) return undefined;

    const chart = createChart(el, {
      ...layoutOpts,
      width: el.clientWidth,
      height,
    });
    const pSeries = chart.addAreaSeries({
      lineColor: GOLD,
      topColor: FILL_TOP,
      bottomColor: FILL_BOTTOM,
      lineWidth: 2,
    });
    const bSeries = chart.addLineSeries({
      color: "#aaaaaa",
      lineWidth: 2,
      title: benchLabel || "Benchmark",
    });
    pSeries.setData(portfolio.map((p) => ({ time: isoOrDateToTime(p.date), value: p.value })));
    bSeries.setData(benchmark.map((p) => ({ time: isoOrDateToTime(p.date), value: p.value })));
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [title, height, benchLabel, portfolio, benchmark]);

  const empty = !portfolio?.length || !benchmark?.length;

  return (
    <section className="cs-card overflow-hidden">
      <div className="cs-card-header pb-2">
        <div className="flex items-center gap-2.5">
          <TitleMark />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted font-mono">
          Indexed to 100 at first common date — compare your strategy to the ASX 200 proxy (total return).
        </p>
      </div>
      <div className="px-3 pb-3 pt-0">
        {empty ? (
          <p className="py-10 text-center text-xs font-mono text-muted">Not enough overlapping history in this range.</p>
        ) : (
          <div ref={containerRef} className="w-full" style={{ height }} />
        )}
      </div>
      {!empty && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 pb-4 pt-0 text-[11px] font-mono">
          <span className="font-semibold text-gold">Portfolio</span>
          <span className="text-muted">{benchLabel}</span>
        </div>
      )}
    </section>
  );
}
