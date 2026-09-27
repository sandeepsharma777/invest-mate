/**
 * Chart components — each wraps a raw Chart.js instance in useRef + useEffect.
 * This mirrors the original charts.js approach (canvasId + registry) but React-idiomatically.
 * Using raw Chart.js (not react-chartjs-2) to keep config factories in chartConfig.js unchanged.
 */
import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { allocationDonutConfig, returnsBarConfig, investedVsCurrentConfig } from "../lib/chartConfig";

function ChartCanvas({ config, style }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !config) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [config]);

  return <canvas ref={canvasRef} style={style} />;
}

export function AllocationDonut({ allocationRows }) {
  const config = allocationRows?.length ? allocationDonutConfig(allocationRows) : null;
  return <ChartCanvas config={config} />;
}

export function ReturnsBarChart({ returnsRows }) {
  const config = returnsRows?.length ? returnsBarConfig(returnsRows) : null;
  return <ChartCanvas config={config} />;
}

export function InvestedVsCurrentChart({ returnsRows }) {
  const config = returnsRows?.length ? investedVsCurrentConfig(returnsRows) : null;
  return <ChartCanvas config={config} />;
}
