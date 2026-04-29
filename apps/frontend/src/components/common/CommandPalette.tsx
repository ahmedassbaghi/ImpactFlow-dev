import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Atom, BookOpen, FileText, FolderKanban, Heart, History,
  LayoutDashboard, Search, Settings, Sparkles, Target, User, Users, Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { listParticipants } from "../../api/participants";
import { useAuthStore } from "../../stores/authStore";

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group: "Pàgines" | "Participants" | "Accions";
  icon: React.ElementType;
  perform: () => void;
  keywords?: string;
};

const PAGE_DEFS: { to: string; label: string; icon: React.ElementType; roles: string[] }[] = [
  { to: "/coordinator/dashboard",       label: "Dashboard",          icon: LayoutDashboard, roles: ["coordinator", "admin"] },
  { to: "/coordinator/participants",    label: "Participants",       icon: Users,           roles: ["coordinator", "admin", "professional"] },
  { to: "/coordinator/programs",        label: "Programes",          icon: FolderKanban,    roles: ["coordinator", "admin"] },
  { to: "/coordinator/sessions",        label: "Historial sessions", icon: History,         roles: ["coordinator", "admin", "professional"] },
  { to: "/coordinator/micro-goals",     label: "Micro-objectius",    icon: Target,          roles: ["coordinator", "admin", "professional"] },
  { to: "/professional/session-logger", label: "Registre sessió",    icon: Zap,             roles: ["coordinator", "admin", "professional"] },
  { to: "/coordinator/advanced",        label: "Anàlisi avançada",   icon: Atom,            roles: ["coordinator", "admin"] },
  { to: "/coordinator/reports",         label: "Informes",           icon: FileText,        roles: ["coordinator", "admin"] },
  { to: "/coordinator/users",           label: "Usuaris i rols",     icon: Settings,        roles: ["coordinator", "admin"] },
  { to: "/admin/control-center",        label: "Centre d'admin",     icon: BookOpen,        roles: ["admin"] },
  { to: "/donor/impact-portal",         label: "Portal d'impacte",   icon: Heart,           roles: ["coordinator", "admin", "donor", "viewer"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.role) ?? "viewer";

  // Open on Ctrl/Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const { data: participants = [] } = useQuery({
    queryKey: ["cmd-participants"],
    queryFn: () => listParticipants(),
    enabled: open && role !== "donor" && role !== "viewer",
    staleTime: 30_000,
  });

  const items: CommandItem[] = useMemo(() => {
    const pages = PAGE_DEFS
      .filter((p) => p.roles.includes(role))
      .map<CommandItem>((p) => ({
        id: `page:${p.to}`,
        label: p.label,
        group: "Pàgines",
        icon: p.icon,
        perform: () => navigate(p.to),
      }));

    const ppl = participants.map<CommandItem>((p: any) => ({
      id: `p:${p.id}`,
      label: p.first_name,
      hint: p.code,
      group: "Participants",
      icon: User,
      keywords: `${p.first_name} ${p.code} ${p.nationality ?? ""}`,
      perform: () => navigate(`/coordinator/participants/${p.id}`),
    }));

    const actions: CommandItem[] = [
      {
        id: "act:new-session",
        label: "Nova sessió ràpida",
        group: "Accions",
        icon: Sparkles,
        perform: () => window.dispatchEvent(new CustomEvent("if:open-quick-logger")),
      },
    ];

    return [...pages, ...ppl, ...actions];
  }, [participants, role, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      (i.hint ?? "").toLowerCase().includes(q) ||
      (i.keywords ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const out: Record<string, CommandItem[]> = {};
    filtered.forEach((it) => {
      if (!out[it.group]) out[it.group] = [];
      out[it.group].push(it);
    });
    return out;
  }, [filtered]);

  // Flat order for keyboard navigation matches grouped order
  const flat = useMemo(() => Object.values(grouped).flat(), [grouped]);

  useEffect(() => { setHighlight(0); }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(flat.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[highlight]?.perform();
      setOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cmdk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="cmdk-panel"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cmdk-search">
              <Search size={16} strokeWidth={2} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Cerca pàgines, participants o accions…"
              />
              <kbd className="cmdk-kbd">Esc</kbd>
            </div>
            <div className="cmdk-list">
              {flat.length === 0 && (
                <div className="cmdk-empty">No hi ha resultats per "{query}"</div>
              )}
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group} className="cmdk-group">
                  <div className="cmdk-group-label">{group}</div>
                  {list.map((it) => {
                    const idx = flat.indexOf(it);
                    const Icon = it.icon;
                    return (
                      <button
                        key={it.id}
                        className={`cmdk-item${idx === highlight ? " is-active" : ""}`}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => { it.perform(); setOpen(false); }}
                      >
                        <Icon size={15} strokeWidth={2} />
                        <span className="cmdk-item-label">{it.label}</span>
                        {it.hint && <span className="cmdk-item-hint">{it.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="cmdk-footer">
              <span><kbd className="cmdk-kbd">↑↓</kbd> moure</span>
              <span><kbd className="cmdk-kbd">↵</kbd> obrir</span>
              <span><kbd className="cmdk-kbd">Ctrl K</kbd> per obrir</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
