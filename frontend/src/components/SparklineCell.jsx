import { createChart, ColorType } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { isoOrDateToTime } from "../utils/chartTime";

const GOLD = "#c8963e";
const GRID = "rgba(17, 17, 17, 0.02)";

/** @param {{ date: string, close: number }[]} points */
export default function SparklineCell({ points }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !points?.length) return undefined;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 36,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "transparent",
        fontSize: 1,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: GRID },
      },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      crosshair: { mode: 0 },
    });

    const series = chart.addLineSeries({
      color: GOLD,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(points.map((p) => ({ time: isoOrDateToTime(p.date), value: p.close })));
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [points]);

  if (!points?.length) {
    return <span className="inline-block h-9 min-w-[4rem] text-[10px] text-muted font-mono align-middle">—</span>;
  }

  return <div ref={ref} className="h-9 w-full min-w-[5rem] max-w-[120px]" />;
}
