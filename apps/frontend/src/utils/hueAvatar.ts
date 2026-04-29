/** Deterministically derive a HSL background from a string (name, id, etc.). */
export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function avatarStyle(s: string): React.CSSProperties {
  const hue = hueFromString(s || "?");
  return {
    background: `linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${(hue + 30) % 360} 65% 50%))`,
    color: "#ffffff",
  };
}

export function avatarInitial(s: string | null | undefined): string {
  const t = (s ?? "?").trim();
  return (t[0] ?? "?").toUpperCase();
}
