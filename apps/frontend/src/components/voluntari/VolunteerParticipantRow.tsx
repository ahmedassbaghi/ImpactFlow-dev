import { ChevronRight } from "lucide-react";
import { SchoolBadge } from "../common/SchoolBadge";

function participantHue(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return hash % 360;
}

type Props = {
  id: string;
  firstName: string;
  code: string;
  schoolAbbreviation?: string | null;
  schoolName?: string | null;
  meta?: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  onRowClick?: () => void;
};

export function VolunteerParticipantRow({
  firstName,
  code,
  schoolAbbreviation,
  schoolName,
  meta,
  actionLabel,
  onAction,
  actionDisabled,
  onRowClick,
}: Props) {
  const hue = participantHue(firstName);

  const MainWrap = onRowClick ? "button" : "div";
  const mainProps = onRowClick
    ? { type: "button" as const, onClick: onRowClick }
    : {};

  return (
    <article className="vol-person-card">
      <MainWrap className="vol-person-card-main" {...mainProps}>
        <span
          className="vol-person-avatar"
          style={{
            background: `hsl(${hue}, 68%, 93%)`,
            color: `hsl(${hue}, 52%, 34%)`,
          }}
          aria-hidden
        >
          {(firstName[0] ?? "?").toUpperCase()}
        </span>
        <span className="vol-person-body">
          <span className="vol-person-name">{firstName}</span>
          <span className="vol-person-meta">
            <span className="vol-person-code">{code}</span>
            <SchoolBadge abbreviation={schoolAbbreviation} name={schoolName} />
            {meta && <span className="vol-person-extra">{meta}</span>}
          </span>
        </span>
        {onRowClick && <ChevronRight size={18} className="vol-person-chevron" aria-hidden />}
      </MainWrap>
      <button
        type="button"
        className="vol-person-action"
        onClick={onAction}
        disabled={actionDisabled}
      >
        {actionLabel}
      </button>
    </article>
  );
}
