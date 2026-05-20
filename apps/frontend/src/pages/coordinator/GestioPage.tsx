import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrgSettings, updateOrgSettings } from "../../api/organization";
import { previewNextCode } from "../../api/participants";
import { listSchools } from "../../api/schools";
import { toast } from "../../stores/toastStore";

const DEFAULT_PATTERN = "{abbr}-{year}-{seq:03}";

export default function GestioPage() {
  const qc = useQueryClient();
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [previewSchoolId, setPreviewSchoolId] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["org-settings"],
    queryFn: getOrgSettings,
  });

  const { data: schools = [] } = useQuery({ queryKey: ["schools"], queryFn: listSchools });

  const { data: previewCode } = useQuery({
    queryKey: ["next-code", previewSchoolId],
    queryFn: () => previewNextCode(previewSchoolId),
    enabled: !!previewSchoolId,
  });

  useEffect(() => {
    if (settings?.participant_code_pattern) setPattern(settings.participant_code_pattern);
  }, [settings]);

  const save = useMutation({
    mutationFn: () => updateOrgSettings(pattern),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-settings"] });
      toast.success("Format desat");
    },
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestió</h1>
          <p className="page-subtitle">Format dels codis identificadors dels alumnes (FRAN)</p>
        </div>
      </div>

      <div className="card" style={{ padding: "1.25rem", maxWidth: 560 }}>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Patró de codi</h2>
        <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "1rem" }}>
          Variables: <code>{"{abbr}"}</code> abreviatura escola, <code>{"{year}"}</code> any, <code>{"{seq:03}"}</code> número seqüencial.
        </p>
        <label className="form-label" htmlFor="code-pattern">Patró</label>
        <input
          id="code-pattern"
          className="form-input"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={DEFAULT_PATTERN}
        />

        <label className="form-label" style={{ marginTop: "1rem" }} htmlFor="preview-school">
          Vista prèvia (escola)
        </label>
        <select
          id="preview-school"
          className="form-select"
          value={previewSchoolId}
          onChange={(e) => setPreviewSchoolId(e.target.value)}
        >
          <option value="">Selecciona escola…</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.abbreviation} — {s.name}</option>
          ))}
        </select>

        {previewCode && (
          <p style={{ marginTop: "0.75rem", fontFamily: "monospace", fontWeight: 700 }}>
            Següent codi: {previewCode}
          </p>
        )}

        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: "1.25rem" }}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Desant…" : "Desar format"}
        </button>
      </div>
    </div>
  );
}
