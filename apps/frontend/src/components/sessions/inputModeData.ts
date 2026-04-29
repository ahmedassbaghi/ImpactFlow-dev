/* ════════════════════════════════════════════════════════════════════
   INPUT MODE DATA — anchors (Outcomes Star) + behaviors (Live Reactions).

   Both alternative modes still output 1-5 dimension scores compatible
   with the existing IPI/risk/effect calculations. The captured
   metadata (anchors, events) is folded into qualitative_note so the
   qualitative information is preserved for review and reports.
   ════════════════════════════════════════════════════════════════════ */

export type DimKey =
  | "academicScore"
  | "cognitiveScore"
  | "socialScore"
  | "integrationScore";

export type InputMode = "stars" | "star" | "reactions";

export const DIM_LABELS: Record<DimKey, string> = {
  academicScore: "Acadèmic",
  cognitiveScore: "Cognitiu",
  socialScore: "Social",
  integrationScore: "Integració",
};

/* ─────────────────────────────────────────────────────────────────────
   OUTCOMES STAR — anchored descriptions per (dimension, level 1-5)
   Inspired by Triangle Consulting's Journey of Change ladder.
   ───────────────────────────────────────────────────────────────────── */
export const STAR_ANCHORS: Record<DimKey, Record<1 | 2 | 3 | 4 | 5, string>> = {
  academicScore: {
    1: "Mostra resistència forta al treball acadèmic",
    2: "Necessita suport constant per cada tasca",
    3: "Treballa amb suport puntual del professional",
    4: "Treballa amb autonomia i mostra constància",
    5: "Lidera, ajuda companys i mostra excel·lència",
  },
  cognitiveScore: {
    1: "Distret/da o desconnectat/da gairebé tota la sessió",
    2: "Atenció discontínua, necessita molts recordatoris",
    3: "Atenció raonable amb distraccions ocasionals",
    4: "Atenció sostinguda i memòria de treball sòlida",
    5: "Concentració excepcional, planifica i anticipa",
  },
  socialScore: {
    1: "Conflicte clar o aïllament del grup",
    2: "Interacció escassa, prefereix estar sol/a",
    3: "Interacció correcta sense iniciar contacte",
    4: "Coopera bé i resol conflictes parlant",
    5: "Lidera positivament i empatitza activament",
  },
  integrationScore: {
    1: "Barrera lingüística/cultural forta, no comunica",
    2: "Comprèn parcialment, sovint necessita traducció",
    3: "Comprèn instruccions amb suport visual/lingüístic",
    4: "Es comunica amb fluïdesa creixent en català/castellà",
    5: "Plenament integrat/da culturalment i lingüística",
  },
};

export const STAR_LEVEL_TAGS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Crisi",
  2: "Estuc",
  3: "Acceptació",
  4: "Aprenent",
  5: "Autonomia",
};

/** Compose qualitative note from selected Outcomes Star anchors. */
export function noteFromStarAnchors(scores: {
  academicScore: number;
  cognitiveScore: number;
  socialScore: number;
  integrationScore: number;
}): string {
  const lines: string[] = [];
  (Object.keys(scores) as DimKey[]).forEach((dim) => {
    const v = scores[dim] as 0 | 1 | 2 | 3 | 4 | 5;
    if (v >= 1 && v <= 5) {
      const anchor = STAR_ANCHORS[dim][v as 1 | 2 | 3 | 4 | 5];
      lines.push(`${DIM_LABELS[dim]} (${v}/5 · ${STAR_LEVEL_TAGS[v as 1 | 2 | 3 | 4 | 5]}): ${anchor}.`);
    }
  });
  return lines.join(" ");
}

/* ─────────────────────────────────────────────────────────────────────
   LIVE REACTIONS — behavior catalog
   Each chip belongs to one dimension and carries a weight.
   The dimension score is derived as:
       score = clamp(round(3 + Σ weights / 2), 1, 5)   (when ≥1 event)
       score = 0                                       (when no events)
   ───────────────────────────────────────────────────────────────────── */
export type Reaction = {
  id: string;
  dim: DimKey;
  label: string;
  emoji: string;
  weight: -2 | -1 | 1 | 2;
};

