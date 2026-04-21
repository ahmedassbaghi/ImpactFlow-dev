import { useQuery } from "@tanstack/react-query";
import { getDonorDashboard } from "../../api/dashboard";

export default function ImpactPortalPage() {
  const { data } = useQuery({
    queryKey: ["donor-dashboard"],
    queryFn: () => getDonorDashboard("narinan"),
  });

  return (
    <div className="grid">
      <section className="card">
        <h1>Your Impact, Visualized.</h1>
        <p className="muted">Portal público con datos agregados y transparencia de resultados.</p>
      </section>
      <section className="grid grid-3" style={{ marginTop: "1rem" }}>
        <div className="card">
          <h3>Nens atesos</h3>
          <strong>{data?.children_served ?? 0}</strong>
        </div>
        <div className="card">
          <h3>Millora IPI mitjana</h3>
          <strong>{data?.avg_ipi ?? 0}</strong>
        </div>
        <div className="card">
          <h3>Success Story</h3>
          <p>"Ara participa activament i progressa cada setmana."</p>
        </div>
      </section>
      <section className="card">
        <h3>Before & After Effect</h3>
        <p className="muted">
          Baseline del programa → progreso actual con métricas agregadas, sin exponer datos personales.
        </p>
      </section>
    </div>
  );
}
