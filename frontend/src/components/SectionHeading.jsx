import { useId, useState } from "react";

/**
 * Page-level title: large bold title, grey subtitle, optional pixel tooltip.
 * @param {{ title: string, subtitle?: string, tooltipText?: string, className?: string, right?: import("react").ReactNode }} props
 */
export default function SectionHeading({ title, subtitle, tooltipText, className = "", right = null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`page-section-heading ${className}`.trim()}>
      <div className="page-title-row">
        <h1 className="page-title">{title}</h1>
        {tooltipText ? (
          <button
            type="button"
            className="pixel-tooltip-btn"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label="About this page"
          />
        ) : null}
        {right ? <div className="ml-auto flex shrink-0 items-center">{right}</div> : null}
      </div>
      {open && tooltipText ? (
        <div id={panelId} className="pixel-tooltip-text" role="region">
          {tooltipText}
        </div>
      ) : null}
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </div>
  );
}
