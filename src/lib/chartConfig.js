/**
 * InvestMate — Chart.js configuration helpers.
 * Ported from charts.js; formatCompact imported from utils instead of Utils global.
 * Used by AllocationDonut.jsx, ReturnsBarChart.jsx, InvestedVsCurrentChart.jsx.
 */
import { formatCompact, formatPercent } from "./utils.js";

export const PALETTE = {
  stocks: "#2F6B7D",
  mutual_fund: "#6B4F9E",
  gold: "#A9822F",
  fixed_deposit: "#2F6B4C",
  crypto: "#B4622F",
  other: "#5C6A73",
};

export function allocationDonutConfig(allocationRows, currency = "INR") {
  const labels = allocationRows.map((r) => r.label);
  const values = allocationRows.map((r) => r.value);
  const colors = allocationRows.map((r) => PALETTE[r.asset_type] || PALETTE.other);

  return {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: "#FBF8F1",
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      cutout: "72%",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#141B21",
          titleFont: { family: "IBM Plex Sans" },
          bodyFont: { family: "IBM Plex Mono" },
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: (item) => ` ${item.label}: ${formatCompact(item.raw, currency)}` },
        },
      },
    },
  };
}

export function returnsBarConfig(returnsRows) {
  const labels = returnsRows.map((r) => r.label);
  const values = returnsRows.map((r) => r.percent_return);
  const colors = values.map((v) => (v >= 0 ? "#2F6B4C" : "#8A2F3C"));

  return {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
        maxBarThickness: 42,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#141B21",
          bodyFont: { family: "IBM Plex Mono" },
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: (item) => ` ${formatPercent(item.raw)}` },
        },
      },
      scales: {
        y: {
          ticks: { callback: (v) => v + "%", font: { family: "IBM Plex Mono", size: 11 }, color: "#6B6152" },
          grid: { color: "#EFE9DA" },
        },
        x: {
          ticks: { font: { family: "IBM Plex Sans", size: 11, weight: "600" }, color: "#201A12" },
          grid: { display: false },
        },
      },
    },
  };
}

export function investedVsCurrentConfig(returnsRows, currency = "INR") {
  return {
    type: "bar",
    data: {
      labels: returnsRows.map((r) => r.label),
      datasets: [
        { label: "Invested", data: returnsRows.map((r) => r.invested), backgroundColor: "#DDD3BC", borderRadius: 6, maxBarThickness: 26 },
        { label: "Current value", data: returnsRows.map((r) => r.current), backgroundColor: "#C9A24B", borderRadius: 6, maxBarThickness: 26 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { family: "IBM Plex Sans", size: 11 }, color: "#201A12", boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } },
        tooltip: {
          backgroundColor: "#141B21",
          bodyFont: { family: "IBM Plex Mono" },
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: (item) => ` ${item.dataset.label}: ${formatCompact(item.raw, currency)}` },
        },
      },
      scales: {
        y: { ticks: { callback: (v) => formatCompact(v, currency), font: { family: "IBM Plex Mono", size: 10 }, color: "#6B6152" }, grid: { color: "#EFE9DA" } },
        x: { ticks: { font: { family: "IBM Plex Sans", size: 11, weight: "600" }, color: "#201A12" }, grid: { display: false } },
      },
    },
  };
}
