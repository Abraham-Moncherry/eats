export default function EatsLoader({ compact = false }: { compact?: boolean }) {
  return <div className={`eats-loader${compact ? " compact" : ""}`} role="status" aria-label="Loading">
    <span className="loader-ring" />
    <span className="loader-ring second" />
    <img src="/eats-logo.png" alt="" />
    <span className="sr-only">Loading</span>
  </div>;
}
