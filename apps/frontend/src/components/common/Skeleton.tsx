import type { CSSProperties } from "react";

type Props = {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
  className?: string;
};

/** Shimmer skeleton block (uses .skel from modern-polish.css). */
export function Skeleton({ width = "100%", height = 14, radius = 6, style, className }: Props) {
  return (
    <span
      className={`skel${className ? " " + className : ""}`}
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonRow({ count = 1, gap = 8 }: { count?: number; gap?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={14} width={`${70 + Math.random() * 25}%`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton width="40%" height={14} />
      <Skeleton width="100%" height={height - 60} radius={8} />
      <Skeleton width="60%" height={10} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "1rem" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16 }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} height={14} width={`${60 + Math.random() * 30}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}
