import base64
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch
import uuid

import pytest
from PIL import Image

from api.v1.ppt.endpoints.presentation import _apply_template_content_to_ui
from models.image_prompt import ImagePrompt
from models.sql.image_asset import ImageAsset
from models.sql.slide import SlideModel
from services.chat.memory_layer import PresentationChatMemoryLayer
from services.image_generation_service import (
    ImageGenerationService,
    _desired_image_size,
)
from utils.process_slides import (
    image_target_sizes_from_template,
    process_slide_and_fetch_assets,
)


def test_image_target_sizes_match_slots_with_identical_prompts():
    layout = {
        "components": [{
            "id": "hero",
            "elements": [
                {"type": "image", "name": "wide", "decorative": False,
                 "size": {"width": 400, "height": 200}},
                {"type": "image", "name": "tall", "decorative": False,
                 "size": {"width": 100, "height": 300}},
            ],
        }],
    }
    content = {"hero": {
        "wide": {"image_prompt": "same prompt"},
        "tall": {"image_prompt": "same prompt"},
    }}

    sizes = image_target_sizes_from_template(
        layout, content, _apply_template_content_to_ui
    )

    assert sizes[(('key', 'hero'), ('key', 'wide'))] == (400, 200)
    assert sizes[(('key', 'hero'), ('key', 'tall'))] == (100, 300)
    assert "image_url" not in content["hero"]["wide"]


def test_chat_hydration_matches_repeated_image_slots():
    layout = {"components": [{"id": "gallery", "elements": [{
        "type": "grid", "name": "photos", "children": [
            {"type": "image", "name": "photo", "decorative": False,
             "size": {"width": 300, "height": 150}}
        ],
    }]}]}
    content = {"gallery": {"photos": [
        {"image_prompt": "same"}, {"image_prompt": "same"},
    ]}}

    sizes = image_target_sizes_from_template(
        layout, content, PresentationChatMemoryLayer._apply_template_content_to_ui
    )

    assert sizes[(('key', 'gallery'), ('key', 'photos'), ('index', 0))] == (300, 150)
    assert sizes[(('key', 'gallery'), ('key', 'photos'), ('index', 1))] == (300, 150)


@pytest.mark.anyio
async def test_asset_generation_receives_target_size_and_missing_size_falls_back():
    service = AsyncMock()
    service.generate_image.side_effect = [
        "https://example.com/wide.png", "https://example.com/square.png"
    ]
    slide = SlideModel(
        presentation=uuid.uuid4(), layout_group="test", layout="test", index=0,
        content={"first": {"image_prompt": "wide"}, "second": {"image_prompt": "default"}},
    )
    sizes = {(('key', 'first'),): (400, 200)}

    await process_slide_and_fetch_assets(service, slide, image_target_sizes=sizes)

    requests = [call.args[0] for call in service.generate_image.await_args_list]
    assert [request.target_size for request in requests] == [(400, 200), None]


def test_desired_image_size_for_prompt_and_log():
    assert _desired_image_size(None) == "unspecified"
    assert _desired_image_size((500, 300)) == "500x300"
    assert _desired_image_size((1017.57, 997.22)) == "1018x997"
    assert ImagePrompt(prompt="default").target_size is None


@pytest.mark.anyio
async def test_service_passes_dimensions_to_nimi_channel_without_changing_ai_prompt(tmp_path):
    buffer = BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    service = ImageGenerationService(str(tmp_path), config={"IMAGE_PROVIDER": "nimi"})

    with patch("services.image_generation_service.request_async", new_callable=AsyncMock, return_value={"mimeType": "image/png", "data": encoded}) as request_mock:
        await service.generate_image(
            ImagePrompt(
                prompt="wide", theme_prompt="muted colors",
                target_width=400, target_height=200,
            )
        )
        assert request_mock.await_args.args == (
            "image",
            {"prompt": "wide, muted colors", "targetSize": "400x200"},
        )

        await service.generate_image(ImagePrompt(prompt="default", theme_prompt="muted colors"))
        assert request_mock.await_args.args == (
            "image",
            {"prompt": "default, muted colors"},
        )


@pytest.mark.anyio
async def test_stock_image_search_keeps_original_query(tmp_path):
    service = ImageGenerationService(str(tmp_path), config={"IMAGE_PROVIDER": "pexels", "PEXELS_API_KEY": "key"})
    service.get_image_from_pexels = AsyncMock(return_value="https://example.com/photo.png")

    await service.generate_image(
        ImagePrompt(
            prompt="mountain lake", theme_prompt="muted colors",
            target_width=400, target_height=200,
        )
    )

    assert service.get_image_from_pexels.await_args.args == ("mountain lake",)
    assert service.get_image_from_pexels.await_args.kwargs == {}


@pytest.mark.anyio
async def test_generated_image_is_not_resized_after_provider_returns(tmp_path):
    buffer = BytesIO()
    Image.new("RGB", (1024, 1024), "red").save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    service = ImageGenerationService(str(tmp_path), config={"IMAGE_PROVIDER": "nimi"})

    with patch("services.image_generation_service.request_async", new_callable=AsyncMock, return_value={"mimeType": "image/png", "data": encoded}):
        asset = await service.generate_image(
            ImagePrompt(prompt="banner", target_width=400, target_height=200)
        )

    assert isinstance(asset, ImageAsset)
    with Image.open(Path(asset.path)) as result:
        assert result.size == (1024, 1024)
