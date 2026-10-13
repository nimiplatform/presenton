import asyncio
import sqlite3

import pytest

from services import nimi_memory
from services.icon_finder_service import IconFinderService


def test_bundled_icon_index_has_one_note_per_icon_and_reuses_vectors(monkeypatch, tmp_path):
    monkeypatch.setenv('APP_DATA_DIRECTORY', str(tmp_path))
    store = nimi_memory.PresentationMemory()
    monkeypatch.setattr('services.mem0_oss_memory.get_shared_mem0_client', lambda: store)
    calls = []

    def embed(inputs, *, purpose):
        assert purpose in {"retrieval-query", "retrieval-document"}
        calls.append(list(inputs))
        return {'spaceId': 'icon-test', 'vectors': [[1.0, 0.0] for _ in inputs]}

    monkeypatch.setattr(nimi_memory, 'embed', embed)
    try:
        first = asyncio.run(IconFinderService().search_icons('growth', k=20, weight='thin'))
        notes = store.get_all(user_id='icons', limit=10000)['results']
        assert len(notes) == 1512
        assert len({note['memory'].split('\n', 1)[0] for note in notes}) == 1512
        assert len(calls) == 96
        assert len(first) == len(set(first)) == 20
        # Equal test vectors can rank any catalog entry in the first 20.
        # The bundled book-open-user icon has only the bold name; its thin
        # asset is named book-user, so the existing missing-weight fallback
        # must remain valid rather than making this test randomly fail.
        assert all('/thin/' in url or url.endswith('/bold/book-open-user-bold.svg') for url in first)
        second = asyncio.run(IconFinderService().search_icons('growth', k=20, weight='bold'))
        assert len(second) == len(set(second)) == 20
        assert all('/bold/' in url for url in second)
        assert len(calls) == 97
        assert len(store.get_all(user_id='icons', limit=10000)['results']) == 1512
    finally:
        store.vectors.close()
        store.db.close()


def test_catalog_insert_rolls_back_and_initialization_can_retry(monkeypatch, tmp_path):
    monkeypatch.setenv('APP_DATA_DIRECTORY', str(tmp_path))
    store = nimi_memory.PresentationMemory()
    monkeypatch.setattr('services.mem0_oss_memory.get_shared_mem0_client', lambda: store)
    service = IconFinderService()
    try:
        store.db.execute("CREATE TRIGGER fail_catalog BEFORE INSERT ON notes WHEN (SELECT count(*) FROM notes WHERE scope='icons') = 1 BEGIN SELECT RAISE(ABORT, 'interrupted'); END")
        with pytest.raises(sqlite3.IntegrityError, match='interrupted'):
            service._search('growth', 1)
        assert store.get_all(user_id='icons')['results'] == []
        assert service._index is None
        store.db.execute('DROP TRIGGER fail_catalog')
        monkeypatch.setattr(nimi_memory, 'embed', lambda inputs, **_kwargs: {'spaceId': 'retry', 'vectors': [[1.0] for _ in inputs]})
        assert service._search('growth', 1)
        assert len(store.get_all(user_id='icons', limit=10000)['results']) == 1512
    finally:
        store.vectors.close()
        store.db.close()


def test_icon_search_reports_typed_nimi_configuration_failure(monkeypatch):
    from fastapi import HTTPException
    from api.v1.ppt.endpoints import icons
    from services.nimi_channel import NimiCallError
    async def unavailable(*args, **kwargs):
        raise NimiCallError({'reasonCode': 'ai-config-not-found', 'message': 'ai-config-not-found'})
    monkeypatch.setattr(icons.ICON_FINDER_SERVICE, 'search_icons', unavailable)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(icons.search_icons('book', 20, None, None))
    assert caught.value.status_code == 422
    assert caught.value.error_type == 'ai-config-not-found'
    assert 'Settings' in caught.value.detail
