import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  commitImport,
  getImportFormat,
  previewImport,
  validateImport,
} from "../../api/imports";
import { toast } from "../../stores/toastStore";

type Step = 1 | 2 | 3 | 4;

export default function DataImportPage() {
  const [step, setStep] = useState<Step>(1);
  const [jsonText, setJsonText] = useState("");
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: { section: string; field: string; message: string }[];
    warnings: string[];
  } | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [commitResult, setCommitResult] = useState<Record<string, unknown> | null>(null);

  const { data: format } = useQuery({ queryKey: ["import-format"], queryFn: getImportFormat });

  const parseJson = (): object | null => {
    try {
      return JSON.parse(jsonText) as object;
    } catch {
      toast.error("JSON invàlid", "Revisa la sintaxi del fitxer.");
      return null;
    }
  };

  const validateMut = useMutation({
    mutationFn: async () => {
      const data = parseJson();
      if (!data) throw new Error("invalid");
      return validateImport(data);
    },
    onSuccess: (res) => {
      setValidation(res);
      if (res.valid) setStep(3);
    },
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      const data = parseJson();
      if (!data) throw new Error("invalid");
      return previewImport(data);
    },
    onSuccess: (res) => {
      setPreview(res);
      if (!(res as { errors?: unknown[] }).errors?.length) setStep(3);
    },
  });

  const commitMut = useMutation({
    mutationFn: async () => {
      const data = parseJson();
      if (!data) throw new Error("invalid");
      return commitImport(data);
    },
    onSuccess: (res) => {
      setCommitResult(res);
      setStep(4);
      toast.success("Importació completada");
    },
    onError: () => toast.error("Error en la importació"),
  });

  const copyExample = () => {
    const ex = format?.example ?? {};
    navigator.clipboard.writeText(JSON.stringify(ex, null, 2));
    toast.success("Exemple copiat al portapapers");
  };

  const downloadPasswordsCsv = () => {
    const summary = commitResult?.summary as { teacher_passwords?: { email: string; password: string; full_name: string }[] };
    const rows = summary?.teacher_passwords ?? [];
    if (!rows.length) return;
    const csv = ["email,full_name,password", ...rows.map((r) => `${r.email},${r.full_name},${r.password}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "professors-contrasenyes.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="coord-page import-page">
      <header className="coord-page-header">
        <div>
          <h1>Importar dades</h1>
          <p>Importa alumnes, professors i relacions des d&apos;un fitxer JSON.</p>
        </div>
      </header>

      <nav className="import-steps" aria-label="Passos d'importació">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={step === n ? "import-step active" : "import-step"}>
            Pas {n}
          </span>
        ))}
      </nav>

      {step === 1 && (
        <section className="card">
          <h2>Format esperat del fitxer JSON</h2>
          <p>Pots copiar aquest exemple i adaptar-lo amb les teves dades.</p>
          <p className="text-muted text-sm">
            Tots els camps obligatoris han de ser únics (codis d&apos;alumne, emails de professors).
            Les escoles es creen automàticament si no existeixen.
          </p>
          <button type="button" className="btn-secondary mb-2" onClick={copyExample}>
            Copiar exemple
          </button>
          <pre className="import-json-preview" aria-label="Exemple JSON">
            {JSON.stringify(format?.example ?? {}, null, 2)}
          </pre>
          <label htmlFor="import-json">Enganxa el JSON o puja un fitxer</label>
          <textarea
            id="import-json"
            className="import-textarea"
            rows={12}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='{ "students": [...] }'
          />
          <input
            type="file"
            accept=".json,application/json"
            className="mt-2"
            aria-label="Pujar fitxer JSON"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setJsonText(String(reader.result ?? ""));
              reader.readAsText(file);
            }}
          />
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={!jsonText.trim()}
            onClick={() => setStep(2)}
          >
            Continuar
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="card">
          <h2>Validació</h2>
          <button
            type="button"
            className="btn-primary"
            disabled={validateMut.isPending}
            onClick={() => validateMut.mutate()}
          >
            Validar
          </button>
          {validation && (
            <>
              {validation.errors.length > 0 && (
                <ul className="import-errors" role="alert">
                  {validation.errors.map((err, i) => (
                    <li key={i}>
                      [{err.section}] {err.field}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
              {validation.warnings.map((w, i) => (
                <p key={i} className="import-warning">
                  {w}
                </p>
              ))}
              {validation.valid && (
                <button type="button" className="btn-primary mt-2" onClick={() => previewMut.mutate()}>
                  Previsualitzar
                </button>
              )}
            </>
          )}
        </section>
      )}

      {step === 3 && preview && (
        <section className="card">
          <h2>Previsualització</h2>
          <div className="import-preview-grid">
            <div className="import-block">
              <strong>Anys escolars:</strong>{" "}
              {(preview.academic_years as { new: number })?.new ?? 0} nous
            </div>
            <div className="import-block">
              <strong>Programes:</strong>{" "}
              {(preview.programs as { new: number; existing: number })?.new ?? 0} nous,{" "}
              {(preview.programs as { existing: number })?.existing ?? 0} existents
            </div>
            <div className="import-block">
              <strong>Escoles:</strong>{" "}
              {(preview.schools as { new: number })?.new ?? 0} noves
            </div>
            <div className="import-block">
              <strong>Professors:</strong>{" "}
              {(preview.teachers as { new: number })?.new ?? 0} nous
            </div>
            <div className="import-block">
              <strong>Alumnes:</strong>{" "}
              {(preview.students as { new: number })?.new ?? 0} nous
            </div>
            <div className="import-block">
              <strong>Relacions:</strong>{" "}
              {(preview.relationships as { new: number })?.new ?? 0} noves
            </div>
          </div>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={commitMut.isPending}
            onClick={() => commitMut.mutate()}
          >
            Importar tot
          </button>
        </section>
      )}

      {step === 4 && commitResult && (
        <section className="card">
          <h2>Importació completada</h2>
          <pre>{JSON.stringify(commitResult.summary ?? commitResult, null, 2)}</pre>
          <button type="button" className="btn-secondary mt-2" onClick={downloadPasswordsCsv}>
            Descarregar contrasenyes (CSV)
          </button>
        </section>
      )}
    </div>
  );
}
