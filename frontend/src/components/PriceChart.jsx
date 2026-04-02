import { useEffect, useRef } from "react";
import { createChart, ColorType } from "lightweight-charts";

function parseTime(bar) {
  if (bar.time.includes("T")) {
    return Math.floor(new Date(bar.time).getTime() / 1000);
  }
  const [y, m, d] = bar.time.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export default function PriceChart({ bars, height = 360 }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !bars?.length) return;

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

    chartRef.current = chart;
    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const data = bars.map((b) => ({
      time: parseTime(b),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    series.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: ref.current?.clientWidth });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, height]);

  if (!bars?.length) {
    return (
      <div className="rounded-xl border border-surface-700 bg-surface-800 p-8 text-center text-slate-500">
        No chart data
      </div>
    );
  }

  return <div ref={ref} className="w-full rounded-xl overflow-hidden border border-surface-700" />;
}
