/**
 * Reusable ReturnBadge component for standardized return percentage display.
 * Green background with ▲ for positive/zero (+160.00%).
 * Red background with ▼ for negative (-12.50%).
 * Bounds extreme numbers (>9,999% / <-9,999%) and guarantees no scientific notation.
 */
export default function ReturnBadge({ value, className = "" }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const isPositive = n >= 0;
  let formatted;
  if (n > 9999) {
    formatted = ">9,999%";
  } else if (n < -9999) {
    formatted = "<-9,999%";
  } else {
    const absStr = Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatted = `${isPositive ? "+" : "-"}${absStr}%`;
  }

  return (
    <span
      className={`return-badge ${isPositive ? "return-badge--positive" : "return-badge--negative"} ${className}`.trim()}
    >
      <span aria-hidden="true" style={{ fontSize: "12px", lineHeight: 1 }}>
        {isPositive ? "▲" : "▼"}
      </span>
      <span>{formatted}</span>
    </span>
  );
}
