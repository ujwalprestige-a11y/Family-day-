export function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="overlay" role="alert" aria-live="assertive">
      <div className="overlay-card">
        <span className="spinner" aria-hidden="true" />
        <span className="overlay-msg">{message}</span>
      </div>
    </div>
  );
}
