/** Compact school label: abbreviation with full name on hover/focus. */
export function SchoolBadge({
  abbreviation,
  name,
  className = "",
}: {
  abbreviation?: string | null;
  name?: string | null;
  className?: string;
}) {
  if (!abbreviation && !name) return <span className={`school-badge school-badge--empty ${className}`}>—</span>;
  const abbr = abbreviation ?? name?.slice(0, 3).toUpperCase() ?? "?";
  return (
    <span
      className={`school-badge ${className}`}
      title={name ?? abbr}
      aria-label={name ? `Escola: ${name}` : abbr}
    >
      {abbr}
    </span>
  );
}
