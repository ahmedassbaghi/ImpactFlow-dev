import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
};

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <motion.div
      className="empty-state-pro"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={28} strokeWidth={1.5} />
        </div>
      )}
      <h4 className="empty-state-title">{title}</h4>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && (
        <button className="btn-primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </motion.div>
  );
}
