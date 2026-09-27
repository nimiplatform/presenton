"""Only App-owned settings. Model routes and credentials live in Nimi."""
import json
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException

SETTINGS = {
    "IMAGE_PROVIDER", "DISABLE_IMAGE_GENERATION", "PEXELS_API_KEY", "PIXABAY_API_KEY",
    "WEB_GROUNDING", "WEB_SEARCH_PROVIDER", "SEARXNG_BASE_URL", "TAVILY_API_KEY",
    "EXA_API_KEY", "BRAVE_SEARCH_API_KEY", "SERPER_API_KEY", "WEB_SEARCH_MAX_RESULTS",
    "PRESENTATION_GENERATION_MODE", "PARALLEL_IMAGE_GENERATION",
}
router = APIRouter(prefix="/api/v1/ppt/business-settings")


def load_settings():
    path = Path(os.environ["USER_CONFIG_PATH"])
    values = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    values = {key: value for key, value in values.items() if key in SETTINGS}
    values.setdefault("IMAGE_PROVIDER", "nimi")
    values.setdefault("WEB_SEARCH_PROVIDER", "searxng")
    for key, value in values.items():
        os.environ[key] = str(value).lower() if isinstance(value, bool) else str(value)
    return values


@router.get("")
async def read_settings():
    return load_settings()


@router.put("")
async def save_settings(values: dict):
    if set(values) - SETTINGS:
        raise HTTPException(400, "AI providers and credentials are configured in Nimi")
    if values.get("IMAGE_PROVIDER", "nimi") not in {"nimi", "pexels", "pixabay"}:
        raise HTTPException(400, "Select Nimi generation or an App-owned stock image service")
    if values.get("WEB_SEARCH_PROVIDER", "searxng") not in {"searxng", "tavily", "exa", "brave", "serper"}:
        raise HTTPException(400, "Select an external web search service")
    path = Path(os.environ["USER_CONFIG_PATH"])
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)
    for key in SETTINGS:
        os.environ.pop(key, None)
    return load_settings()
