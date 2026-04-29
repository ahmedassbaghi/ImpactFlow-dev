/* ════════════════════════════════════════════════════════════════════
   OUTCOMES STAR — radial 4-axis 5-level input.

   Inspired by the Triangle Consulting "Outcomes Star" used by 1000+ UK
   social-care charities. The user selects a level (1-5) on each of the
   four IPI axes by clicking on a concentric ring along the corresponding
   axis. Anchored descriptions per (axis, level) make the captured value
   unambiguous and comparable across professionals.

   Output shape (1-5 per dim) is identical to the classic stars mode, so
   IPI / risk / effect calculations are unchanged downstream.
   ════════════════════════════════════════════════════════════════════ */

import { motion } from "framer-motion";
import { useState } from "react";
import {
  DIM_LABELS, STAR_ANCHORS, STAR_LEVEL_TAGS,
  type DimKey,
} from "./inputModeData";

const DIM_ORDER: DimKey[] = [
  "academicScore",     // top
  "cognitiveScore",    // right
  "socialScore",       // bottom
  "integrationScore",  // left
];

const DIM_COLORS: Record<DimKey, string> = {
  academicScore:    "var(--dim-academic)",
  cognitiveScore:   "var(--dim-cognitive)",
  socialScore:      "var(--dim-social)",
  integrationScore: "var(--dim-integration)",
};

const SIZE = 280;
const CENTER = SIZE / 2;
const MAX_R = 110;
const LEVELS: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

/** Angle in radians for axis index 0..3 (top, right, bottom, left). */
function axisAngle(axisIdx: number): number {
  return -Math.PI / 2 + axisIdx * (Math.PI / 2);
}

function pointFor(axisIdx: number, level: number): [number, number] {
  const a = axisAngle(axisIdx);
  const r = (level / 5) * MAX_R;
  return [CENTER + Math.cos(a) * r, CENTER + Math.sin(a) * r];
}

type Scores = Record<DimKey, number>;

export function OutcomesStar({
  scores,
  onChange,
}: {
  scores: Scores;
  onChange: (dim: DimKey, value: number) => void;
}) {
  const [hover, setHover] = useState<{ dim: DimKey; level: number } | null>(null);

  // Polygon path connecting the 4 selected scores (skip dimensions still at 0)
  const polygonPoints = DIM_ORDER.map((dim, i) => {
    const v = scores[dim] || 0;
    if (v === 0) return null;
    return pointFor(i, v).join(",");
  });

  const validPoly = polygonPoints.filter((p) => p !== null) as string[];

  return (
    <div className="ostar-wrap">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="ostar-svg"
        role="img"
        aria-label="Estrella d'evolució (Outcomes Star)"
      >
        {/* concentric rings */}
        {LEVELS.map((lvl) => (
          <circle
            key={`ring-${lvl}`}
            cx={CENTER}
            cy={CENTER}
            r={(lvl / 5) * MAX_R}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={1}
            strokeDasharray={lvl === 5 ? "none" : "3 4"}
          />
        ))}

        {/* axes lines */}
        {DIM_ORDER.map((_, i) => {
          const [x, y] = pointFor(i, 5);
          return (
            <line
              key={`axis-${i}`}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
          );
        })}

        {/* filled polygon (selected profile) */}
        {validPoly.length >= 3 && (
          <motion.polygon
            points={validPoly.join(" ")}
            fill="rgba(79, 70, 229, 0.14)"
            stroke="var(--brand-500)"
            strokeWidth={2}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />
        )}

        {/* clickable dots per (axis, level) */}
        {DIM_ORDER.map((dim, i) =>
          LEVELS.map((lvl) => {
            const [x, y] = pointFor(i, lvl);
            const isSelected = scores[dim] === lvl;
            const isHover = hover?.dim === dim && hover.level === lvl;
            return (
              <g
                key={`${dim}-${lvl}`}
                onMouseEnter={() => setHover({ dim, level: lvl })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onChange(dim, isSelected ? 0 : lvl)}
                style={{ cursor: "pointer" }}
              >
                {/* invisible larger hit area */}
                <circle cx={x} cy={y} r={12} fill="transparent" />
                {/* visible dot */}
                <motion.circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 7 : isHover ? 6 : 4}
                  fill={isSelected ? DIM_COLORS[dim] : "var(--surface-0)"}
                  stroke={isSelected ? DIM_COLORS[dim] : "var(--border-strong)"}
                  strokeWidth={isSelected ? 2 : 1.5}
                  animate={{ r: isSelected ? 7 : isHover ? 6 : 4 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                />
              </g>
            );
          })
        )}

        {/* axis labels */}
        {DIM_ORDER.map((dim, i) => {
          const a = axisAngle(i);
          const r = MAX_R + 22;
          const x = CENTER + Math.cos(a) * r;
          const y = CENTER + Math.sin(a) * r;
          // anchor positioning per quadrant
          const ta =
            i === 0 ? "middle" :
            i === 1 ? "start"  :
            i === 2 ? "middle" : "end";
          return (
            <text
              key={`label-${dim}`}
              x={x}
              y={y + 4}
              textAnchor={ta}
              fontSize={11}
              fontWeight={700}
              fill="var(--text-secondary)"
              style={{ letterSpacing: 0.3 }}
            >
              {DIM_LABELS[dim]}
            </text>
          );
        })}

        {/* level numbers along the top axis (legend) */}
        {LEVELS.map((lvl) => {
          const r = (lvl / 5) * MAX_R;
          return (
            <text
              key={`lv-${lvl}`}
              x={CENTER + 4}
              y={CENTER - r + 3}
              fontSize={9}
              fill="var(--text-muted)"
            >
              {lvl}
            </text>
          );
        })}
      </svg>

      {/* anchored descriptions panel */}
      <div className="ostar-panel">
        {hover ? (
          <motion.div
            key={`${hover.dim}-${hover.level}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="ostar-anchor-card"
            style={{ borderColor: DIM_COLORS[hover.dim] }}
          >
            <div className="ostar-anchor-head">
              <span style={{ color: DIM_COLORS[hover.dim], fontWeight: 700 }}>
                {DIM_LABELS[hover.dim]}
              </span>
              <span className="ostar-anchor-level">
                Nivell {hover.level}/5 · {STAR_LEVEL_TAGS[hover.level as 1 | 2 | 3 | 4 | 5]}
              </span>
            </div>
            <div className="ostar-anchor-text">
              {STAR_ANCHORS[hover.dim][hover.level as 1 | 2 | 3 | 4 | 5]}
            </div>
            <div className="ostar-anchor-hint">Clica per seleccionar aquest nivell</div>
          </motion.div>
        ) : (
          <div className="ostar-selected-list">
            {DIM_ORDER.map((dim) => {
              const v = scores[dim] || 0;
              return (
                <div key={dim} className="ostar-selected-item">
                  <span className="ostar-selected-dim" style={{ color: DIM_COLORS[dim] }}>
                    {DIM_LABELS[dim]}
                  </span>
                  {v >= 1 ? (
                    <>
                      <span className="ostar-selected-level">
                        {v}/5 · {STAR_LEVEL_TAGS[v as 1 | 2 | 3 | 4 | 5]}
                      </span>
                      <span className="ostar-selected-anchor">
                        {STAR_ANCHORS[dim][v as 1 | 2 | 3 | 4 | 5]}
                      </span>
                    </>
                  ) : (
                    <span className="ostar-selected-empty">Sense valorar</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
