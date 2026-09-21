export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`brand${compact ? " compact" : ""}`}>
      {/* Plain <img> so it always renders regardless of next/image optimisation.
          Replace /public/prestige-logo.png with the real logo (PNG or SVG). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/prestige-logo.png" alt="Prestige Group" />
      <div className="b">BEYOND</div>
      <div className="s">THE SKYLINE</div>
      <p className="t">Building tomorrow, together.</p>
      <div className="d">26 SEPTEMBER 2026</div>
    </header>
  );
}
