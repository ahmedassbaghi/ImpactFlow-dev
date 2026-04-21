import sys
import os

import uvicorn


def main() -> None:
    # Ensure local project module resolution has priority.
    sys.path.insert(0, ".")
    from app.main import app

    port = int(os.getenv("IMPACTFLOW_BACKEND_PORT", "8012"))
    uvicorn.run(app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
