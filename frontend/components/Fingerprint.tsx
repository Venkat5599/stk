/*
  The signature of this product.

  A program's SHA-256 drawn as 32 bars, one per byte, height and tone taken
  from the byte's value. It is not decoration: two programs that deployed the
  same bytecode produce the same 32 bars, so a copy is recognisable at a glance
  before you have read a single character of the address beside it.

  Deterministic and pure — same hash in, same mark out, on the server and in
  the browser. Nothing here animates, so it can never render blank.
*/

interface FingerprintProps {
  /** hex SHA-256 */
  sha256: string;
  /** overall height in px; bars scale to it */
  height?: number;
  /** a copy is drawn recessed, so the eye separates the two verdicts by tone */
  muted?: boolean;
}

const BYTES = 32;

export function Fingerprint({ sha256, height = 28, muted = false }: FingerprintProps) {
  const bars: number[] = [];
  for (let i = 0; i < BYTES; i++) {
    const hex = sha256.slice(i * 2, i * 2 + 2);
    const value = Number.parseInt(hex, 16);
    bars.push(Number.isNaN(value) ? 0 : value);
  }

  const gap = 1;
  const barWidth = 2;
  const width = BYTES * barWidth + (BYTES - 1) * gap;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`bytecode fingerprint ${sha256.slice(0, 12)}`}
      shapeRendering="crispEdges"
    >
      {bars.map((value, i) => {
        // Floor at 12% so a low byte is still a visible mark rather than a gap,
        // which would read as missing data instead of a small value.
        const ratio = 0.12 + (value / 255) * 0.88;
        const barHeight = Math.max(1, Math.round(height * ratio));
        const opacity = muted ? 0.2 + (value / 255) * 0.3 : 0.34 + (value / 255) * 0.66;
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            fill={muted ? "var(--verdict-copy)" : "var(--verdict-new)"}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}
