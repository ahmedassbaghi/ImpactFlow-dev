import { Clock } from "lucide-react";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08–22
const MINUTES = [0, 15, 30, 45] as const;

function parseTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    const now = new Date();
    const minute = Math.round(now.getMinutes() / 15) * 15;
    return { hour: now.getHours(), minute: minute >= 60 ? 0 : minute };
  }
  return { hour: h, minute: m };
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function defaultSessionTime(): string {
  const now = new Date();
  let minute = Math.round(now.getMinutes() / 15) * 15;
  let hour = now.getHours();
  if (minute >= 60) {
    minute = 0;
    hour = Math.min(22, hour + 1);
  }
  if (hour < 8) return "09:00";
  if (hour > 22) return "17:00";
  return formatTime(hour, minute);
}

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Barra superior del coordinador: menys alçada, mateixos chips */
  compact?: boolean;
};

export function SessionTimePicker({
  id = "session-time",
  label = "Hora de la sessió",
  value,
  onChange,
  disabled,
  compact = false,
}: Props) {
  const { hour, minute } = parseTime(value);
  const safeHour = HOURS.includes(hour) ? hour : 9;
  const safeMinute = MINUTES.includes(minute as (typeof MINUTES)[number]) ? minute : 0;

  const setHour = (h: number) => onChange(formatTime(h, safeMinute));
  const setMinute = (m: number) => onChange(formatTime(safeHour, m));

  return (
    <div className={`ql-time-picker${compact ? " ql-time-picker--compact" : ""}`}>
      <label className="ql-time-picker-label" htmlFor={`${id}-display`}>
        <Clock size={14} strokeWidth={2} aria-hidden />
        {label}
      </label>
      <p className="ql-time-picker-display" id={`${id}-display`} aria-live="polite">
        {formatTime(safeHour, safeMinute)}
      </p>
      <div className="ql-time-picker-grid" role="group" aria-label="Selecciona l'hora">
        <span className="ql-time-picker-section-title">Hora</span>
        <div className="ql-time-picker-hours">
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              className={`ql-time-chip${safeHour === h ? " is-active" : ""}`}
              disabled={disabled}
              aria-pressed={safeHour === h}
              onClick={() => setHour(h)}
            >
              {String(h).padStart(2, "0")}
            </button>
          ))}
        </div>
        <span className="ql-time-picker-section-title">Minuts</span>
        <div className="ql-time-picker-minutes">
          {MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              className={`ql-time-chip ql-time-chip--wide${safeMinute === m ? " is-active" : ""}`}
              disabled={disabled}
              aria-pressed={safeMinute === m}
              onClick={() => setMinute(m)}
            >
              :{String(m).padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
