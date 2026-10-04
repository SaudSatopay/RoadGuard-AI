"""
Test setup: isolate runtime state in a temporary folder and never call Claude.

Environment variables are set before any backend module is imported, because
`config` reads them at import time.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
_TMP = Path(tempfile.mkdtemp(prefix="roadguard-test-"))
os.environ["ROADGUARD_DATA_DIR"] = str(_TMP / "data")
os.environ["ROADGUARD_UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["ANTHROPIC_API_KEY"] = ""
# Tests must not depend on (or fight a training job for) the GPU.
os.environ.setdefault("ROADGUARD_DEVICE", "cpu")
sys.path.insert(0, str(BACKEND))


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def seed_reports():
    import json

    import config
    from store import materialize_seed

    seed = json.loads(config.SEED_STORE_FILE.read_text(encoding="utf-8"))
    return materialize_seed(seed)
