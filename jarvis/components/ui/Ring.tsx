/**
 * Single-value ring gauge. A stat tile with a progress arc, not a chart:
 * one number, so no legend and no hover layer.
 */

export function Ring({
  value,
  label,
  color = "var(--accent)",
  size = 100,
  stroke = 9,
  children,
}: {
  /** 0 to 1. Null renders an empty track. */
  value: number | null;
  label: string;
  color?: string;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#132a42" strokeWidth={stroke} />
      {v > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      {children}
    </svg>
  );
}
