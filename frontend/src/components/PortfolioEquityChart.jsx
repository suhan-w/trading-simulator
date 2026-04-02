import { useEffect, useRef } from "react";
import { ColorType, createChart } from "lightweight-charts";

/**
 * Line chart of portfolio total equity over time (from API equity-history points).
 */
export default function PortfolioEquityChart({ points, height = 320 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !points?.length) return;

    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#121a22" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      timeScale: { borderColor: "#334155" },
      rightPriceScale: { borderColor: "#334155" },
    });

    const series = chart.addLineSeries({
      color: "#22c55e",
      lineWidth: 2,
    });

    const raw = points
      .map((p) => ({
        time: Math.floor(new Date(p.time).getTime() / 1000),
        value: p.equity,
      }))
      .filter((d) => !Number.isNaN(d.time))
      .sort((a, b) => a.time - b.time);

    const byTime = new Map();
    for (const d of raw) {
      byTime.set(d.time, d);
    }
    const data = Array.from(byTime.values()).sort((a, b) => a.time - b.time);
    series.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: ref.current?.clientWidth });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [points, height]);

  if (!points?.length) {
    return (
      <div className="rounded-xl border border-surface-700 bg-surface-800 p-8 text-center text-slate-500 text-sm">
        No equity history yet — execute a trade to see your portfolio value over time.
      </div>
    );
  }

  return <div ref={ref} className="w-full rounded-xl overflow-hidden border border-surface-700" />;
}
