import { createChart, ColorType } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { isoOrDateToTime } from "../utils/chartTime";
import CardHeaderTitle from "./CardHeaderTitle";

const BG = "#ffffff";
const GOLD = "#c8963e";
const MUTED = "#aaaaaa";
const GRID = "rgba(17, 17, 17, 0.04)";
const PROFIT = "#2d8a55";
const DANGER = "#c0392b";

/** Minimum plot height; charts grow with the card when the grid row stretches */
export const BACKTEST_CHART_PLOT_HEIGHT = 220;

/** @typedef {"full" | "plot"} BacktestChartChrome */

/** Expand modal: avoid `height: 100%` on the chart root — parent flex height was not resolving, so the plot mount stayed ~0px while LWC sized to `minH` only (lines clipped / off-canvas). */
function plotChromeRootStyle(h) {
  return {
    width: "100%",
    height: h,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  };
}

const layoutOpts = {
  layout: {
    background: { type: ColorType.Solid, color: BG },
    textColor: MUTED,
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

function chartSize(el, minH) {
  const w = Math.floor(el.clientWidth);
  const h = Math.max(minH, Math.floor(el.clientHeight || minH));
  return { width: Math.max(w, 0), height: Math.max(h, minH) };
}

/** @param {{ children?: import("react").ReactNode }} props */
function BacktestChartFooter({ children }) {
  return <div className="backtest-chart-footer">{children ?? null}</div>;
}

/** @param {{ comparison: { date: string, strategy: number, benchmark: number }[], height?: number, chrome?: BacktestChartChrome }} props */
export function BacktestVsBenchmarkChart({
  comparison,
  height = BACKTEST_CHART_PLOT_HEIGHT,
  chrome = "full",
}) {
  const ref = useRef(null);
  const plot = chrome === "plot";
  const Root = plot ? "div" : "section";
  useEffect(() => {
    const el = ref.current;
    if (!el || !comparison?.length) return undefined;
    const s0 = chartSize(el, height);
    const chart = createChart(el, { ...layoutOpts, width: s0.width, height: s0.height });
    const s1 = chart.addLineSeries({ color: GOLD, lineWidth: 2, title: "Strategy" });
    const s2 = chart.addLineSeries({ color: MUTED, lineWidth: 2, title: "ASX 200" });
    s1.setData(comparison.map((r) => ({ time: isoOrDateToTime(r.date), value: r.strategy })));
    s2.setData(comparison.map((r) => ({ time: isoOrDateToTime(r.date), value: r.benchmark })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      const s = chartSize(el, height);
      if (s.width > 0 && s.height > 0) chart.applyOptions(s);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [comparison, height]);
  if (!comparison?.length) return null;
  return (
    <Root
      className={plot ? "flex min-h-0 flex-col" : "backtest-chart-card"}
      style={plot ? plotChromeRootStyle(height) : undefined}
    >
      {!plot ? (
        <div className="cs-card-header pb-2">
          <CardHeaderTitle
            headingLevel={3}
            title="Strategy vs ASX 200"
            tooltipText="Indexed to 100 at the first date — strategy equity vs ^AXJO total return (yfinance, adjusted close)."
          />
        </div>
      ) : null}
      <div className={plot ? "backtest-chart-plot min-h-0 flex-1 px-1" : "backtest-chart-plot px-3 pb-2"}>
        <div ref={ref} className="backtest-chart-plot-mount" />
      </div>
      <BacktestChartFooter>
        <span className="font-semibold text-gold">Strategy</span>
        <span>^AXJO</span>
      </BacktestChartFooter>
    </Root>
  );
}

/** @param {{ daily: { date: string, return: number }[], height?: number, chrome?: BacktestChartChrome }} props */
export function BacktestDailyReturnsChart({
  daily,
  height = BACKTEST_CHART_PLOT_HEIGHT,
  chrome = "full",
}) {
  const ref = useRef(null);
  const plot = chrome === "plot";
  const Root = plot ? "div" : "section";
  useEffect(() => {
    const el = ref.current;
    if (!el || !daily?.length) return undefined;
    const s0 = chartSize(el, height);
    const chart = createChart(el, { ...layoutOpts, width: s0.width, height: s0.height });
    const series = chart.addHistogramSeries({
      priceFormat: { type: "price", precision: 3, minMove: 0.001 },
    });
    series.setData(
      daily.map((r) => ({
        time: isoOrDateToTime(r.date),
        value: r.return,
        color: r.return >= 0 ? PROFIT : DANGER,
      }))
    );
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      const s = chartSize(el, height);
      if (s.width > 0 && s.height > 0) chart.applyOptions(s);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [daily, height]);
  if (!daily?.length) return null;
  return (
    <Root
      className={plot ? "flex min-h-0 flex-col" : "backtest-chart-card"}
      style={plot ? plotChromeRootStyle(height) : undefined}
    >
      {!plot ? (
        <div className="cs-card-header pb-2">
          <CardHeaderTitle
            headingLevel={3}
            title="Daily returns"
            tooltipText="Per-session strategy return (%). Green positive, red negative."
          />
        </div>
      ) : null}
      <div className={plot ? "backtest-chart-plot min-h-0 flex-1 px-1" : "backtest-chart-plot px-3 pb-2"}>
        <div ref={ref} className="backtest-chart-plot-mount" />
      </div>
      {!plot ? <BacktestChartFooter /> : null}
    </Root>
  );
}

/** @param {{ drawdown: { date: string, drawdown_pct: number }[], height?: number, chrome?: BacktestChartChrome }} props */
export function BacktestDrawdownChart({
  drawdown,
  height = BACKTEST_CHART_PLOT_HEIGHT,
  chrome = "full",
}) {
  const ref = useRef(null);
  const plot = chrome === "plot";
  const Root = plot ? "div" : "section";
  useEffect(() => {
    const el = ref.current;
    if (!el || !drawdown?.length) return undefined;
    const s0 = chartSize(el, height);
    const chart = createChart(el, { ...layoutOpts, width: s0.width, height: s0.height });
    const series = chart.addAreaSeries({
      lineColor: DANGER,
      topColor: "rgba(192, 57, 43, 0.25)",
      bottomColor: "rgba(192, 57, 43, 0.02)",
      lineWidth: 2,
    });
    series.setData(drawdown.map((r) => ({ time: isoOrDateToTime(r.date), value: r.drawdown_pct })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      const s = chartSize(el, height);
      if (s.width > 0 && s.height > 0) chart.applyOptions(s);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [drawdown, height]);
  if (!drawdown?.length) return null;
  return (
    <Root
      className={plot ? "flex min-h-0 flex-col" : "backtest-chart-card"}
      style={plot ? plotChromeRootStyle(height) : undefined}
    >
      {!plot ? (
        <div className="cs-card-header pb-2">
          <CardHeaderTitle
            headingLevel={3}
            title="Drawdown"
            tooltipText="Peak-to-trough decline of the strategy equity curve (%)."
          />
        </div>
      ) : null}
      <div className={plot ? "backtest-chart-plot min-h-0 flex-1 px-1" : "backtest-chart-plot px-3 pb-2"}>
        <div ref={ref} className="backtest-chart-plot-mount" />
      </div>
      {!plot ? <BacktestChartFooter /> : null}
    </Root>
  );
}

/** @param {{ signals: { dates: string[], close: number[], markers: { date: string, side: string, price: number }[] }, height?: number, chrome?: BacktestChartChrome }} props */
export function BacktestSignalsChart({
  signals,
  height = BACKTEST_CHART_PLOT_HEIGHT,
  chrome = "full",
}) {
  const ref = useRef(null);
  const plot = chrome === "plot";
  const Root = plot ? "div" : "section";
  useEffect(() => {
    const el = ref.current;
    if (!el || !signals?.dates?.length || !signals?.close?.length) return undefined;
    const s0 = chartSize(el, height);
    const chart = createChart(el, { ...layoutOpts, width: s0.width, height: s0.height });
    const line = chart.addLineSeries({ color: GOLD, lineWidth: 2, title: "Close" });
    const pts = signals.dates.map((d, i) => ({
      time: isoOrDateToTime(d),
      value: signals.close[i] ?? signals.close[signals.close.length - 1],
    }));
    line.setData(pts);
    const mk = (signals.markers || []).map((m) => ({
      time: isoOrDateToTime(m.date),
      position: m.side === "buy" ? "belowBar" : "aboveBar",
      color: m.side === "buy" ? PROFIT : DANGER,
      shape: m.side === "buy" ? "arrowUp" : "arrowDown",
      text: m.side === "buy" ? "Buy" : "Sell",
      size: 1,
    }));
    if (mk.length) line.setMarkers(mk);
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      const s = chartSize(el, height);
      if (s.width > 0 && s.height > 0) chart.applyOptions(s);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [signals, height]);
  if (!signals?.dates?.length) return null;
  return (
    <Root
      className={plot ? "flex min-h-0 flex-col" : "backtest-chart-card"}
      style={plot ? plotChromeRootStyle(height) : undefined}
    >
      {!plot ? (
        <div className="cs-card-header pb-2">
          <CardHeaderTitle
            headingLevel={3}
            title="Price & signals"
            tooltipText="Instrument close with reported buy/sell markers from your strategy."
          />
        </div>
      ) : null}
      <div className={plot ? "backtest-chart-plot min-h-0 flex-1 px-1" : "backtest-chart-plot px-3 pb-2"}>
        <div ref={ref} className="backtest-chart-plot-mount" />
      </div>
      {!plot ? <BacktestChartFooter /> : null}
    </Root>
  );
}
