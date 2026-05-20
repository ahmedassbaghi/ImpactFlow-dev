import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLandingContent, updateLandingContent } from "../../api/organization";
import { toast } from "../../stores/toastStore";

const DEFAULT_SECTIONS = JSON.stringify(
  [
    { type: "hero", title: "De l'activitat a l'evidència", text: "Narinan acompanya infants en situació de vulnerabilitat." },
    { type: "image", src: "/images/narinan/activity-1.svg", alt: "Activitat educativa" },
  ],
  null,
  2
);

export default function LandingEditorPage() {
  const qc = useQueryClient();
  const [json, setJson] = useState(DEFAULT_SECTIONS);

  const { data } = useQuery({ queryKey: ["landing"], queryFn: () => getLandingContent() });

  useEffect(() => {
    if (data?.sections?.length) {
      setJson(JSON.stringify(data.sections, null, 2));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateLandingContent(json),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing"] });
      toast.success("Pàgina inicial actualitzada");
    },
    onError: () => toast.error("JSON no vàlid", "Revisa el format de les seccions."),
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pàgina inicial (web)</h1>
          <p className="page-subtitle">Seccions, text i imatges en format JSON</p>
        </div>
      </div>
      <div className="card" style={{ padding: "1rem" }}>
        <label className="form-label" htmlFor="landing-json">Contingut (JSON)</label>
        <textarea
          id="landing-json"
          className="form-textarea"
          rows={16}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.85rem" }}
        />
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: "1rem" }}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Desant…" : "Desar pàgina"}
        </button>
      </div>
    </div>
  );
}
