import { Link } from "react-router-dom";

export default function BrandMark() {
  return (
    <Link to="/" className="group flex items-center gap-3 shrink-0 min-w-0">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-ink shadow-card-sm">
        <span className="text-[11px] font-bold tracking-tight text-white">CS</span>
      </div>
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="truncate text-lg font-semibold tracking-tight">
          <span className="text-ink">Cowrie</span>
          <span className="text-gold">Shell</span>
        </span>
        <span className="text-xs text-muted">Paper trading · ASX · AUD</span>
      </div>
    </Link>
  );
}
