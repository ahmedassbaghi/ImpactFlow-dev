import { QuickSessionLogger } from "../../components/sessions/QuickSessionLogger";

export default function SessionLoggerPage() {
  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Registro de sesión</h1>
      </div>
      <div className="card logger-intro">
        <h3>Registro rápido e intuitivo</h3>
        <p className="muted">
          Selecciona el tipo de sesión, el participante y captura evidencia clave. El formulario te guía paso a paso.
        </p>
        <div className="grid grid-3">
          <div className="quick-tip">
            <strong>1. Configura</strong>
            <span className="muted">Programa, tipo y duración de sesión.</span>
          </div>
          <div className="quick-tip">
            <strong>2. Selecciona</strong>
            <span className="muted">Busca participante por nombre o código.</span>
          </div>
          <div className="quick-tip">
            <strong>3. Guarda</strong>
            <span className="muted">Añade notas y puntuaciones, luego confirma.</span>
          </div>
        </div>
      </div>
      <QuickSessionLogger />
    </div>
  );
}
