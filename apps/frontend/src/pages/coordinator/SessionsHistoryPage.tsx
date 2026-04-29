import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BookOpen, Brain, Calendar, ChevronLeft, ChevronRight,
  Clock, FileText, Globe, MessageSquare, Search, Users2, X,
} from "lucide-react";
import { listSessions, getSessionObservations, SessionListItem } from "../../api/sessions";
import { listPrograms } from "../../api/programs";
import { listParticipants } from "../../api/participants";

const SESSION_TYPE_LABELS: Record<string, string> = {
  group:       "Grupal",
  individual:  "Individual",
  assessment:  "Avaluació",
  workshop:    "Taller",
  follow_up:   "Seguiment",
};

const MOOD_LABELS: Record<string, { label: string; color: string }> = {
  very_low:  { label: "Molt baixa",  color: "var(--risk-high)" },
  low:       { label: "Baixa",       color: "var(--risk-medium)" },
  neutral:   { label: "Neutral",     color: "var(--text-muted)" },
  good:      { label: "Bona",        color: "var(--dim-integration)" },
  excellent: { label: "Excel·lent",  color: "var(--risk-low)" },
  positive:  { label: "Positiu",     color: "var(--risk-low)" },
  negative:  { label: "Negatiu",     color: "var(--risk-high)" },
};

const DIM_CONFIG = [
  { key: "academic_score",    label: "Acadèmic",    Icon: BookOpen, color: "var(--dim-academic)" },
  { key: "cognitive_score",   label: "Cognitiu",    Icon: Brain,    color: "var(--dim-cognitive)" },
  { key: "social_score",      label: "Social",      Icon: Users2,   color: "var(--dim-social)" },
  { key: "integration_score", label: "Integració",  Icon: Globe,    color: "var(--dim-integration)" },
] as const;

const PAGE_SIZE = 15;

function ScoreDots({ value }: { value: number | null }) {
  if (!value) return <span className="text-secondary" style={{ fontSize: "0.8rem" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[1,2,3,4,5].map((n) => (
        <span key={n} style={{
          width: 7, height: 7, borderRadius: "50%",
          background: n <= value ? "var(--brand-500)" : "var(--surface-3)",
          display: "inline-block",
        }} />
      ))}
    </span>
  );
}

function SentimentChip({ value }: { value: number | null }) {
  if (value === null) return <span className="text-secondary">—</span>;
  const pct = Math.round(((value + 1) / 2) * 100);
  const color = value > 0.2 ? "var(--risk-low)" : value < -0.2 ? "var(--risk-high)" : "var(--risk-medium)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 600,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      color, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
    }}>
      {pct}%
    </span>
  );
}

