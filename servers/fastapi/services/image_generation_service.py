import base64
import os
import uuid
import aiohttp
from fastapi import HTTPException
from models.image_prompt import ImagePrompt
from models.sql.image_asset import ImageAsset
from utils.get_env import get_pexels_api_key_env, get_pixabay_api_key_env
from utils.asset_directory_utils import absolute_fastapi_asset_url
from utils.image_provider import is_image_generation_disabled, is_pixels_selected, is_pixabay_selected
from services.nimi_channel import request_async


def _desired_image_size(target_size: tuple[float, float] | None) -> str:
    if not target_size:
        return "unspecified"
    width, height = target_size
    return f"{max(1, round(width))}x{max(1, round(height))}"


class ImageGenerationService:
    def __init__(self, output_directory: str, config: dict[str, str] | None = None):
        self.output_directory = output_directory
        self.config = dict(config) if config is not None else None
        self.is_image_generation_disabled = (
            False if self.config is not None else is_image_generation_disabled()
        )

    def _setting(self, key: str, getter):
        return self.config.get(key) if self.config is not None else getter()

    def _selected_stock_provider(self) -> str | None:
        if self.config is not None:
            provider = self.config.get("IMAGE_PROVIDER")
            return provider if provider in {"pexels", "pixabay"} else None
        if is_pixels_selected():
            return "pexels"
        if is_pixabay_selected():
            return "pixabay"
        return None

    def is_stock_provider_selected(self) -> bool:
        return self._selected_stock_provider() is not None

    async def generate_image(self, prompt: ImagePrompt) -> str | ImageAsset:
        if self.is_image_generation_disabled:
            return absolute_fastapi_asset_url("/static/images/placeholder.jpg")
        stock = self._selected_stock_provider()
        text = prompt.get_image_prompt(with_theme=stock is None)
        if stock == "pexels":
            return await self.get_image_from_pexels(text)
        if stock == "pixabay":
            return await self.get_image_from_pixabay(text)
        try:
            payload = {"prompt": text}
            if prompt.target_size is not None:
                payload["targetSize"] = _desired_image_size(prompt.target_size)
            result = await request_async("image", payload)
        except RuntimeError as error:
            raise HTTPException(503, str(error)) from error
        suffix = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}[result["mimeType"]]
        os.makedirs(self.output_directory, exist_ok=True)
        path = os.path.join(self.output_directory, str(uuid.uuid4()) + suffix)
        with open(path, "xb") as output:
            output.write(base64.b64decode(result["data"], validate=True))
        return ImageAsset(path=path, is_uploaded=False, extras={"prompt": prompt.prompt, "theme_prompt": prompt.theme_prompt})

    async def get_image_from_pexels(
        self, prompt: str, api_key: str | None = None, limit: int = 1
    ) -> str | list[str]:
        per_page = max(1, min(limit, 80))
        resolved_api_key = (api_key or self._setting("PEXELS_API_KEY", get_pexels_api_key_env) or "").strip()

        async with aiohttp.ClientSession(trust_env=True) as session:
            response = await session.get(
                "https://api.pexels.com/v1/search",
                params={"query": prompt, "per_page": per_page},
                headers={"Authorization": resolved_api_key} if resolved_api_key else {},
                timeout=aiohttp.ClientTimeout(total=20),
            )

            if response.status in {401, 403}:
                raise HTTPException(status_code=401, detail="Invalid Pexels API key")
            if response.status != 200:
                error_text = await response.text()
                raise HTTPException(
                    status_code=502,
                    detail=f"Pexels request failed: {error_text}",
                )

            data = await response.json()
            photos = data.get("photos", [])
            image_urls = [
                photo.get("src", {}).get("large")
                for photo in photos
                if photo.get("src", {}).get("large")
            ]

            if limit <= 1:
                return image_urls[0] if image_urls else ""
            return image_urls[:limit]

    async def get_image_from_pixabay(
        self, prompt: str, api_key: str | None = None, limit: int = 1
    ) -> str | list[str]:
        per_page = max(3, min(limit, 200))
        resolved_api_key = (api_key or self._setting("PIXABAY_API_KEY", get_pixabay_api_key_env) or "").strip()

        async with aiohttp.ClientSession(trust_env=True) as session:
            response = await session.get(
                "https://pixabay.com/api/",
                params={
                    "key": resolved_api_key,
                    "q": prompt[:99],
                    "image_type": "photo",
                    "per_page": per_page,
                },
                timeout=aiohttp.ClientTimeout(total=20),
            )

            if response.status in {401, 403}:
                error_text = await response.text()
                raise HTTPException(
                    status_code=401,
                    detail=f"Invalid Pixabay API key: {error_text}",
                )
            if response.status == 400:
                error_text = await response.text()
                if "api key" in error_text.lower():
                    raise HTTPException(
                        status_code=401,
                        detail=f"Invalid Pixabay API key: {error_text}",
                    )
                raise HTTPException(
                    status_code=400,
                    detail=f"Pixabay request invalid: {error_text}",
                )
            if response.status != 200:
                error_text = await response.text()
                raise HTTPException(
                    status_code=502,
                    detail=f"Pixabay request failed: {error_text}",
                )

            data = await response.json()
            hits = data.get("hits", [])
            image_urls = [
                hit.get("largeImageURL") for hit in hits if hit.get("largeImageURL")
            ]

            if limit <= 1:
                return image_urls[0] if image_urls else ""
            return image_urls[:limit]
