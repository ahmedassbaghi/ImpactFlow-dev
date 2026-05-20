import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const VOL_HOME = "/professional/session-logger";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  children?: React.ReactNode;
};

export function VolunteerPageHeader({ title, subtitle, showBack, backTo, children }: Props) {
  const navigate = useNavigate();

  return (
    <header className="vol-page-head">
      {showBack && (
        <button
          type="button"
          className="vol-btn-back"
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          aria-label="Tornar enrere"
        >
          <ArrowLeft size={18} strokeWidth={2.5} aria-hidden />
          Tornar
        </button>
      )}
      <h1 className="vol-page-title">{title}</h1>
      {subtitle && <p className="vol-page-sub">{subtitle}</p>}
      {children && <div className="vol-page-toolbar">{children}</div>}
    </header>
  );
}

export { VOL_HOME };
