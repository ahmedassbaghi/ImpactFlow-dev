import {
  IMPACTFLOW_LOGO_ICON,
  IMPACTFLOW_LOGO_LOCKUP,
  IMPACTFLOW_TAGLINE,
} from "../../constants/branding";

type Props = {
  /** Icon only or icon + wordmark */
  variant?: "icon" | "lockup";
  /** Light pad for logos exported on black */
  onDark?: boolean;
  className?: string;
  height?: number;
  alt?: string;
  showTagline?: boolean;
};

export default function ImpactFlowLogo({
  variant = "lockup",
  onDark = false,
  className = "",
  height,
  alt = "ImpactFlow",
  showTagline = false,
}: Props) {
  const src = variant === "icon" ? IMPACTFLOW_LOGO_ICON : IMPACTFLOW_LOGO_LOCKUP;
  const defaultHeight = variant === "icon" ? 36 : 40;
  const h = height ?? defaultHeight;

  return (
    <span
      className={[
        "if-logo",
        variant === "icon" ? "if-logo--icon" : "if-logo--lockup",
        onDark ? "if-logo--on-dark" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <img
        src={src}
        alt={alt}
        className="if-logo__img"
        style={{ height: h }}
        decoding="async"
      />
      {showTagline && (
        <span className="if-logo__tagline">{IMPACTFLOW_TAGLINE}</span>
      )}
    </span>
  );
}
