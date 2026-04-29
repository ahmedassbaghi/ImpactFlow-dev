/* ════════════════════════════════════════════════════════════════════
   LIVE REACTIONS — ClassDojo-style point-based observation.

   The professional taps behavior chips during the session as they
   observe them. Each chip belongs to a dimension and has a weight.
   The four 1-5 dimension scores are derived from the accumulated
   events at any moment, so the data flowing into IPI is always the
   standard 1-5 score per dimension.

       score(dim) = clamp(round(3 + Σweights_for_dim / 2), 1, 5)
       score(dim) = 0 when no events recorded for that dimension

   Each reaction tap is logged as an event with a stable id so the
   user can undo a single tap from the timeline.
   ════════════════════════════════════════════════════════════════════ */

import { AnimatePresence, motion } from "framer-motion";
import { Undo2, X } from "lucide-react";
import { useMemo } from "react";
import {
  REACTIONS, deriveScoreFromEvents, findReaction,
  DIM_LABELS, type DimKey, type Reaction, type ReactionEvent,
} from "./inputModeData";

const DIM_ORDER: DimKey[] = [
  "academicScore", "cognitiveScore", "socialScore", "integrationScore",
];

const DIM_COLORS: Record<DimKey, string> = {
  academicScore:    "var(--dim-academic)",
  cognitiveScore:   "var(--dim-cognitive)",
  socialScore:      "var(--dim-social)",
  integrationScore: "var(--dim-integration)",
};

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function LiveReactions({
  events,
  onChange,
}: {
  events: ReactionEvent[];
  onChange: (next: ReactionEvent[]) => void;
}) {
  // Group reactions by dimension for the palette
  const byDim = useMemo(() => {
    const map: Record<DimKey, Reaction[]> = {
      academicScore: [], cognitiveScore: [], socialScore: [], integrationScore: [],
    };
    REACTIONS.forEach((r) => map[r.dim].push(r));
    return map;
  }, []);

  // Live derived scores
  const liveScores: Record<DimKey, number> = {
    academicScore:    deriveScoreFromEvents("academicScore",    events),
    cognitiveScore:   deriveScoreFromEvents("cognitiveScore",   events),
    socialScore:      deriveScoreFromEvents("socialScore",      events),
    integrationScore: deriveScoreFromEvents("integrationScore", events),
  };

  // Per-dim event count
  const counts: Record<DimKey, number> = {
    academicScore: 0, cognitiveScore: 0, socialScore: 0, integrationScore: 0,
  };
  events.forEach((e) => {
    const r = findReaction(e.reactionId);
    if (r) counts[r.dim]++;
  });

  const tap = (reaction: Reaction) => {
    const evt: ReactionEvent = {
      id: genId(),
      reactionId: reaction.id,
      ts: Date.now(),
    };
    onChange([...events, evt]);
  };

  const undoEvent = (id: string) => {
    onChange(events.filter((e) => e.id !== id));
  };

  const undoLast = () => {
    if (events.length === 0) return;
    onChange(events.slice(0, -1));
  };

  const clearDim = (dim: DimKey) => {
    onChange(
      events.filter((e) => {
        const r = findReaction(e.reactionId);
        return r ? r.dim !== dim : true;
      })
    );
  };

  return (
    <div className="lr-wrap">
      {/* ── Live dimension meters ──────────────────────────────────── */}
      <div className="lr-meters">
        {DIM_ORDER.map((dim) => {
          const score = liveScores[dim];
          const pct = score > 0 ? (score / 5) * 100 : 0;
          return (
            <div key={dim} className="lr-meter">
              <div className="lr-meter-head">
                <span className="lr-meter-dim" style={{ color: DIM_COLORS[dim] }}>
                  {DIM_LABELS[dim]}
                </span>
                <span className="lr-meter-count">{counts[dim]} obs.</span>
                {counts[dim] > 0 && (
                  <button
                    type="button"
                    className="lr-meter-clear"
                    onClick={() => clearDim(dim)}
                    title={`Esborra observacions de ${DIM_LABELS[dim]}`}
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              <div className="lr-meter-bar">
                <motion.div
                  className="lr-meter-fill"
                  style={{ background: DIM_COLORS[dim] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 280, damping: 26 }}
                />
              </div>
              <div className="lr-meter-score">
                {score > 0 ? `${score}/5` : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Chip palette grouped by dimension ─────────────────────── */}
      <div className="lr-palette">
        {DIM_ORDER.map((dim) => (
          <div key={dim} className="lr-palette-group">
            <div className="lr-palette-label" style={{ color: DIM_COLORS[dim] }}>
              {DIM_LABELS[dim]}
            </div>
            <div className="lr-palette-chips">
              {byDim[dim].map((r) => {
                const isPositive = r.weight > 0;
                return (
                  <motion.button
                    key={r.id}
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    whileHover={{ y: -2 }}
                    onClick={() => tap(r)}
                    className={`lr-chip ${isPositive ? "lr-chip--pos" : "lr-chip--neg"}`}
                    title={`${r.label} (${r.weight > 0 ? "+" : ""}${r.weight})`}
                  >
                    <span className="lr-chip-emoji" aria-hidden>{r.emoji}</span>
                    <span className="lr-chip-label">{r.label}</span>
                    <span className={`lr-chip-weight ${isPositive ? "is-pos" : "is-neg"}`}>
                      {r.weight > 0 ? `+${r.weight}` : r.weight}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Event timeline ────────────────────────────────────────── */}
      {events.length > 0 && (
        <div className="lr-tape">
          <div className="lr-tape-head">
            <span className="lr-tape-title">Cronograma · {events.length} {events.length === 1 ? "observació" : "observacions"}</span>
            <button
              type="button"
              className="lr-tape-undo"
              onClick={undoLast}
              title="Desfés l'última (Ctrl+Z)"
            >
              <Undo2 size={11} strokeWidth={2.4} /> Desfés
            </button>
          </div>
          <div className="lr-tape-track">
            <AnimatePresence initial={false}>
              {events.map((e) => {
                const r = findReaction(e.reactionId);
                if (!r) return null;
                return (
                  <motion.button
                    key={e.id}
                    type="button"
                    layout
                    initial={{ opacity: 0, scale: 0.7, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: "spring", stiffness: 380, damping: 24 }}
                    className={`lr-tape-pill ${r.weight > 0 ? "is-pos" : "is-neg"}`}
                    onClick={() => undoEvent(e.id)}
                    title="Clica per eliminar aquesta observació"
                    style={{ borderColor: DIM_COLORS[r.dim] }}
                  >
                    <span aria-hidden>{r.emoji}</span>
                    <span className="lr-tape-pill-label">{r.label}</span>
                    <X size={10} strokeWidth={2.5} className="lr-tape-pill-x" />
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
