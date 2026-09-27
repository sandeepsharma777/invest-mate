/**
 * Chart components — each wraps a raw Chart.js instance in useRef + useEffect.
 * This mirrors the original charts.js approach (canvasId + registry) but React-idiomatically.
 * Using raw Chart.js (not react-chartjs-2) to keep config factories in chartConfig.js unchanged.
 */
import { useEffect, useRef, useMemo } from "react";
import Chart from "chart.js/auto";
import { allocationDonutConfig, returnsBarConfig, investedVsCurrentConfig } from "../lib/chartConfig.js";

function ChartCanvas({ config, style }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const existing = Chart.getChart(canvasRef.current);
    if (existing) {
      existing.destroy();
    }
    if (!config) return;

    chartRef.current = new Chart(canvasRef.current, {
      ...config,
      options: {
        ...config.options,
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    let resizeObserver = null;
    if (typeof window !== "undefined" && window.ResizeObserver && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (chartRef.current) {
          chartRef.current.resize();
        }
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [config]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          ...style,
        }}
      />
    </div>
  );
}

export function AllocationDonut({ allocationRows, currency = "INR" }) {
  const config = useMemo(() => {
    return allocationRows?.length ? allocationDonutConfig(allocationRows, currency) : null;
  }, [allocationRows, currency]);
  return <ChartCanvas config={config} />;
}

export function ReturnsBarChart({ returnsRows }) {
  const config = useMemo(() => {
    return returnsRows?.length ? returnsBarConfig(returnsRows) : null;
  }, [returnsRows]);
  return <ChartCanvas config={config} />;
}

export function InvestedVsCurrentChart({ returnsRows, currency = "INR" }) {
  const config = useMemo(() => {
    return returnsRows?.length ? investedVsCurrentConfig(returnsRows, currency) : null;
  }, [returnsRows, currency]);
  return <ChartCanvas config={config} />;
}