function TypeChip({ type }: { type: string }) {
  return (
    <span className="sh-type-chip">
      {SESSION_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────────────────────

function SessionDetailDrawer({
  session,
  programName,
  participantName,
  onClose,
}: {
  session: SessionListItem;
  programName: (id: string) => string;
  participantName: (id: string) => string;
  onClose: () => void;
}) {
  const { data: observations = [], isLoading } = useQuery({
    queryKey: ["session-observations", session.id],
    queryFn: () => getSessionObservations(session.id),
  });

  const dateStr = new Date(session.session_date + "T12:00:00").toLocaleDateString("ca-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <div className="sh-drawer-overlay" onClick={onClose} />
      <div className="sh-drawer">
        {/* Header */}
        <div className="sh-drawer-header">
          <div className="sh-drawer-header-left">
            <TypeChip type={session.session_type} />
            <span className="sh-drawer-date">{dateStr}</span>
          </div>
          <button className="sh-drawer-close" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Meta row */}
        <div className="sh-drawer-meta">
          <span className="sh-drawer-meta-item">
            <FileText size={13} strokeWidth={2} />
            {programName(session.program_id)}
          </span>
          {session.duration_minutes && (
            <span className="sh-drawer-meta-item">
              <Clock size={13} strokeWidth={2} />
              {session.duration_minutes} min
            </span>
          )}
          {session.notes_sentiment !== null && (
            <span className="sh-drawer-meta-item">
              Sentiment: <SentimentChip value={session.notes_sentiment} />
            </span>
          )}
        </div>

        {/* Notes */}
        {(session.notes_ai_summary || session.notes) && (
          <div className="sh-drawer-section">
            <div className="sh-drawer-section-label">
              <MessageSquare size={13} strokeWidth={2} />
              Notes de la sessió
            </div>
            {session.notes_ai_summary && (
              <div className="sh-drawer-notes-summary">{session.notes_ai_summary}</div>
            )}
            {session.notes && session.notes !== session.notes_ai_summary && (
              <div className="sh-drawer-notes-raw">{session.notes}</div>
            )}
          </div>
        )}

        {/* Observations */}
        <div className="sh-drawer-section">
          <div className="sh-drawer-section-label">
            <Users2 size={13} strokeWidth={2} />
            Observacions per participant
            {observations.length > 0 && (
              <span className="sh-obs-count">{observations.length}</span>
            )}
          </div>

          {isLoading ? (
            <div className="sh-drawer-loading">Carregant observacions…</div>
          ) : observations.length === 0 ? (
            <div className="sh-drawer-empty">Cap observació enregistrada per a aquesta sessió.</div>
          ) : (
            <div className="sh-obs-list">
              {observations.map((obs) => {
                const mood = obs.mood_indicator ? MOOD_LABELS[obs.mood_indicator] : null;
                return (
                  <div key={obs.id} className="sh-obs-card">
                    <div className="sh-obs-header">
                      <div className="sh-obs-avatar">
                        {(participantName(obs.participant_id)[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="sh-obs-name">{participantName(obs.participant_id)}</div>
                      {mood && (
                        <span className="sh-obs-mood" style={{ color: mood.color }}>
                          {mood.label}
                        </span>
                      )}
                    </div>

                    <div className="sh-obs-scores">
                      {DIM_CONFIG.map(({ key, label, Icon, color }) => (
                        <div key={key} className="sh-obs-score-row">
                          <span className="sh-obs-score-label" style={{ color }}>
                            <Icon size={12} strokeWidth={2} />
                            {label}
                          </span>
                          <ScoreDots value={obs[key]} />
                        </div>
                      ))}
                    </div>

                    {obs.qualitative_note && (
                      <div className="sh-obs-note">"{obs.qualitative_note}"</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SessionsHistoryPage() {
  const [filterProgram, setFilterProgram] = useState("");
  const [filterParticipant, setFilterParticipant] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<SessionListItem | null>(null);

  const { data: programs = [] } = useQuery({
    queryKey: ["programs", "history"],
    queryFn: () => listPrograms(false),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => listParticipants(),
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", filterProgram, filterParticipant, filterDateFrom, filterDateTo],
    queryFn: () =>
      listSessions({
        program_id: filterProgram || undefined,
        participant_id: filterParticipant || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
      }),
  });

  const programName = (id: string) => programs.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const participantName = (id: string) => {
    const p = participants.find((p) => p.id === id);
    return p ? `${p.first_name} (${p.code})` : id.slice(0, 8);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        programName(s.program_id).toLowerCase().includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q) ||
        (s.notes_ai_summary ?? "").toLowerCase().includes(q) ||
        (SESSION_TYPE_LABELS[s.session_type] ?? s.session_type).toLowerCase().includes(q)
    );
  }, [sessions, search, programs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const clearFilters = () => {
    setFilterProgram(""); setFilterParticipant("");
    setFilterDateFrom(""); setFilterDateTo(""); setSearch(""); setPage(1);
  };

  const hasFilters = filterProgram || filterParticipant || filterDateFrom || filterDateTo || search;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de sessions</h1>
          <p className="page-subtitle">
            {filtered.length} {filtered.length === 1 ? "sessió" : "sessions"}
            {hasFilters ? " · filtrades" : " registrades"}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="sh-filters-bar">
        <div className="sh-filter-field sh-filter-search">
          <Search size={14} strokeWidth={2.5} className="sh-filter-icon" />
          <input
            className="sh-filter-input"
            placeholder="Cerca per programa, tipus, notes…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <select
          className="sh-filter-select"
          value={filterProgram}
          onChange={(e) => { setFilterProgram(e.target.value); setPage(1); }}
        >
          <option value="">Tots els programes</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          className="sh-filter-select"
          value={filterParticipant}
          onChange={(e) => { setFilterParticipant(e.target.value); setPage(1); }}
        >
          <option value="">Tots els participants</option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>{p.first_name} ({p.code})</option>
          ))}
        </select>

        <input
          type="date"
          className="sh-filter-select"
          value={filterDateFrom}
          onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
          title="Des de"
        />
        <input
          type="date"
          className="sh-filter-select"
          value={filterDateTo}
          onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
          title="Fins a"
        />

        {hasFilters && (
          <button className="sh-filter-clear" onClick={clearFilters}>
            <X size={13} strokeWidth={2.5} />
            Netejar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card sh-table-card">
        {isLoading ? (
          <div className="table-empty">Carregant sessions…</div>
        ) : filtered.length === 0 ? (
          <div className="table-empty">Cap sessió coincideix amb els filtres aplicats.</div>
        ) : (
          <>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Calendar size={12} strokeWidth={2} /> Data
                    </span>
                  </th>
                  <th>Programa</th>
                  <th>Tipus</th>
                  <th>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Clock size={12} strokeWidth={2} /> Durada
                    </span>
                  </th>
                  <th>Sentiment</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((s) => (
                  <tr
                    key={s.id}
                    className="sh-table-row"
                    onClick={() => setSelectedSession(s)}
                  >
                    <td className="sh-td-date">
                      {new Date(s.session_date + "T12:00:00").toLocaleDateString("ca-ES", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="sh-td-program">{programName(s.program_id)}</td>
                    <td><TypeChip type={s.session_type} /></td>
                    <td className="sh-td-muted">
                      {s.duration_minutes ? `${s.duration_minutes} min` : "—"}
                    </td>
                    <td><SentimentChip value={s.notes_sentiment} /></td>
                    <td className="sh-td-notes">
                      {s.notes_ai_summary ?? s.notes ?? "—"}
                    </td>
                    <td className="sh-td-arrow">
                      <ChevronRight size={15} strokeWidth={2} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="sh-pagination">
                <span className="sh-pagination-info">
                  {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
                </span>
                <div className="sh-pagination-controls">
                  <button
                    className="sh-page-btn"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && typeof arr[i - 1] === "number" && (p as number) - (arr[i - 1] as number) > 1) {
                        acc.push("…");
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span key={`ellipsis-${i}`} className="sh-page-ellipsis">…</span>
                      ) : (
                        <button
                          key={p}
                          className={`sh-page-btn${p === currentPage ? " active" : ""}`}
                          onClick={() => setPage(p as number)}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    className="sh-page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedSession && (
        <SessionDetailDrawer
          session={selectedSession}
          programName={programName}
          participantName={participantName}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
}
