from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ImageProviderTestConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    IMAGE_PROVIDER: Literal["nimi", "pexels", "pixabay"]
    PEXELS_API_KEY: str = Field(default="", repr=False)
    PIXABAY_API_KEY: str = Field(default="", repr=False)
