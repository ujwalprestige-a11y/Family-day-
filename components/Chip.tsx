export function Chip({
  label,
  pressed,
  onToggle,
  paid = false,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  paid?: boolean;
}) {
  return (
    <button
      type="button"
      className={`chip${paid ? " paid" : ""}`}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      <span className="tick" />
      {label}
    </button>
  );
}
