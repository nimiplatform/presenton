import base64
from io import BytesIO
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from api.v1.ppt.endpoints.images import IMAGES_ROUTER
from services.image_generation_service import ImageGenerationService


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(IMAGES_ROUTER)
    return TestClient(app)


@pytest.mark.parametrize(("provider", "fields"), [
    ("pexels", {"PEXELS_API_KEY": "draft-key"}),
    ("pixabay", {"PIXABAY_API_KEY": "draft-key"}),
])
def test_uses_unsaved_stock_provider_without_changing_runtime_or_saving_assets(
    client, monkeypatch, provider, fields,
):
    monkeypatch.setenv("IMAGE_PROVIDER", "pixabay")
    monkeypatch.setenv("DISABLE_IMAGE_GENERATION", "true")
    environment = dict(os.environ)
    directories = []

    async def search(service, prompt, *_args, **_kwargs):
        assert service.config["IMAGE_PROVIDER"] == provider
        assert all(service.config[key] == value for key, value in fields.items())
        assert dict(os.environ) == environment
        directories.append(service.output_directory)
        return "https://example.com/stock.jpg"

    method = "get_image_from_pexels" if provider == "pexels" else "get_image_from_pixabay"
    monkeypatch.setattr(ImageGenerationService, method, search)
    response = client.post("/images/test", json={"IMAGE_PROVIDER": provider, **fields})

    assert response.status_code == 200, response.text
    assert response.json()["image_url"] == "https://example.com/stock.jpg"
    assert all(not Path(directory).exists() for directory in directories)
    assert dict(os.environ) == environment


def test_nimi_image_test_returns_data_url_and_cleans_temporary_files(client, monkeypatch):
    buffer = BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    directories = []
    original_init = ImageGenerationService.__init__

    def init(service, directory, **kwargs):
        directories.append(directory)
        original_init(service, directory, **kwargs)

    monkeypatch.setattr(ImageGenerationService, "__init__", init)
    with patch("services.image_generation_service.request_async", new_callable=AsyncMock, return_value={"mimeType": "image/png", "data": encoded}):
        response = client.post("/images/test", json={"IMAGE_PROVIDER": "nimi"})

    assert response.status_code == 200, response.text
    preview = response.json()["image_url"]
    assert base64.b64decode(preview.split(",", 1)[1]).startswith(b"\x89PNG")
    assert all(not Path(directory).exists() for directory in directories)


@pytest.mark.parametrize("config", [
    {},
    {"IMAGE_PROVIDER": "unsupported"},
    {"IMAGE_PROVIDER": "gpt-image-2"},
    {"IMAGE_PROVIDER": "gpt-image-2.5-flare"},
    {"IMAGE_PROVIDER": "comfyui"},
    {"IMAGE_PROVIDER": "pexels"},
    {"IMAGE_PROVIDER": "pixabay", "PIXABAY_API_KEY": " "},
])
def test_incomplete_or_retired_configuration_does_not_call_provider(client, config):
    with patch.object(ImageGenerationService, "generate_image", new_callable=AsyncMock) as generate:
        response = client.post("/images/test", json=config)
    assert response.status_code in {400, 422}
    generate.assert_not_awaited()


@pytest.mark.parametrize("output", ["/static/images/placeholder.jpg", "https://example.com/static/images/placeholder.jpg", ""])
def test_placeholder_is_not_a_success(client, output):
    with patch.object(ImageGenerationService, "generate_image", new_callable=AsyncMock, return_value=output):
        response = client.post("/images/test", json={"IMAGE_PROVIDER": "nimi"})
    assert response.status_code == 502


def test_provider_error_is_reported(client):
    with patch.object(ImageGenerationService, "generate_image", new_callable=AsyncMock, side_effect=HTTPException(429, "Provider quota exhausted")):
        response = client.post("/images/test", json={"IMAGE_PROVIDER": "nimi"})
    assert response.status_code == 429
    assert response.json()["detail"] == "Provider quota exhausted"


def test_timeout_is_reported_and_temporary_files_are_removed(client, monkeypatch):
    directories = []

    async def time_out(coroutine, timeout):
        assert timeout == 180
        coroutine.close()
        raise TimeoutError()

    original_init = ImageGenerationService.__init__

    def init(service, directory, **kwargs):
        directories.append(directory)
        original_init(service, directory, **kwargs)

    monkeypatch.setattr(ImageGenerationService, "__init__", init)
    monkeypatch.setattr("api.v1.ppt.endpoints.images.asyncio.wait_for", time_out)
    response = client.post("/images/test", json={"IMAGE_PROVIDER": "nimi"})
    assert response.status_code == 504
    assert all(not Path(directory).exists() for directory in directories)


def test_redacted_key_uses_configured_secret(client, monkeypatch):
    monkeypatch.setenv("PEXELS_API_KEY", "saved-secret")
    observed = []

    async def search(service, prompt, **kwargs):
        assert service.config["PEXELS_API_KEY"] == "saved-secret"
        observed.append(prompt)
        return "https://example.com/stock.jpg"

    monkeypatch.setattr(ImageGenerationService, "get_image_from_pexels", search)
    response = client.post("/images/test", json={"IMAGE_PROVIDER": "pexels", "PEXELS_API_KEY": "__configured__"})
    assert response.status_code == 200
    assert observed[0].startswith("__presenton_auth_check_")
    assert len(observed) == 2
