import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type PremiumSelectOption = {
  value: string;
  label: string;
};

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: PremiumSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  size?: "md" | "lg";
  className?: string;
};

export function PremiumSelect({
  id: idProp,
  label,
  value,
  onChange,
  options,
  placeholder = "Selecciona…",
  disabled = false,
  size = "lg",
  className = "",
}: Props) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((o) => !o);
    }
    if (e.key === "Escape") setOpen(false);
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setOpen(true);
    }
    if (open && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    }
    if (open && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    }
    if (open && e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) pick(opt.value);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`premium-select premium-select--${size}${className ? ` ${className}` : ""}`}
    >
      <span className="premium-select-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        type="button"
        id={id}
        className={`premium-select-trigger${open ? " is-open" : ""}${!selected ? " is-placeholder" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="premium-select-value">{displayLabel}</span>
        <ChevronDown
          size={20}
          strokeWidth={2.25}
          className={`premium-select-chevron${open ? " is-open" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="premium-select-menu"
          tabIndex={-1}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isHighlighted = i === highlight;
            return (
              <li key={opt.value || "__empty"} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`premium-select-option${isSelected ? " is-selected" : ""}${
                    isHighlighted ? " is-highlighted" : ""
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(opt.value)}
                >
                  <span className="premium-select-option-label">{opt.label}</span>
                  {isSelected && (
                    <Check size={18} strokeWidth={2.5} className="premium-select-check" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
