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

class ImageGenerationService:
    def __init__(self, output_directory: str):
        self.output_directory = output_directory
        self.is_image_generation_disabled = is_image_generation_disabled()

    def is_stock_provider_selected(self):
        return is_pixels_selected() or is_pixabay_selected()

    async def generate_image(self, prompt: ImagePrompt) -> str | ImageAsset:
        if self.is_image_generation_disabled:
            return absolute_fastapi_asset_url("/static/images/placeholder.jpg")
        text = prompt.get_image_prompt(with_theme=not self.is_stock_provider_selected())
        if is_pixels_selected():
            return await self.get_image_from_pexels(text)
        if is_pixabay_selected():
            return await self.get_image_from_pixabay(text)
        try:
            result = await request_async("image", {"prompt": text})
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
        resolved_api_key = (api_key or get_pexels_api_key_env() or "").strip()

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
        resolved_api_key = (api_key or get_pixabay_api_key_env() or "").strip()

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
