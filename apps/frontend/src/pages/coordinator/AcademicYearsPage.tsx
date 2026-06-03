import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, GraduationCap, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  createAcademicYear,
  listAcademicYears,
  listYearStudents,
  promoteStudents,
  setCurrentAcademicYear,
  suggestAcademicYear,
  updateAcademicYear,
} from "../../api/academicYears";
import { toast } from "../../stores/toastStore";

function yearBadge(year: { is_current: boolean; end_date: string; start_date: string }) {
  const today = new Date().toISOString().slice(0, 10);
  if (year.is_current) return { label: "Actual", cls: "badge-current" };
  if (year.end_date < today) return { label: "Passat", cls: "badge-past" };
  if (year.start_date > today) return { label: "Futur", cls: "badge-future" };
  return { label: "Passat", cls: "badge-past" };
}

export default function AcademicYearsPage() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [form, setForm] = useState({ title: "", start_date: "", end_date: "", is_current: true });

  const { data: years = [], isLoading } = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["year-students", selectedYearId],
    queryFn: () => listYearStudents(selectedYearId!),
    enabled: !!selectedYearId,
  });

  const { data: promotePreview, refetch: refetchPromote } = useQuery({
    queryKey: ["promote-preview", selectedYearId],
    queryFn: () => promoteStudents(selectedYearId!, false),
    enabled: promoteOpen && !!selectedYearId,
  });

  const createMut = useMutation({
    mutationFn: createAcademicYear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academic-years"] });
      setFormOpen(false);
      toast.success("Any escolar creat");
    },
  });

  const setCurrentMut = useMutation({
    mutationFn: setCurrentAcademicYear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("Any marcat com a actual");
    },
  });

  const promoteMut = useMutation({
    mutationFn: () => promoteStudents(selectedYearId!, true),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["academic-years"] });
      qc.invalidateQueries({ queryKey: ["year-students"] });
      qc.invalidateQueries({ queryKey: ["participants"] });
      setPromoteOpen(false);
      toast.success("Promoció aplicada", `${res.applied} alumnes promocionats`);
    },
  });

  const openCreate = async () => {
    const s = await suggestAcademicYear();
    setForm({
      title: s.title,
      start_date: s.start_date,
      end_date: s.end_date,
      is_current: true,
    });
    setFormOpen(true);
  };

  return (
    <div className="coord-page">
      <header className="coord-page-header">
        <div>
          <h1>Anys escolars</h1>
          <p>Gestiona el curs escolar i la promoció d&apos;alumnes.</p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={16} aria-hidden />
          Crear nou any escolar
        </button>
      </header>

      <section className="card">
        <h2>
          <Calendar size={18} aria-hidden /> Llista d&apos;anys
        </h2>
        {isLoading ? (
          <p>Carregant…</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Títol</th>
                <th>Inici</th>
                <th>Fi</th>
                <th>Estat</th>
                <th>Accions</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const b = yearBadge(y);
                return (
                  <tr key={y.id}>
                    <td>{y.title}</td>
                    <td>{y.start_date}</td>
                    <td>{y.end_date}</td>
                    <td>
                      <span className={`year-badge ${b.cls}`}>{b.label}</span>
                    </td>
                    <td>
                      {!y.is_current && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setCurrentMut.mutate(y.id)}
                        >
                          Marcar actual
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setSelectedYearId(y.id);
                          setPromoteOpen(false);
                        }}
                      >
                        Veure alumnes
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selectedYearId && (
        <section className="card">
          <h2>
            <GraduationCap size={18} aria-hidden /> Alumnes d&apos;aquest any
          </h2>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPromoteOpen(true);
                refetchPromote();
              }}
            >
              Promocionar alumnes al nou any
            </button>
            <Link to="/coordinator/advanced" className="btn-ghost">
              Estadístiques globals
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Codi</th>
                <th>Nom</th>
                <th>Escola</th>
                <th>Curs</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.participant_id}>
                  <td>{s.code}</td>
                  <td>{s.first_name}</td>
                  <td>{s.school_name ?? "—"}</td>
                  <td>{s.grade_label ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {promoteOpen && promotePreview && (
        <section className="card">
          <h2>Previsualització de promoció</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Alumne</th>
                <th>Nivell actual</th>
                <th>Nivell proposat</th>
                <th>Acció</th>
              </tr>
            </thead>
            <tbody>
              {promotePreview.preview.map((p) => (
                <tr key={p.participant_id}>
                  <td>
                    {p.first_name} ({p.code})
                  </td>
                  <td>{p.current_grade_label ?? "—"}</td>
                  <td>{p.proposed_grade_label ?? "—"}</td>
                  <td>{p.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={promoteMut.isPending}
            onClick={() => promoteMut.mutate()}
          >
            Aplicar promoció
          </button>
        </section>
      )}

      {formOpen && (
        <div className="modal-overlay" role="presentation" onClick={() => setFormOpen(false)}>
          <div
            className="modal-content"
            role="dialog"
            aria-labelledby="ay-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ay-form-title">Nou any escolar</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate(form);
              }}
            >
              <label htmlFor="ay-title">Títol</label>
              <input
                id="ay-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
              <label htmlFor="ay-start">Data inici</label>
              <input
                id="ay-start"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                required
              />
              <label htmlFor="ay-end">Data fi</label>
              <input
                id="ay-end"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                required
              />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.is_current}
                  onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                />
                Marcar com a any actual
              </label>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)}>
                  Cancel·lar
                </button>
                <button type="submit" className="btn-primary" disabled={createMut.isPending}>
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
