import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Zap, X } from "lucide-react";
import { QuickSessionLogger } from "./QuickSessionLogger";
import { useAuthStore } from "../../stores/authStore";

const HIDE_ON_PATHS = ["/professional/session-logger", "/login", "/donor/impact-portal"];

export function QuickLoggerFAB() {
  const location = useLocation();
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    const openHandler = () => setOpen(true);
    window.addEventListener("if:open-quick-logger", openHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("if:open-quick-logger", openHandler);
    };
  }, []);

  if (!token) return null;
  if (role && !["professional", "coordinator", "admin"].includes(role)) return null;
  if (HIDE_ON_PATHS.some((p) => location.pathname.startsWith(p))) return null;

  return (
    <>
      <motion.button
        type="button"
        className="qfab"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.06, boxShadow: "0 14px 30px rgba(79,70,229,0.35)" }}
        whileTap={{ scale: 0.94 }}
        initial={{ scale: 0, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.3 }}
        title="Registre ràpid (Ctrl+Shift+N)"
      >
        <Zap size={22} strokeWidth={2.2} />
        <span className="qfab-label">Registre</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="qfab-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="qfab-modal"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="qfab-modal-header">
                <div className="qfab-modal-title">
                  <Zap size={16} strokeWidth={2.2} />
                  Registre de sessió
                </div>
                <button className="qfab-modal-close" onClick={() => setOpen(false)} title="Tancar (Esc)">
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
              <div className="qfab-modal-body">
                <QuickSessionLogger compact onClose={() => setOpen(false)} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
