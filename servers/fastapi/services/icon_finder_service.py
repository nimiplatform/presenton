import asyncio
import json
import os
import threading
from utils.asset_directory_utils import absolute_fastapi_asset_url
from utils.icon_weights import ALLOWED_ICON_WEIGHTS, DEFAULT_ICON_WEIGHT, normalize_icon_weight
from utils.path_helpers import get_resource_path

class IconFinderService:
    def __init__(self):
        self._index = None
        self._lock = threading.Lock()

    def _search(self, query, k):
        with self._lock:
            if self._index is None:
                from services.mem0_oss_memory import get_shared_mem0_client
                index = get_shared_mem0_client()
                if not index.get_all(user_id="icons", limit=1)["results"]:
                    with open(get_resource_path("assets/icons.json"), encoding="utf-8") as source:
                        icons = json.load(source)["icons"]
                    notes = {}
                    for icon in icons:
                        name = self._base_icon_name(icon["name"])
                        notes.setdefault(name, name + "\n" + icon.get("tags", ""))
                    index.add_notes(notes.values(), user_id="icons")
                self._index = index
            return self._index.search(query, user_id="icons", limit=k)["results"]

    async def search_icons(self, query: str, k: int = 1, weight: str | None = None):
        result = await asyncio.to_thread(self._search, query, k)
        return [self._icon_url_for_weight(item["memory"].split("\n", 1)[0], normalize_icon_weight(weight)) for item in result]

    @staticmethod
    def _base_icon_name(icon_name: str) -> str:
        name = icon_name.split("||")[0]
        for weight in ALLOWED_ICON_WEIGHTS:
            suffix = f"-{weight}"
            if name.endswith(suffix):
                return name[: -len(suffix)]
        return name

    @staticmethod
    def _icon_filename_for_weight(base_name: str, weight: str) -> str:
        if weight == "regular":
            return f"{base_name}.svg"
        return f"{base_name}-{weight}.svg"

    def _icon_url_for_weight(self, icon_name: str, weight: str) -> str:
        normalized_weight = normalize_icon_weight(weight)
        base_name = self._base_icon_name(icon_name)
        filename = self._icon_filename_for_weight(base_name, normalized_weight)
        relative_path = f"static/icons/{normalized_weight}/{filename}"
        if not os.path.isfile(get_resource_path(relative_path)):
            normalized_weight = DEFAULT_ICON_WEIGHT
            filename = self._icon_filename_for_weight(base_name, normalized_weight)

        return absolute_fastapi_asset_url(
            f"/static/icons/{normalized_weight}/{filename}"
        )

ICON_FINDER_SERVICE = IconFinderService()
