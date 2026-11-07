import { fractionLabel } from "./MathText";

/** Accurate fraction bars: every bar has the same total width (equal wholes), split into equal parts. */
export function FractionBars({ bars }: { bars: { label: string; numerator: number; denominator: number }[] }) {
  const W = 480;
  const H = 44;
  return (
    <figure className="space-y-3">
      {bars.map((b) => {
        const part = W / b.denominator;
        return (
          <div key={b.label}>
            <p className="text-sm font-semibold mb-1">{b.label}</p>
            <svg
              viewBox={`0 0 ${W + 4} ${H + 4}`}
              className="w-full max-w-lg h-auto"
              role="img"
              aria-label={`A bar split into ${b.denominator} equal parts with ${b.numerator} shaded: ${fractionLabel(b.numerator, b.denominator)} of the whole.`}
            >
              {Array.from({ length: b.denominator }, (_, i) => (
                <rect
                  key={i}
                  x={2 + i * part}
                  y={2}
                  width={part}
                  height={H}
                  fill={i < b.numerator ? "var(--violet)" : "white"}
                  fillOpacity={i < b.numerator ? 0.85 : 1}
                  stroke="var(--navy)"
                  strokeWidth={2}
                />
              ))}
            </svg>
          </div>
        );
      })}
      <figcaption className="text-xs text-navy-soft">Both bars are the same length, so the wholes are equal.</figcaption>
    </figure>
  );
}
