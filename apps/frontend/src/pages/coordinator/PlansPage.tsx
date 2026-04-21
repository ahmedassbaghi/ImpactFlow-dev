import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrganizationPlan, updateOrganizationPlan } from "../../api/organization";

const plans = [
  { id: "free", title: "Free", desc: "Inicio y validación del producto base." },
  { id: "starter", title: "Starter", desc: "Operación de un programa y reporte simple." },
  { id: "pro", title: "Pro", desc: "Gestión multi-centro, analytics y reportes trimestrales." },
  { id: "enterprise", title: "Enterprise", desc: "Escala completa con personalización y gobierno." },
] as const;

export default function PlansPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["organization-plan"],
    queryFn: getOrganizationPlan,
  });

  const updateMutation = useMutation({
    mutationFn: updateOrganizationPlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization-plan"] }),
  });

  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Planes y configuración</h1>
      </div>
      <div className="card">
        <h3>Plan actual</h3>
        {isLoading ? <p className="muted">Cargando...</p> : <p>{data?.name}: <strong>{data?.plan}</strong></p>}
      </div>
      <div className="grid grid-2">
        {plans.map((plan) => (
          <div className="card" key={plan.id}>
            <div className="page-header" style={{ marginBottom: "0.2rem" }}>
              <h3 style={{ margin: 0 }}>{plan.title}</h3>
              {data?.plan === plan.id && <span className="chip">Activo</span>}
            </div>
            <p className="muted">{plan.desc}</p>
            <button disabled={data?.plan === plan.id} onClick={() => updateMutation.mutate(plan.id)}>
              {updateMutation.isPending ? "Actualizando..." : `Cambiar a ${plan.title}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
