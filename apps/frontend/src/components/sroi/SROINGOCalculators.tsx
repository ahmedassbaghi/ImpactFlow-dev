import { useEffect, useState } from "react";
import { Coins, HandHeart, TrendingUp } from "lucide-react";
import type { NgoSroiCalculator } from "../../api/dashboard";

type Props = {
  data: NgoSroiCalculator;
  contributionEur: number;
  onContributionChange: (v: number) => void;
  volunteerHours: number;
  onVolunteerHoursChange: (v: number) => void;
};

function formatEur(n: number) {
  return `€${n.toLocaleString("ca-ES", { maximumFractionDigits: 0 })}`;
}

/** Proporció de beneficis del programa → part equivalent del guany mitjà IPI per infant. */
function estimateIpiPts(
  totalBenefitEur: number,
  programOutcomesEur: number,
  avgIpiGain: number
): number {
  if (!programOutcomesEur || programOutcomesEur <= 0 || !avgIpiGain) return 0;
  const share = Math.min(totalBenefitEur / programOutcomesEur, 1);
  return avgIpiGain * share;
}

export default function SROINGOCalculators({
  data,
  contributionEur,
  onContributionChange,
  volunteerHours,
  onVolunteerHoursChange,
}: Props) {
  const [contribInput, setContribInput] = useState(String(contributionEur));
  const [hoursInput, setHoursInput] = useState(String(volunteerHours));

  useEffect(() => {
    const t = setTimeout(() => {
      const v = Number(contribInput);
      if (!Number.isNaN(v) && v >= 0) onContributionChange(v);
    }, 400);
    return () => clearTimeout(t);
  }, [contribInput, onContributionChange]);

  useEffect(() => {
    const v = Number(hoursInput);
    if (!Number.isNaN(v) && v > 0 && v <= 500) onVolunteerHoursChange(v);
  }, [hoursInput, onVolunteerHoursChange]);

  const money = data.money_calculator;
  const vol = data.volunteer_calculator;
  const programOutcomes =
    data.impact.outcomes_value_eur ?? data.impact.total_value_eur ?? 0;
  const avgIpiGain = data.program.avg_ipi_gain ?? 0;

  const moneyBenefit = money.total_benefit_eur ?? money.total_value_eur ?? 0;
  const volBenefit = vol.total_benefit_eur ?? vol.total_value_eur ?? 0;
  const moneyIpi = estimateIpiPts(moneyBenefit, programOutcomes, avgIpiGain);
  const volIpi = estimateIpiPts(volBenefit, programOutcomes, avgIpiGain);
  const moneyIpiPerEuro =
    contributionEur > 0 ? moneyIpi / contributionEur : 0;
  const volIpiPerHour =
    volunteerHours > 0 ? volIpi / volunteerHours : 0;

  return (
    <div className="ngo-sroi">
      <div className="ngo-sroi-calc-grid">
        <article className="ngo-sroi-calc-card" aria-labelledby="money-calc-title">
          <div className="ngo-sroi-calc-header">
            <Coins size={22} aria-hidden />
            <h3 id="money-calc-title">Aportació en diners</h3>
          </div>
          <p className="ngo-sroi-calc-lead">
            Introdueix quant voldries aportar i veuràs l&apos;impacte en valor social (€)
            i la millora estimada en punts IPI.
          </p>
          <label className="ngo-sroi-field" htmlFor="ngo-contribution">
            Import (€)
            <input
              id="ngo-contribution"
              type="number"
              className="form-input"
              min={0}
              step={100}
              value={contribInput}
              onChange={(e) => setContribInput(e.target.value)}
            />
          </label>
          <div className="ngo-sroi-results">
            <p className="ngo-sroi-results-heading">Impacte estimat</p>
            <div className="ngo-sroi-impact-dual">
              <div className="ngo-sroi-impact-metric ngo-sroi-impact-metric--money">
                <span className="ngo-sroi-impact-label">Valor social</span>
                <strong>{formatEur(moneyBenefit)}</strong>
              </div>
              <div className="ngo-sroi-impact-metric ngo-sroi-impact-metric--ipi">
                <span className="ngo-sroi-impact-label">
                  <TrendingUp size={13} strokeWidth={2.5} aria-hidden />
                  Millora IPI
                </span>
                <strong>
                  {moneyIpi > 0 ? "+" : ""}
                  {moneyIpi.toFixed(1)} <span className="ngo-sroi-impact-unit">pts</span>
                </strong>
              </div>
            </div>
            <p className="ngo-sroi-per-unit">
              <strong>{money.value_per_euro.toFixed(2)} €</strong> de valor per cada €1 ·{" "}
              <strong>{moneyIpiPerEuro.toFixed(2)} pts IPI</strong> per €1 (estimació per infant)
            </p>
          </div>
        </article>

        <article className="ngo-sroi-calc-card" aria-labelledby="vol-calc-title">
          <div className="ngo-sroi-calc-header">
            <HandHeart size={22} aria-hidden />
            <h3 id="vol-calc-title">Temps de voluntariat</h3>
          </div>
          <p className="ngo-sroi-calc-lead">
            Introdueix les hores que dedicaries i veuràs l&apos;impacte en valor social (€)
            i la millora estimada en punts IPI.
          </p>
          <label className="ngo-sroi-field" htmlFor="ngo-vol-hours">
            Hores
            <input
              id="ngo-vol-hours"
              type="number"
              className="form-input"
              min={0.5}
              max={500}
              step={0.5}
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
            />
          </label>
          <div className="ngo-sroi-results">
            <p className="ngo-sroi-results-heading">Impacte estimat</p>
            <div className="ngo-sroi-impact-dual">
              <div className="ngo-sroi-impact-metric ngo-sroi-impact-metric--money">
                <span className="ngo-sroi-impact-label">Valor social</span>
                <strong>{formatEur(volBenefit)}</strong>
              </div>
              <div className="ngo-sroi-impact-metric ngo-sroi-impact-metric--ipi">
                <span className="ngo-sroi-impact-label">
                  <TrendingUp size={13} strokeWidth={2.5} aria-hidden />
                  Millora IPI
                </span>
                <strong>
                  {volIpi > 0 ? "+" : ""}
                  {volIpi.toFixed(1)} <span className="ngo-sroi-impact-unit">pts</span>
                </strong>
              </div>
            </div>
            <p className="ngo-sroi-per-unit">
              Al voltant de{" "}
              <strong>
                {(vol.outcomes_per_hour_eur ?? vol.total_value_per_hour_eur ?? 0).toFixed(2)} €
              </strong>{" "}
              de valor per hora ·{" "}
              <strong>{volIpiPerHour.toFixed(2)} pts IPI</strong> per hora (estimació per infant)
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
