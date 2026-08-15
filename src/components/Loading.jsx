export default function Loading({ size = 28, className = "", label = "Loading" }) {
  return (
    <div className={`loading-spinner ${className}`} role="status" aria-label={label}>
      <span className="spinner" style={{ width: size, height: size }} />
    </div>
  );
}

export function FullScreenLoader() {
  return (
    <div className="full-screen-loader">
      <Loading size={40} />
    </div>
  );
}
