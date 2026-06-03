import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BookOpen, Brain, Calendar, ChevronLeft, ChevronRight,
  Clock, FileText, Globe, MessageSquare, Search, Users2, X,
} from "lucide-react";
import { listSessions, getSessionObservations, SessionListItem } from "../../api/sessions";
import { listPrograms } from "../../api/programs";
import { listParticipants } from "../../api/participants";
import { listSchools } from "../../api/schools";
import { useAuthStore } from "../../stores/authStore";
import { VolunteerPageHeader } from "../../components/voluntari/VolunteerPageHeader";
import { PremiumSelect } from "../../components/voluntari/PremiumSelect";

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

function formatSessionParticipants(s: SessionListItem): string {
  const list = s.participants ?? [];
  if (list.length === 0) return "Sense alumnes registrats";
  if (list.length === 1) return `${list[0].first_name} (${list[0].code})`;
  if (list.length <= 3) {
    return list.map((p) => `${p.first_name} (${p.code})`).join(", ");
  }
  const head = list.slice(0, 2).map((p) => p.first_name).join(", ");
  return `${head} +${list.length - 2} més`;
}

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
  participantName: (id: string, session?: SessionListItem) => string;
  onClose: () => void;
}) {
  const { data: observations = [], isLoading } = useQuery({
    queryKey: ["session-observations", session.id],
    queryFn: () => getSessionObservations(session.id),
  });

  const timeSuffix = session.session_time ? ` · ${session.session_time}` : "";
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
            <span className="sh-drawer-date">{dateStr}{timeSuffix}</span>
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
                        {(participantName(obs.participant_id, session)[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="sh-obs-name">{participantName(obs.participant_id, session)}</div>
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
  const isVolunteer = useAuthStore((s) => s.role) === "professional";
  const [filterProgram, setFilterProgram] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
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

  const { data: schools = [] } = useQuery({ queryKey: ["schools"], queryFn: listSchools });
  const { data: participants = [] } = useQuery({
    queryKey: ["participants", filterSchool],
    queryFn: () => listParticipants({ schoolId: filterSchool || undefined }),
  });

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", filterProgram, filterSchool, filterParticipant, filterDateFrom, filterDateTo],
    queryFn: () =>
      listSessions({
        program_id: filterProgram || undefined,
        school_id: filterSchool || undefined,
        participant_id: filterParticipant || undefined,
        date_from: filterDateFrom || undefined,
        date_to: filterDateTo || undefined,
      }),
  });

  const programName = (id: string) => programs.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const participantName = (id: string, session?: SessionListItem) => {
    const fromSession = session?.participants?.find((p) => p.id === id);
    if (fromSession) return `${fromSession.first_name} (${fromSession.code})`;
    const p = participants.find((p) => p.id === id);
    return p ? `${p.first_name} (${p.code})` : "Alumne";
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sessions;
    if (q) {
      list = sessions.filter(
        (s) =>
          programName(s.program_id).toLowerCase().includes(q) ||
          (s.notes ?? "").toLowerCase().includes(q) ||
          (s.notes_ai_summary ?? "").toLowerCase().includes(q) ||
          (SESSION_TYPE_LABELS[s.session_type] ?? s.session_type).toLowerCase().includes(q) ||
          (s.participants ?? []).some(
            (p) =>
              p.first_name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
          )
      );
    }
    return [...list].sort((a, b) => b.session_date.localeCompare(a.session_date));
  }, [sessions, search, programs]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const clearFilters = () => {
    setFilterProgram(""); setFilterSchool(""); setFilterParticipant("");
    setFilterDateFrom(""); setFilterDateTo(""); setSearch(""); setPage(1);
  };

  const hasFilters =
    filterProgram || filterSchool || filterParticipant || filterDateFrom || filterDateTo || search;

  return (
    <div className={isVolunteer ? "vol-page" : "page-container"}>
      {isVolunteer ? (
        <VolunteerPageHeader
          title="Historial"
          subtitle={`${filtered.length} ${filtered.length === 1 ? "sessió" : "sessions"}${hasFilters ? " · filtrades" : ""}`}
        />
      ) : (
        <div className="page-header">
          <div>
            <h1 className="page-title">Historial de sessions</h1>
            <p className="page-subtitle">
              {filtered.length} {filtered.length === 1 ? "sessió" : "sessions"}
              {hasFilters ? " · filtrades" : " registrades"}
            </p>
          </div>
        </div>
      )}

      {isVolunteer ? (
        <div className="vol-filter-strip vol-filter-strip--compact">
          <label className="premium-search">
            <span className="premium-select-label">Cerca</span>
            <span className="premium-search-field">
              <Search size={18} strokeWidth={2} className="premium-search-icon" aria-hidden />
              <input
                type="search"
                className="premium-search-input"
                placeholder="Programa o notes…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </span>
          </label>
          <PremiumSelect
            label="Programa"
            value={filterProgram}
            onChange={(v) => { setFilterProgram(v); setPage(1); }}
            options={[
              { value: "", label: "Tots" },
              ...programs.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          {hasFilters && (
            <button type="button" className="vol-btn-back" onClick={clearFilters} style={{ width: "100%" }}>
              <X size={16} aria-hidden />
              Netejar filtres
            </button>
          )}
        </div>
      ) : (
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

        <label className="sh-filter-field">
          <span className="sr-only">Programa</span>
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
        </label>

        <label className="sh-filter-field">
          <span className="sr-only">Escola</span>
          <select
            className="sh-filter-select"
            value={filterSchool}
            onChange={(e) => { setFilterSchool(e.target.value); setPage(1); }}
          >
            <option value="">Totes les escoles</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.abbreviation}</option>
            ))}
          </select>
        </label>

        <label className="sh-filter-field">
          <span className="sr-only">Alumne</span>
          <select
            className="sh-filter-select"
            value={filterParticipant}
            onChange={(e) => { setFilterParticipant(e.target.value); setPage(1); }}
          >
            <option value="">Tots els alumnes</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>{p.first_name} ({p.code})</option>
            ))}
          </select>
        </label>

        <label className="sh-filter-field">
          <span className="form-label" style={{ fontSize: "0.7rem" }}>Data inici</span>
          <input
            type="date"
            className="sh-filter-select"
            value={filterDateFrom}
            placeholder="Data inici"
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
          />
        </label>
        <label className="sh-filter-field">
          <span className="form-label" style={{ fontSize: "0.7rem" }}>Data fi</span>
          <input
            type="date"
            className="sh-filter-select"
            value={filterDateTo}
            placeholder="Data fi"
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
          />
        </label>

        {hasFilters && (
          <button className="sh-filter-clear" onClick={clearFilters}>
            <X size={13} strokeWidth={2.5} />
            Netejar
          </button>
        )}
      </div>
      )}

      {isVolunteer ? (
        <>
          {isLoading ? (
            <p className="vol-empty">Carregant sessions…</p>
          ) : filtered.length === 0 ? (
            <p className="vol-empty">Cap sessió coincideix amb els filtres.</p>
          ) : (
            <>
            <div className="vol-history-list" role="list">
              {pageItems.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="listitem"
                  className="vol-history-card"
                  onClick={() => setSelectedSession(s)}
                >
                  <div className="vol-history-card-accent" aria-hidden />
                  <div className="vol-history-card-body">
                    <div className="vol-history-card-top">
                      <span className="vol-history-date">
                        {new Date(s.session_date + "T12:00:00").toLocaleDateString("ca-ES", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {s.session_time ? ` · ${s.session_time}` : ""}
                      </span>
                      <TypeChip type={s.session_type} />
                    </div>
                    <h3 className="vol-history-program">{programName(s.program_id)}</h3>
                    <p className="vol-history-participants">
                      <Users2 size={14} strokeWidth={2} aria-hidden />
                      {formatSessionParticipants(s)}
                    </p>
                    <p className="vol-history-notes">
                      {s.notes_ai_summary ?? s.notes ?? "Sense notes registrades"}
                    </p>
                    <div className="vol-history-meta">
                      {s.duration_minutes ? (
                        <span className="vol-history-pill">{s.duration_minutes} min</span>
                      ) : null}
                      <SentimentChip value={s.notes_sentiment} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
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
                    aria-label="Pàgina anterior"
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    className="sh-page-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Pàgina següent"
                  >
                    <ChevronRight size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </>
      ) : (
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
                  <th>Alumnes</th>
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
                      {s.session_time ? (
                        <span className="sh-td-time"> · {s.session_time}</span>
                      ) : null}
                    </td>
                    <td className="sh-td-program">{programName(s.program_id)}</td>
                    <td className="sh-td-muted">{formatSessionParticipants(s)}</td>
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
      )}

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
