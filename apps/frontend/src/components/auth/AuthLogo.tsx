import { NARINAN_LOGO } from "../../constants/branding";
import ImpactFlowLogo from "../brand/ImpactFlowLogo";

/** ImpactFlow × Narinan (login, registre, etc.) */
export default function AuthLogo() {
  return (
    <div
      className="auth-partnership"
      aria-label="ImpactFlow en col·laboració amb Narinan"
    >
      <ImpactFlowLogo variant="lockup" onDark height={52} />
      <span className="partnership-x" aria-hidden>
        ×
      </span>
      <img        src={NARINAN_LOGO}
        alt="Narinan"
        className="auth-narinan-logo"
        decoding="async"
      />
    </div>
  );
}
