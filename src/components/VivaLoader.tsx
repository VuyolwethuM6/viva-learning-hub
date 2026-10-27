import "./viva-loader.css";

type LoaderSize = "page" | "section" | "inline" | "button";
/** Centered, branded progress feedback. No delay or fabricated percentage. */
export function VivaLoader({
  size = "section",
  label = "Loading…",
  className = "",
  decorative = false,
}: {
  size?: LoaderSize;
  label?: string;
  className?: string;
  decorative?: boolean;
}) {
  const compact = size === "button";
  return (
    <span
      className={`viva-progress-frame viva-progress-${size} ${className}`}
      role={decorative || compact ? undefined : "status"}
      aria-live={decorative || compact ? undefined : "polite"}
      aria-atomic={decorative || compact ? undefined : true}
      aria-hidden={decorative || compact ? true : undefined}
    >
      <span className="viva-progress-content">
        <span className="viva-progress-visual" aria-hidden="true">
          <span className="viva-progress-glow" />
          <span className="viva-progress-ring" />
          {!compact && (
            <>
              <span className="viva-progress-inner" />
              <img
                className="viva-progress-logo"
                src="/viva-tutorials-logo.png"
                alt=""
                width="96"
                height="96"
              />
            </>
          )}
        </span>
        {!decorative && !compact && (
          <span className="viva-progress-label">{label}</span>
        )}
        {!compact && size !== "inline" && (
          <span className="viva-progress-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
      </span>
    </span>
  );
}
