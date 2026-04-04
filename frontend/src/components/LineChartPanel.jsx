import { createChart, ColorType } from "lightweight-charts";
import { useEffect, useRef } from "react";

const layoutOpts = {
  layout: {
    background: { type: ColorType.Solid, color: "#121a22" },
    textColor: "#94a3b8",
  },
  grid: {
    vertLines: { color: "#1a2430" },
    horzLines: { color: "#1a2430" },
  },
  rightPriceScale: { borderColor: "#1a2430" },
  timeScale: { borderColor: "#1a2430", timeVisible: true, secondsVisible: false },
};

function isoOrDateToTime(t) {
  if (typeof t === "number" && !Number.isNaN(t)) return t;
  const s = String(t);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 1000);
  }
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

/** @param {{ time: string|number, value: number }[]} points */
export function LineChartPanel({ title, points, color = "#22c55e", height = 240 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !points?.length) return undefined;

    const chart = createChart(el, {
      ...layoutOpts,
      width: el.clientWidth,
      height,
    });
    chartRef.current = chart;
    const series = chart.addLineSeries({ color, lineWidth: 2 });
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
      chartRef.current = null;
    };
  }, [title, height, color, points]);

  return (
    <section className="rounded-xl border border-surface-700 bg-surface-800/40 p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">{title}</h3>
      {!points?.length ? (
        <p className="text-slate-500 text-sm py-8 text-center">No data for this range.</p>
      ) : (
        <div ref={containerRef} className="w-full" style={{ height }} />
      )}
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
    const pSeries = chart.addLineSeries({ color: "#22c55e", lineWidth: 2, title: "Portfolio (norm.)" });
    const bSeries = chart.addLineSeries({ color: "#38bdf8", lineWidth: 2, title: benchLabel || "Benchmark" });
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
    <section className="rounded-xl border border-surface-700 bg-surface-800/40 p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">Indexed to 100 at first common date in range (total return).</p>
      {empty ? (
        <p className="text-slate-500 text-sm py-8 text-center">
          Not enough overlapping history for portfolio and benchmark in this range.
        </p>
      ) : (
        <div ref={containerRef} className="w-full" style={{ height }} />
      )}
      {!empty && (
        <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-accent rounded" /> Portfolio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-sky-400 rounded" /> {benchLabel}
          </span>
        </div>
      )}
    </section>
  );
}
