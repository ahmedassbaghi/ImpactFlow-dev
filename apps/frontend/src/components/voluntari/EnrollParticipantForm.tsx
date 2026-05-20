import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { enrollParticipant, listParticipants } from "../../api/participants";
import { listPrograms } from "../../api/programs";
import { listSchools } from "../../api/schools";
import { toast } from "../../stores/toastStore";
import { PremiumSelect } from "./PremiumSelect";

type Props = {
  defaultProgramId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function EnrollParticipantForm({
  defaultProgramId = "",
  onSuccess,
  onCancel,
}: Props) {
  const qc = useQueryClient();
  const [programId, setProgramId] = useState(defaultProgramId);
  const [schoolId, setSchoolId] = useState("");
  const [participantId, setParticipantId] = useState("");

  const { data: programs = [] } = useQuery({ queryKey: ["programs"], queryFn: () => listPrograms(true) });
  const { data: schools = [] } = useQuery({ queryKey: ["schools"], queryFn: listSchools });

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["participants", "enroll", programId, schoolId],
    queryFn: () =>
      listParticipants({
        notInProgram: programId,
        schoolId: schoolId || undefined,
      }),
    enabled: !!programId,
  });

  const enrollMutation = useMutation({
    mutationFn: () => enrollParticipant(programId, participantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      toast.success("Inscrit al programa", "L'alumne ja apareix a la teva llista.");
      setParticipantId("");
      onSuccess?.();
    },
    onError: () => {
      toast.error("No s'ha pogut inscriure", "Comprova la connexió i torna-ho a provar.");
    },
  });

  const canEnroll = !!programId && !!participantId;

  return (
    <form
      className="vol-add-participant-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (canEnroll) enrollMutation.mutate();
      }}
    >
      <PremiumSelect
        label="Programa"
        value={programId}
        onChange={(id) => {
          setProgramId(id);
          setParticipantId("");
        }}
        options={[
          { value: "", label: "Selecciona programa…" },
          ...programs.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />

      <PremiumSelect
        label="Escola (filtre)"
        value={schoolId}
        onChange={(id) => {
          setSchoolId(id);
          setParticipantId("");
        }}
        options={[
          { value: "", label: "Totes les escoles" },
          ...schools.map((s) => ({ value: s.id, label: `${s.abbreviation} — ${s.name}` })),
        ]}
      />

      <PremiumSelect
        label="Alumne"
        value={participantId}
        onChange={setParticipantId}
        disabled={!programId || isLoading}
        options={[
          {
            value: "",
            label: isLoading
              ? "Carregant…"
              : candidates.length === 0
                ? "Cap alumne disponible"
                : "Selecciona alumne…",
          },
          ...candidates.map((p) => ({
            value: p.id,
            label: `${p.first_name} · ${p.code}${p.school_abbreviation ? ` (${p.school_abbreviation})` : ""}`,
          })),
        ]}
      />

      <p className="vol-add-hint">
        Es mostren alumnes de l'organització que encara no estan inscrits en el programa seleccionat.
      </p>

      <div className="vol-add-actions">
        {onCancel && (
          <button type="button" className="vol-btn-secondary" onClick={onCancel}>
            Cancel·lar
          </button>
        )}
        <button
          type="submit"
          className="vol-cta-primary"
          disabled={!canEnroll || enrollMutation.isPending}
        >
          {enrollMutation.isPending ? "Inscrivint…" : "Inscriure al programa"}
        </button>
      </div>
    </form>
  );
}
