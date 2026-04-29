import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { useToastStore, type ToastKind } from "../../stores/toastStore";

const META: Record<ToastKind, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle2,   color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  error:   { icon: XCircle,        color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  info:    { icon: Info,           color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  warning: { icon: AlertTriangle,  color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
};

export function ToastViewport() {
  const toasts  = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const meta = META[t.kind];
          const Icon = meta.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.92, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="toast-card"
              style={{ background: meta.bg, borderColor: meta.border }}
              role="status"
            >
              <span className="toast-icon" style={{ color: meta.color }}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <div className="toast-body">
                <div className="toast-title" style={{ color: meta.color }}>{t.title}</div>
                {t.message && <div className="toast-message">{t.message}</div>}
              </div>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Tancar">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