export const REACTIONS: Reaction[] = [
  // ── Acadèmic ──
  { id: "ac-auto",     dim: "academicScore",    label: "Treballa amb autonomia",  emoji: "📚", weight:  2 },
  { id: "ac-question", dim: "academicScore",    label: "Pregunta amb pertinença", emoji: "💡", weight:  1 },
  { id: "ac-recall",   dim: "academicScore",    label: "Recorda el que sap",      emoji: "🧠", weight:  1 },
  { id: "ac-block",    dim: "academicScore",    label: "Es bloqueja",             emoji: "🛑", weight: -1 },
  { id: "ac-quit",     dim: "academicScore",    label: "Abandona la tasca",       emoji: "🚪", weight: -2 },

  // ── Cognitiu ──
  { id: "co-focus",    dim: "cognitiveScore",   label: "Atenció sostinguda",      emoji: "🎯", weight:  2 },
  { id: "co-plan",     dim: "cognitiveScore",   label: "Planifica abans d'actuar",emoji: "🧩", weight:  1 },
  { id: "co-distract", dim: "cognitiveScore",   label: "Es distreu",              emoji: "💭", weight: -1 },
  { id: "co-multi",    dim: "cognitiveScore",   label: "No segueix instruccions", emoji: "❌", weight: -2 },

  // ── Social ──
  { id: "so-coop",     dim: "socialScore",      label: "Coopera amb companys",    emoji: "🤝", weight:  2 },
  { id: "so-resolve",  dim: "socialScore",      label: "Resol conflicte parlant", emoji: "💬", weight:  2 },
  { id: "so-share",    dim: "socialScore",      label: "Comparteix material",     emoji: "🎁", weight:  1 },
  { id: "so-clash",    dim: "socialScore",      label: "Conflicte amb companys",  emoji: "⚡", weight: -1 },
  { id: "so-isolate",  dim: "socialScore",      label: "S'aïlla del grup",        emoji: "🌑", weight: -2 },

  // ── Integració ──
  { id: "in-language", dim: "integrationScore", label: "Parla la llengua centre", emoji: "🗣️", weight:  2 },
  { id: "in-comp",     dim: "integrationScore", label: "Comprèn instruccions",    emoji: "✅", weight:  1 },
  { id: "in-translate",dim: "integrationScore", label: "Necessita traducció",     emoji: "🌐", weight: -1 },
];

export type ReactionEvent = {
  /** Stable runtime id so we can undo a single instance. */
  id: string;
  reactionId: string;  // → REACTIONS[*].id
  ts: number;          // Date.now()
};

export function findReaction(id: string): Reaction | undefined {
  return REACTIONS.find((r) => r.id === id);
}

/** Derive 1-5 score for a given dimension from a list of events.
 *  Returns 0 when no events exist for that dimension (= unset). */
export function deriveScoreFromEvents(
  dim: DimKey,
  events: ReactionEvent[]
): number {
  const weights = events
    .map((e) => findReaction(e.reactionId))
    .filter((r): r is Reaction => !!r && r.dim === dim)
    .map((r) => r.weight);
  if (weights.length === 0) return 0;
  const sum = weights.reduce((a, b) => a + b, 0);
  const score = Math.round(3 + sum / 2);
  return Math.max(1, Math.min(5, score));
}

/** Build a structured summary of all reactions in a session for the
 *  qualitative_note (groups by dimension, counts repeats). */
export function noteFromEvents(events: ReactionEvent[]): string {
  if (!events.length) return "";
  // Group by reactionId, count occurrences
  const counts = new Map<string, number>();
  events.forEach((e) => counts.set(e.reactionId, (counts.get(e.reactionId) ?? 0) + 1));

  const byDim: Record<DimKey, string[]> = {
    academicScore: [], cognitiveScore: [], socialScore: [], integrationScore: [],
  };
  counts.forEach((count, id) => {
    const r = findReaction(id);
    if (!r) return;
    const tag = count > 1 ? `${r.label} (×${count})` : r.label;
    byDim[r.dim].push(tag);
  });

  const parts: string[] = [];
  (Object.keys(byDim) as DimKey[]).forEach((dim) => {
    if (byDim[dim].length > 0) {
      parts.push(`${DIM_LABELS[dim]}: ${byDim[dim].join(", ")}.`);
    }
  });
  return parts.join(" ");
}
