import argparse
import json
import re
from pathlib import Path

import httpx


DEFAULT_API_BASE = "http://127.0.0.1:8010/api/v1"
DEFAULT_BATTERY_DOC = Path(__file__).resolve().parents[3] / "session-logger-bateria-prueba.md"


def extract_payloads_from_markdown(md_path: Path) -> list[dict]:
    content = md_path.read_text(encoding="utf-8")
    match = re.search(r"```json\s*(\[[\s\S]*?\])\s*```", content)
    if not match:
        raise ValueError(f"No se encontro un bloque JSON valido en {md_path}")
    return json.loads(match.group(1))


def post_sessions(payloads: list[dict], api_base: str, timeout_s: float, dry_run: bool) -> tuple[int, int]:
    ok = 0
    failed = 0

    if dry_run:
        print(f"[DRY RUN] Formularios detectados: {len(payloads)}")
        for idx, payload in enumerate(payloads, start=1):
            participant_id = payload.get("observations", [{}])[0].get("participant_id", "-")
            print(
                f"[DRY RUN] #{idx:02d} program={payload.get('program_id')} "
                f"date={payload.get('session_date')} participant={participant_id}"
            )
        return len(payloads), 0

    with httpx.Client(timeout=timeout_s) as client:
        for idx, payload in enumerate(payloads, start=1):
            response = client.post(f"{api_base}/sessions", json=payload)
            if response.status_code == 200:
                data = response.json()
                print(f"[OK] #{idx:02d} session_id={data.get('id', '-')}")
                ok += 1
            else:
                print(f"[ERROR] #{idx:02d} status={response.status_code} body={response.text}")
                failed += 1

    return ok, failed


def main() -> int:
    parser = argparse.ArgumentParser(description="Carga en lote la bateria de Session Logger.")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="Base URL API, ej: http://127.0.0.1:8010/api/v1")
    parser.add_argument(
        "--battery-doc",
        default=str(DEFAULT_BATTERY_DOC),
        help="Ruta al markdown con bloque JSON de formularios.",
    )
    parser.add_argument("--timeout", type=float, default=20.0, help="Timeout por request en segundos.")
    parser.add_argument("--dry-run", action="store_true", help="No inserta nada; solo valida y muestra resumen.")
    args = parser.parse_args()

    md_path = Path(args.battery_doc)
    if not md_path.exists():
        raise FileNotFoundError(f"No existe el archivo de bateria: {md_path}")

    payloads = extract_payloads_from_markdown(md_path)
    ok, failed = post_sessions(payloads, args.api_base, args.timeout, args.dry_run)

    print("\nResumen:")
    print(f"- Total: {len(payloads)}")
    print(f"- Insertados OK: {ok}")
    print(f"- Con error: {failed}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
