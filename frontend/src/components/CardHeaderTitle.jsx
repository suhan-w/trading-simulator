import { useId, useState } from "react";

const levels = { 2: "h2", 3: "h3", 4: "h4" };

/**
 * Card / panel header: .card-title, optional pixel tooltip, optional .card-subtitle, optional right slot (e.g. tabs).
 * @param {{ title: string, subtitle?: string, tooltipText?: string, right?: import("react").ReactNode, headingLevel?: 2 | 3 | 4, className?: string, titleClassName?: string }} props
 */
export default function CardHeaderTitle({
  title,
  subtitle,
  tooltipText,
  right,
  headingLevel = 2,
  className = "",
  titleClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const H = levels[headingLevel] || "h2";

  return (
    <div className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="card-title-row min-w-0">
            <H className={`card-title ${titleClassName}`.trim()}>{title}</H>
            {tooltipText ? (
              <button
                type="button"
                className="pixel-tooltip-btn"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={panelId}
                aria-label="About this section"
              />
            ) : null}
          </div>
          {open && tooltipText ? (
            <div id={panelId} className="pixel-tooltip-text" role="region">
              {tooltipText}
            </div>
          ) : null}
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </div>
  );
}
