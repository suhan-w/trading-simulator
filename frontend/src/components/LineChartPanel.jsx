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
  /** No extra horizontal padding when embedded (e.g. Performance chart cards) */
  embeddedTight = false,
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
    const areaOpts =
      minimal
        ? {
            lineColor: GOLD,
            topColor: "rgba(200, 150, 62, 0.2)",
            bottomColor: "rgba(200, 150, 62, 0.04)",
            lineWidth: 3,
          }
        : variant === "danger"
          ? {
              lineColor: DANGER,
              topColor: DANGER_TOP,
              bottomColor: DANGER_BOTTOM,
              lineWidth: 2,
            }
          : variant === "performance-drawdown"
            ? {
                lineColor: GOLD,
                topColor: "rgba(200, 150, 62, 0.15)",
                bottomColor: "rgba(200, 150, 62, 0.04)",
                lineWidth: 2,
          }
        : {
            lineColor: GOLD,
            topColor: FILL_TOP,
            bottomColor: FILL_BOTTOM,
            lineWidth: 2,
              };
    const series = chart.addAreaSeries(areaOpts);
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
          : embedded && embeddedTight
            ? fillHeight
              ? "flex min-h-0 w-full flex-1 flex-col"
              : "w-full"
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
          className={`text-center text-sm text-[#888] ${
            minimal
              ? `flex items-center justify-center border-b border-ink/[0.08] font-sans leading-none`
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
          No data available for this range
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

const pctPriceFormat = {
  type: "custom",
  minMove: 0.01,
  formatter: (p) => `${Number(p).toFixed(2)}%`,
};

/**
 * @param {{ date: string, value: number }[]} portfolio
 * @param {{ date: string, value: number }[]} benchmark
 * @param {{ dailyPercentComparison?: boolean }} props
 */
export function ComparisonChartPanel({
  title = "",
  tooltipText = "",
  portfolio,
  benchmark,
  benchLabel,
  height = 260,
  embedded = false,
  dailyPercentComparison = false,
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
      ...(dailyPercentComparison ? { priceFormat: pctPriceFormat } : {}),
    });
    const bSeries = chart.addLineSeries({
      color: "#aaaaaa",
      lineWidth: 2,
      // No `title` — library draws an on-canvas legend that overlaps small plots; HTML legend below shows the label.
      ...(dailyPercentComparison ? { priceFormat: pctPriceFormat } : {}),
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
  }, [title, height, benchLabel, portfolio, benchmark, dailyPercentComparison]);

  const empty = !portfolio?.length || !benchmark?.length;

  const legend = !empty && (
    <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-[11px] font-mono text-[#aaa]">
      <span className="font-semibold text-gold">Portfolio{dailyPercentComparison ? " (daily %)" : ""}</span>
      <span>
        {benchLabel}
        {dailyPercentComparison ? " (daily %)" : ""}
      </span>
    </div>
  );

  const chartBody = empty ? (
    <p className="py-10 text-center font-mono text-sm text-[#888]">No data available for this range</p>
  ) : (
    <div ref={containerRef} className="w-full" style={{ height }} />
  );

  if (embedded) {
    return (
      <div className="perf-comparison-embedded flex min-h-0 flex-1 flex-col">
        <div
          className={`perf-chart-area flex min-h-0 flex-1 flex-col ${empty ? "items-center justify-center" : ""}`}
        >
          {chartBody}
        </div>
        {legend}
      </div>
    );
  }

  return (
    <section className="cs-card overflow-hidden">
      <div className="cs-card-header pb-2">
        <CardHeaderTitle
          title={title}
          tooltipText={tooltipText}
          subtitle="Compare portfolio vs benchmark on the same timeline (indexed or daily %, depending on data source)."
          headingLevel={3}
        />
      </div>
      <div className="px-3 pb-3 pt-0">
        {chartBody}
      </div>
      {legend ? <div className="px-5 pb-4 pt-0">{legend}</div> : null}
    </section>
  );
}
