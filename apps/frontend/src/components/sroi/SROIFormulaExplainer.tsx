import { Divide, Info } from "lucide-react";
import type { SroiFormulaExplanation } from "../../api/dashboard";

const COLOR_MAP: Record<string, string> = {
  academic: "var(--dim-academic)",
  risk: "var(--risk-high)",
  integration: "var(--dim-integration)",
  social: "var(--dim-social)",
};

function formatEur(n: number) {
  return `€${n.toLocaleString("ca-ES", { maximumFractionDigits: 0 })}`;
}

export type { SroiFormulaExplanation };

type Props = {
  formula: SroiFormulaExplanation;
  formatCurrency?: (n: number) => string;
};

export default function SROIFormulaExplainer({ formula, formatCurrency }: Props) {
  const fmt = formatCurrency ?? formatEur;
  const { inputs, corrections } = formula;

  return (
    <section
      className="sroi-formula"
      aria-labelledby="sroi-formula-title"
    >
      <h3 id="sroi-formula-title" className="sroi-formula-title">
        Com es calcula el SROI
      </h3>
      <p className="sroi-formula-lead">{formula.headline}</p>

      {/* Equació principal */}
      <div className="sroi-formula-equation" role="img" aria-label={`${fmt(formula.numerator_eur)} dividit per ${fmt(formula.denominator_eur)} igual a ${formula.ratio.toFixed(2)} vegades`}>
        <div className="sroi-formula-box sroi-formula-box--num">
          <span className="sroi-formula-box-tag">Numerador</span>
          <span className="sroi-formula-box-label">Beneficis mesurats</span>
          <strong className="sroi-formula-box-value">{fmt(formula.numerator_eur)}</strong>
        </div>
        <div className="sroi-formula-op" aria-hidden="true">
          <Divide size={28} strokeWidth={2.5} />
        </div>
        <div className="sroi-formula-box sroi-formula-box--den">
          <span className="sroi-formula-box-tag">Denominador</span>
          <span className="sroi-formula-box-label">Cost en efectiu</span>
          <strong className="sroi-formula-box-value">{fmt(formula.denominator_eur)}</strong>
        </div>
        <div className="sroi-formula-op sroi-formula-op--eq" aria-hidden="true">
          =
        </div>
        <div className="sroi-formula-box sroi-formula-box--result">
          <span className="sroi-formula-box-tag">Resultat</span>
          <span className="sroi-formula-box-label">SROI</span>
          <strong className="sroi-formula-box-value sroi-formula-box-value--ratio">
            {formula.ratio.toFixed(2)}×
          </strong>
          <span className="sroi-formula-box-hint">per cada €1 invertit</span>
        </div>
      </div>

      <div className="sroi-formula-grid">
        {/* Beneficis — barres apilades */}
        <article className="sroi-formula-panel" aria-labelledby="sroi-num-title">
          <h4 id="sroi-num-title" className="sroi-formula-panel-title">
            1. Beneficis (numerador)
          </h4>
          <p className="sroi-formula-panel-desc">
            Suma de quatre àrees d&apos;impacte, amb correccions SROI aplicades.
          </p>
          <div
            className="sroi-formula-stacked"
            role="list"
            aria-label="Desglossament del numerador"
          >
            {formula.numerator_components.map((c) => (
              <div
                key={c.key}
                role="listitem"
                className="sroi-formula-stacked-seg"
                style={{
                  width: `${Math.max(c.share_pct, 4)}%`,
                  background: COLOR_MAP[c.color] ?? "var(--brand-500)",
                }}
                title={`${c.label}: ${fmt(c.eur)} (${c.share_pct}%)`}
              >
                <span className="visually-hidden">
                  {c.label}: {fmt(c.eur)}, {c.share_pct}%
                </span>
              </div>
            ))}
          </div>
          <ul className="sroi-formula-legend">
            {formula.numerator_components.map((c) => (
              <li key={c.key}>
                <span
                  className="sroi-formula-swatch"
                  style={{ background: COLOR_MAP[c.color] ?? "var(--brand-500)" }}
                  aria-hidden
                />
                <div className="sroi-formula-legend-text">
                  <span className="sroi-formula-legend-label">
                    {c.label} <strong>{fmt(c.eur)}</strong> ({c.share_pct}%)
                  </span>
                  <span className="sroi-formula-legend-hint">{c.hint}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        {/* Cost — desglossament */}
        <article className="sroi-formula-panel" aria-labelledby="sroi-den-title">
          <h4 id="sroi-den-title" className="sroi-formula-panel-title">
            2. Cost en efectiu (denominador)
          </h4>
          <p className="sroi-formula-panel-desc">
            Model mixt: estructura del programa (fix, ~45 €/participant/mes) + cost directe
            de cada sessió (~15 €: materials, consumibles i logística). El voluntariat no es
            compta al denominador.
          </p>
          <ul className="sroi-formula-cost-list">
            {formula.denominator_components.map((c) => (
              <li key={c.id}>
                <div className="sroi-formula-cost-row">
                  <span>{c.label}</span>
                  <strong>{fmt(c.eur)}</strong>
                </div>
                <code className="sroi-formula-cost-code">{c.formula_text}</code>
              </li>
            ))}
            <li className="sroi-formula-cost-total">
              <span>Total cost</span>
              <strong>{fmt(formula.denominator_eur)}</strong>
            </li>
          </ul>
        </article>
      </div>

      {/* Dades d'entrada */}
      <details className="sroi-formula-details">
        <summary>Dades del període (des de registres)</summary>
        <dl className="sroi-formula-inputs">
          <div>
            <dt>Participants</dt>
            <dd>{inputs.n_participants}</dd>
          </div>
          <div>
            <dt>Sessions registrades</dt>
            <dd>{inputs.n_sessions_registered}</dd>
          </div>
          <div>
            <dt>Sessions per infant</dt>
            <dd>{inputs.sessions_per_participant ?? "—"}</dd>
          </div>
          <div>
            <dt>Sessions efectives (suport)</dt>
            <dd>
              {inputs.n_sessions_effective}
              {inputs.dose_ratio != null && (
                <span className="sroi-formula-input-note">
                  {" "}
                  (dosi {inputs.dose_ratio}×)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Multiplicador beneficis IPI</dt>
            <dd>{inputs.dose_outcomes_multiplier ?? "—"}×</dd>
          </div>
          <div>
            <dt>Guany mitjà IPI</dt>
            <dd>+{inputs.avg_ipi_gain} punts</dd>
          </div>
          <div>
            <dt>Risc alt (avaluacions)</dt>
            <dd>{inputs.pct_high_risk}%</dd>
          </div>
          <div>
            <dt>Millora integració</dt>
            <dd>{inputs.pct_integration_gain}%</dd>
          </div>
          <div>
            <dt>Durada programa</dt>
            <dd>{inputs.program_duration_months} mesos</dd>
          </div>
          <div>
            <dt>Hores voluntariat (ref.)</dt>
            <dd>{inputs.total_volunteer_hours} h</dd>
          </div>
        </dl>
        <p className="sroi-formula-saturation">
          <Info size={16} aria-hidden />
          {formula.saturation_note}
        </p>
      </details>

      <details className="sroi-formula-details">
        <summary>Correccions SROI i sensibilitat</summary>
        <div className="sroi-formula-corrections">
          <p>
            <strong>Deadweight</strong> {corrections.deadweight_pct}% ·{" "}
            <strong>Atribució</strong> {corrections.attribution_pct}% ·{" "}
            <strong>Drop-off</strong> {corrections.drop_off_pct}%
          </p>
          <p>{corrections.note}</p>
        </div>
        <ul className="sroi-formula-sensitivity" aria-label="Anàlisi de sensibilitat">
          <li>
            <span>Conservador</span>
            <strong>{formula.sensitivity.conservative?.toFixed(2) ?? "—"}×</strong>
          </li>
          <li>
            <span>Central</span>
            <strong>{formula.sensitivity.central?.toFixed(2) ?? "—"}×</strong>
          </li>
          <li>
            <span>Optimista</span>
            <strong>{formula.sensitivity.optimistic?.toFixed(2) ?? "—"}×</strong>
          </li>
        </ul>
        <p className="sroi-formula-method">{formula.methodology_reference}</p>
      </details>
    </section>
  );
}
