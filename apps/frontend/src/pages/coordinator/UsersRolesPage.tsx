import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createUser, listUsers } from "../../api/users";

export default function UsersRolesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const [form, setForm] = useState({
    email: "",
    full_name: "",
    role: "professional",
    password: "",
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setForm({ email: "", full_name: "", role: "professional", password: "" });
    },
  });

  return (
    <div className="grid">
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Gestión de usuarios y roles</h1>
      </div>

      <div className="card">
        <h3>Crear nuevo usuario</h3>
        <div className="grid grid-2">
          <label>
            Nombre completo
            <input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
          </label>
          <label>
            Email
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          </label>
          <label>
            Rol
            <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="admin">admin</option>
              <option value="coordinator">coordinator</option>
              <option value="professional">professional</option>
              <option value="donor">donor</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </label>
        </div>
        <button style={{ marginTop: "0.9rem" }} onClick={() => createMutation.mutate(form)}>
          {createMutation.isPending ? "Creando..." : "Crear usuario"}
        </button>
      </div>

      <div className="card">
        <h3>Usuarios activos</h3>
        {isLoading && <p className="muted">Cargando...</p>}
        {!!data?.length && (
          <div className="grid">
            {data.map((u) => (
              <div key={u.id} className="card" style={{ background: "#fcfcff" }}>
                <strong>{u.full_name}</strong>
                <div className="muted">{u.email}</div>
                <span className="chip">{u.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
