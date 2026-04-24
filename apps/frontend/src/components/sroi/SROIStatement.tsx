interface SROIStatementProps {
  sroiRatio: number;
  conservative?: number;
  optimistic?: number;
  statement?: string;
}

export default function SROIStatement({ sroiRatio, conservative, optimistic, statement }: SROIStatementProps) {
  return (
    <div className="sroi-statement-card">
      <div className="sroi-statement-label">Retorn Social de la Inversió</div>
      <div className="sroi-ratio">
        €{sroiRatio.toFixed(2)}
        <span className="sroi-ratio-unit"> per cada €1 invertit</span>
      </div>
      {statement && <p className="sroi-statement-text">{statement}</p>}
      {conservative != null && optimistic != null && (
        <div className="sroi-sensitivity">
          <span className="sroi-sensitivity-label">Rang de sensibilitat:</span>
          <span className="sroi-sensitivity-range">
            conservador €{conservative.toFixed(2)} — optimista €{optimistic.toFixed(2)}
          </span>
        </div>
      )}
      <div className="sroi-methodology-note">
        Metodologia SROI Network Standard (2012) · Proxies INE 2023
      </div>
    </div>
  );
}
