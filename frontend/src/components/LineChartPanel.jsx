import { createChart, ColorType } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { isoOrDateToTime } from "../utils/chartTime";
import CardHeaderTitle from "./CardHeaderTitle";

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
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: GRID },
    horzLines: { color: GRID },
  },
  rightPriceScale: { borderColor: "rgba(17,17,17,0.06)" },
  timeScale: { borderColor: "rgba(17,17,17,0.06)", timeVisible: true, secondsVisible: false },
};

/** @param {{ time: string|number, value: number }[]} points */
export function LineChartPanel({
  title,
  tooltipText,
  points,
  height = 240,
  variant = "gold",
  embedded = false,
  /** Hide axes & grid — sparkline-style area chart */
  minimal = false,
  /** Keep chart frame visible even when points are empty */
  showEmptyFrame = false,
  /** Grow to parent height (embedded); `height` is the minimum pixel height */
  fillHeight = false,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || (!points?.length && !showEmptyFrame)) return undefined;

    const chartHeight = () =>
      fillHeight ? Math.max(el.clientHeight || 0, height) : height;

    const chartOptions = minimal
      ? {
          layout: {
            background: { type: ColorType.Solid, color: BG },
            textColor: "transparent",
            fontSize: 1,
            fontFamily: "system-ui, sans-serif",
            attributionLogo: false,
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
          },
          rightPriceScale: { visible: false },
          leftPriceScale: { visible: false },
          timeScale: { visible: false },
          crosshair: {
            horzLine: { visible: false, labelVisible: false },
            vertLine: { visible: false, labelVisible: false },
          },
          width: el.clientWidth,
          height: chartHeight(),
        }
      : {
          ...layoutOpts,
          width: el.clientWidth,
          height: chartHeight(),
        };

    const chart = createChart(el, chartOptions);
    const series = chart.addAreaSeries(
      minimal
        ? {
            lineColor: GOLD,
            topColor: "rgba(200, 150, 62, 0.2)",
            bottomColor: "rgba(200, 150, 62, 0.04)",
            lineWidth: 3,
          }
        : {
            lineColor: GOLD,
            topColor: FILL_TOP,
            bottomColor: FILL_BOTTOM,
            lineWidth: 2,
          }
    );
    series.setData(
      (points || []).map((p) => ({
        time: isoOrDateToTime(p.time),
        value: p.value,
      }))
    );
    if (points?.length) chart.timeScale().fitContent();

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
  }, [title, height, points, variant, minimal, showEmptyFrame, fillHeight]);

  const body = (
    <div
      className={
        minimal && embedded
          ? "w-full"
          : embedded
            ? fillHeight
              ? "flex min-h-0 flex-1 flex-col px-3 pb-3 pt-0"
              : "px-3 pb-3 pt-0"
            : title
              ? "px-3 pb-3 pt-0"
              : "px-3 pb-3 pt-3"
      }
    >
      {!points?.length && !showEmptyFrame ? (
        <p
          className={`text-center text-xs text-muted ${
            minimal
              ? `flex items-center justify-center font-sans border-b border-ink/[0.08] leading-none`
              : fillHeight
                ? "flex min-h-0 flex-1 items-center justify-center py-10 font-mono"
                : "py-10 font-mono"
          }`}
          style={
            minimal
              ? { minHeight: height }
              : fillHeight
                ? { minHeight: height }
                : undefined
          }
        >
          No data for this range.
        </p>
      ) : (
        <div
          ref={containerRef}
          className={`w-full ${fillHeight ? "min-h-0 flex-1" : ""} ${minimal ? "border-b border-ink/[0.08]" : ""}`}
          style={fillHeight ? { minHeight: height } : { height }}
        />
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="cs-card overflow-hidden">
      {title ? (
        <div className="cs-card-header pb-2">
          <CardHeaderTitle title={title} tooltipText={tooltipText} headingLevel={3} />
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
export function ComparisonChartPanel({
  title,
  tooltipText,
  portfolio,
  benchmark,
  benchLabel,
  height = 260,
}) {
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
        <CardHeaderTitle
          title={title}
          tooltipText={tooltipText}
          subtitle="Indexed to 100 at first common date — compare your strategy to the ASX 200 proxy (total return)."
          headingLevel={3}
        />
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
