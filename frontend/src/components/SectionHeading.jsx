/** Single 8×8px brand square (#c8963e) — use once before section titles only */
export function TitleMark({ className = "" }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 bg-[#c8963e] ${className}`}
      aria-hidden
    />
  );
}

export default function SectionHeading({ title, subtitle, className = "" }) {
  return (
    <div className={className}>
      <div className="flex items-start gap-2.5">
        <TitleMark className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
