import { AnimatePresence, motion } from "framer-motion";
import { Bell, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchHealth } from "../../api/health";
import { useAuthStore } from "../../stores/authStore";

type Alert = {
  type: "risk_alert" | "heartbeat";
  participant_id?: string;
  risk_level?: string;
  factors?: string[];
  timestamp: string;
  message?: string;
};

function wsBaseFromApi(): string {
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
  if (apiBase.startsWith("/")) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}${apiBase}`;
  }
  return apiBase.replace(/^http/i, (m: string) => (m.toLowerCase() === "https" ? "wss" : "ws"));
}

export function NotificationBell() {
  const userId = useAuthStore((s) => s.userId);
  const role   = useAuthStore((s) => s.role);
  const token  = useAuthStore((s) => s.accessToken);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen]     = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  // We'd ideally use the org_id from a profile call. For now, derive from token claim cache
  // by reading from auth store. Fall back to "narinan-default" stub so connection at least attempts.
  const orgKey = userId ?? "default";

  useEffect(() => {
    if (!token) return;
    if (role === "donor" || role === "viewer") return;

    let cancelled = false;
    let backoff = 2000;
    const seen = new Set<string>();

    const connect = async () => {
      if (cancelled) return;
      try {
        const health = await fetchHealth();
        if (!health.websocket) return;
      } catch {
        return;
      }
      const url = `${wsBaseFromApi()}/ws/alerts/${orgKey}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); backoff = 2000; };
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(connect, backoff);
        backoff = Math.min(backoff * 1.6, 30000);
      };
      ws.onerror = () => { /* will trigger close */ };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as Alert;
          if (msg.type !== "risk_alert") return;
          const key = `${msg.participant_id}-${msg.timestamp}`;
          if (seen.has(key)) return;
          seen.add(key);
          setAlerts((prev) => [{ ...msg }, ...prev].slice(0, 25));
        } catch { /* ignore */ }
      };
    };

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [token, role, orgKey]);

  if (!token) return null;
  if (role && !["coordinator", "admin", "professional"].includes(role)) return null;

  const unread = alerts.length;

  return (
    <div className="bell-wrap">
      <button
        className="bell-btn"
        onClick={() => setOpen((o) => !o)}
        title={connected ? "Notificacions (en directe)" : "Notificacions (reconnectant…)"}
      >
        <Bell size={15} strokeWidth={2} />
        <span className={`bell-status${connected ? " is-on" : ""}`} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              className="bell-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="bell-backdrop" onClick={() => setOpen(false)} />
            <motion.div
              className="bell-panel"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 360, damping: 26 }}
            >
              <div className="bell-panel-head">
                <div className="bell-panel-title">
                  <AlertTriangle size={14} strokeWidth={2.2} />
                  Alertes en directe
                </div>
                <span className={`bell-panel-status${connected ? " is-on" : ""}`}>
                  {connected ? "Connectat" : "Reconnectant…"}
                </span>
              </div>

              {alerts.length === 0 ? (
                <div className="bell-empty">
                  <CheckCircle2 size={28} strokeWidth={1.5} style={{ color: "#10b981" }} />
                  <p>Tot tranquil. Cap participant en risc alt detectat.</p>
                </div>
              ) : (
                <div className="bell-list">
                  {alerts.map((a, i) => (
                    <button
                      key={`${a.participant_id}-${i}`}
                      className="bell-item"
                      onClick={() => {
                        if (a.participant_id) {
                          navigate(`/coordinator/participants/${a.participant_id}`);
                          setOpen(false);
                        }
                      }}
                    >
                      <span className="bell-item-dot" />
                      <div className="bell-item-body">
                        <div className="bell-item-title">
                          Risc alt detectat
                        </div>
                        <div className="bell-item-meta">
                          {a.factors && a.factors.length > 0
                            ? a.factors.slice(0, 2).join(" · ")
                            : "Cal revisió individual"}
                        </div>
                        <div className="bell-item-time">
                          {new Date(a.timestamp).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {alerts.length > 0 && (
                <button className="bell-clear" onClick={() => setAlerts([])}>
                  <X size={12} /> Esborrar la llista
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
