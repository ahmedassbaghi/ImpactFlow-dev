import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createParticipant, previewNextCode } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { useLocalDraft } from "../../hooks/useLocalDraft";
import { toast } from "../../stores/toastStore";
import { PremiumSelect } from "./PremiumSelect";

const defaultDraft = {
  program_id: "",
  school_id: "",
  code: "",
  first_name: "",
  enrollment_date: new Date().toISOString().slice(0, 10),
  consent_given: true,
};

type Props = {
  onSuccess?: () => void;
  onCancel?: () => void;
  defaultProgramId?: string;
  requireProgram?: boolean;
};

export function AddParticipantForm({
  onSuccess,
  onCancel,
  defaultProgramId = "",
  requireProgram = false,
}: Props) {
  const qc = useQueryClient();
  const [_raw, setDraft, clearDraft] = useLocalDraft("if_add_participant_v1", defaultDraft);
  const draft = { ...defaultDraft, ..._raw, program_id: _raw.program_id || defaultProgramId };

  const { data: schools = [] } = useQuery({ queryKey: ["schools"], queryFn: listSchools });
  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => listPrograms(true) });

  useEffect(() => {
    if (!draft.school_id && schools.length === 1) {
      setDraft((p) => ({ ...p, school_id: schools[0].id }));
    }
  }, [schools.length]); // eslint-disable-line

  useEffect(() => {
    if (!draft.program_id && defaultProgramId) {
      setDraft((p) => ({ ...p, program_id: defaultProgramId }));
    }
  }, [defaultProgramId]); // eslint-disable-line

  const loadCode = async (schoolId: string) => {
    if (!schoolId) return;
    try {
      const code = await previewNextCode(schoolId);
      setDraft((p) => ({ ...p, code }));
    } catch {
      /* ignore */
    }
  };

  const createMutation = useMutation({
    mutationFn: createParticipant,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      toast.success("Alumne creat", `${p.first_name} (${p.code}) s'ha donat d'alta.`);
      clearDraft();
      onSuccess?.();
    },
    onError: () => {
      toast.error("No s'ha pogut crear l'alumne", "Comprova el codi o la connexió.");
    },
  });

  const valid =
    !!draft.school_id &&
    !!draft.first_name.trim() &&
    (!requireProgram || !!draft.program_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    createMutation.mutate({
      school_id: draft.school_id,
      program_id: draft.program_id || undefined,
      code: draft.code.trim() || undefined,
      first_name: draft.first_name.trim(),
      enrollment_date: draft.enrollment_date,
      consent_given: draft.consent_given,
      is_control_group: false,
    });
  };

  return (
    <form className="vol-add-participant-form" onSubmit={handleSubmit}>
      <PremiumSelect
        label="Escola"
        value={draft.school_id}
        onChange={(id) => {
          setDraft((p) => ({ ...p, school_id: id }));
          loadCode(id);
        }}
        options={[
          { value: "", label: "Selecciona escola…" },
          ...schools.map((s) => ({ value: s.id, label: `${s.abbreviation} — ${s.name}` })),
        ]}
        placeholder="Selecciona escola…"
      />

      <PremiumSelect
        label={requireProgram ? "Programa" : "Programa (recomanat)"}
        value={draft.program_id}
        onChange={(id) => setDraft((p) => ({ ...p, program_id: id }))}
        options={[
          { value: "", label: requireProgram ? "Selecciona programa…" : "Sense programa inicial" },
          ...programs.map((p) => ({ value: p.id, label: p.name })),
        ]}
        placeholder="Selecciona programa…"
      />

      <label className="vol-add-field">
        <span className="premium-select-label">Nom de l'alumne</span>
        <input
          className="vol-filter-input"
          type="text"
          required
          autoComplete="name"
          placeholder="Nom i cognoms"
          value={draft.first_name}
          onChange={(e) => setDraft((p) => ({ ...p, first_name: e.target.value }))}
        />
      </label>

      <label className="vol-add-field">
        <span className="premium-select-label">Codi (opcional)</span>
        <input
          className="vol-filter-input"
          type="text"
          placeholder="Es genera automàticament"
          value={draft.code}
          onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))}
        />
      </label>

      <label className="vol-add-field">
        <span className="premium-select-label">Data d'alta</span>
        <input
          className="vol-filter-input"
          type="date"
          required
          value={draft.enrollment_date}
          onChange={(e) => setDraft((p) => ({ ...p, enrollment_date: e.target.value }))}
        />
      </label>

      <label className="vol-add-check">
        <input
          type="checkbox"
          checked={draft.consent_given}
          onChange={(e) => setDraft((p) => ({ ...p, consent_given: e.target.checked }))}
        />
        <span>Consentiment informat signat</span>
      </label>

      <div className="vol-add-actions">
        {onCancel && (
          <button type="button" className="vol-btn-secondary" onClick={onCancel}>
            Cancel·lar
          </button>
        )}
        <button
          type="submit"
          className="vol-cta-primary"
          disabled={!valid || createMutation.isPending}
        >
          {createMutation.isPending ? "Creant…" : "Donar d'alta alumne"}
        </button>
      </div>
    </form>
  );
}
