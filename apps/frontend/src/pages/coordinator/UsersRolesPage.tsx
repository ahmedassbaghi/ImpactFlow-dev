import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users, X } from "lucide-react";
import { listParticipants } from "../../api/participants";
import {
  activateUser,
  createUser,
  getUserAssignments,
  listUsers,
  setUserAssignments,
} from "../../api/users";
import { SchoolBadge } from "../../components/common/SchoolBadge";
import { toast } from "../../stores/toastStore";

const ROLE_LABELS: Record<string, string> = {
  coordinator: "Coordinador/a",
  professional: "Voluntari/a",
  pending: "Pendent",
  donor: "Donant",
  admin: "Admin",
};

export default function UsersRolesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const { data: allParticipants = [] } = useQuery({
    queryKey: ["participants"],
    queryFn: () => listParticipants(),
  });

  const [form, setForm] = useState({
    email: "",
    full_name: "",
    role: "professional",
    password: "",
  });

  const [assignUserId, setAssignUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [activateRoles, setActivateRoles] = useState<Record<string, "coordinator" | "professional">>({});

  const { data: assigned = [] } = useQuery({
    queryKey: ["user-assignments", assignUserId],
    queryFn: () => getUserAssignments(assignUserId!),
    enabled: !!assignUserId,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setForm({ email: "", full_name: "", role: "professional", password: "" });
      toast.success("Usuari creat");
    },
  });

  const activateMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "coordinator" | "professional" }) =>
      activateUser(userId, { role, is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Usuari activat");
    },
    onError: () => toast.error("No s'ha pogut activar l'usuari"),
  });

  const saveAssignments = useMutation({
    mutationFn: () => setUserAssignments(assignUserId!, selectedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-assignments", assignUserId] });
      toast.success("Assignacions desades");
      setAssignUserId(null);
    },
  });

  const openAssign = (userId: string) => {
    setAssignUserId(userId);
    setSelectedIds([]);
    setSearch("");
  };

  const pending = (data ?? []).filter((u) => !u.is_active || u.role === "pending");
  const volunteers = (data ?? []).filter((u) => u.role === "professional" && u.is_active);
  const coordinators = (data ?? []).filter((u) => u.role === "coordinator" && u.is_active);

  const filteredParticipants = allParticipants.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.school_abbreviation ?? "").toLowerCase().includes(q)
    );
  });

  const getActivateRole = (userId: string) => activateRoles[userId] ?? "professional";

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Usuaris i assignacions</h1>
        <p className="page-subtitle">Activa nous registres i gestiona l&apos;equip</p>
      </div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Comptes pendents d&apos;activació</h3>
        {isLoading && <p className="muted">Carregant…</p>}
        {!isLoading && pending.length === 0 && (
          <p className="muted">No hi ha usuaris en espera.</p>
        )}
        <div className="programs-grid">
          {pending.map((u) => (
            <div key={u.id} className="program-card" style={{ borderColor: "#fcd9b8" }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  color: "#c45a00",
                  background: "#fff4eb",
                  padding: "0.2rem 0.5rem",
                  borderRadius: 6,
                  marginBottom: "0.35rem",
                }}
              >
                Inactiu · standby
              </span>
              <strong>{u.full_name}</strong>
              <div className="muted" style={{ fontSize: "0.85rem" }}>{u.email}</div>
              {u.username && (
                <div className="muted" style={{ fontSize: "0.82rem" }}>
                  @{u.username}
                </div>
              )}
              <label style={{ display: "block", marginTop: "0.75rem", fontSize: "0.85rem" }}>
                Rol en activar
                <select
                  className="form-select"
                  style={{ marginTop: "0.35rem" }}
                  value={getActivateRole(u.id)}
                  onChange={(e) =>
                    setActivateRoles((prev) => ({
                      ...prev,
                      [u.id]: e.target.value as "coordinator" | "professional",
                    }))
                  }
                >
                  <option value="professional">Voluntari/a</option>
                  <option value="coordinator">Coordinador/a</option>
                </select>
              </label>
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: "0.75rem" }}
                disabled={activateMutation.isPending}
                onClick={() =>
                  activateMutation.mutate({ userId: u.id, role: getActivateRole(u.id) })
                }
              >
                {activateMutation.isPending ? "Activant…" : "Activar compte"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Crear usuari (coordinador)</h3>
        <div className="form-grid-2">
          <label>
            Nom complet
            <input
              className="form-input"
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            />
          </label>
          <label>
            Email
            <input
              className="form-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </label>
          <label>
            Rol
            <select
              className="form-select"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            >
              <option value="coordinator">Coordinador/a</option>
              <option value="professional">Voluntari/a</option>
              <option value="donor">Donant</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Contrasenya
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: "0.9rem" }}
          onClick={() => createMutation.mutate(form)}
        >
          {createMutation.isPending ? "Creant…" : "Crear usuari"}
        </button>
      </div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Coordinadors actius</h3>
        <div className="programs-grid">
          {coordinators.map((u) => (
            <div key={u.id} className="program-card">
              <strong>{u.full_name}</strong>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                {u.email} · {ROLE_LABELS[u.role] ?? u.role}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>Voluntaris actius</h3>
        {isLoading && <p className="muted">Carregant…</p>}
        <div className="programs-grid">
          {volunteers.map((u) => (
            <div key={u.id} className="program-card">
              <strong>{u.full_name}</strong>
              <div className="muted" style={{ fontSize: "0.85rem" }}>{u.email}</div>
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: "0.75rem" }}
                onClick={() => {
                  openAssign(u.id);
                  getUserAssignments(u.id).then((list) => setSelectedIds(list.map((p) => p.id)));
                }}
              >
                <Users size={14} /> Assignar alumnes
              </button>
            </div>
          ))}
        </div>
      </div>

      {assignUserId && (
        <div className="modal-overlay" onClick={() => setAssignUserId(null)}>
          <div className="modal-content modal-content--md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Assignar alumnes al voluntari</h2>
              <button type="button" className="modal-close-btn" onClick={() => setAssignUserId(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <input
                className="form-input"
                placeholder="Cerca per nom, codi o escola…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div style={{ maxHeight: 320, overflowY: "auto", marginTop: "0.75rem" }}>
                {filteredParticipants.map((p) => (
                  <label
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.4rem 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds((ids) => [...ids, p.id]);
                        else setSelectedIds((ids) => ids.filter((id) => id !== p.id));
                      }}
                    />
                    <span>{p.first_name}</span>
                    <SchoolBadge abbreviation={p.school_abbreviation} name={p.school_name} />
                    <span className="muted" style={{ fontSize: "0.78rem" }}>
                      {p.code}
                    </span>
                  </label>
                ))}
              </div>
              <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                {assigned.length} alumnes assignats actualment
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setAssignUserId(null)}>
                Cancel·lar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saveAssignments.isPending}
                onClick={() => saveAssignments.mutate()}
              >
                Desar assignacions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
