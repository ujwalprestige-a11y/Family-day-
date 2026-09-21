export function CheckTick({ animate = true }: { animate?: boolean }) {
  return (
    <div className={`tickwrap${animate ? "" : " static"}`}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0" stopColor="#C9A961" />
            <stop offset=".55" stopColor="#A88944" />
            <stop offset="1" stopColor="#8A6D2B" />
          </linearGradient>
        </defs>
        <circle cx="42" cy="42" r="40" transform="rotate(-90 42 42)" />
        <path d="M26 43l11 11 21-23" />
      </svg>
    </div>
  );
}
