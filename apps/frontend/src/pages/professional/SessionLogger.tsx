import { QuickSessionLogger } from "../../components/sessions/QuickSessionLogger";

export default function SessionLoggerPage() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Registre de sessió</h1>
          <p className="page-subtitle">Captura evidència de cada sessió en menys d'un minut</p>
        </div>
      </div>
      <QuickSessionLogger />
    </div>
  );
}
