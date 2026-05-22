import { BarChart3 } from "lucide-react";
import AuthLogo from "./AuthLogo";

export default function AuthBrandHeader() {
  return (
    <header className="auth-brand-header">
      <AuthLogo />
      <p className="auth-impactflow-tag">
        <BarChart3 size={15} strokeWidth={2.5} aria-hidden />
        <span>
          ImpactFlow · <span className="auth-impactflow-tag-muted">De l&apos;activitat a l&apos;evidència</span>
        </span>
      </p>
    </header>
  );
}
