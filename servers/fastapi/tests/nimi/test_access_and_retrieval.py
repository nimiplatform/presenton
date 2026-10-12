import asyncio
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient
from api.nimi_access import HostOnlyMiddleware


def test_business_api_rejects_missing_and_forged_keys(monkeypatch):
    monkeypatch.setenv('PRESENTON_HOST_KEY', 'a' * 64)
    async def endpoint(request):
        return JSONResponse({'business': True})
    app = Starlette(routes=[Route('/project', endpoint)])
    app.add_middleware(HostOnlyMiddleware)
    with TestClient(app) as client:
        assert client.get('/project').status_code == 401
        assert client.get('/project', headers={'X-Presenton-Host': 'b' * 64}).status_code == 401
        assert client.get('/project', headers={'X-Presenton-Host': 'a' * 64}).json() == {'business': True}


def test_retrieval_preserves_notes_and_isolates_embedding_spaces(monkeypatch, tmp_path):
    from services import nimi_memory
    monkeypatch.setenv('APP_DATA_DIRECTORY', str(tmp_path))
    space = ['space-a']
    def embedding(inputs, *, purpose):
        assert purpose in {"retrieval-query", "retrieval-document"}
        return {'spaceId': space[0], 'vectors': [[1.0, 0.0] for text in inputs]}
    monkeypatch.setattr(nimi_memory, 'embed', embedding)
    store = nimi_memory.PresentationMemory()
    store.add([{'content': '中文 note'}], user_id='deck-a')
    store.add([{'content': 'private other deck'}], user_id='deck-b')
    assert store.search('中文', user_id='deck-a')['results'][0]['memory'] == '中文 note'
    space[0] = 'space-b'
    assert store.search('中文', user_id='deck-a')['results'][0]['memory'] == '中文 note'
    assert len(store.vectors.get_collections().collections) == 2
    assert len(store.get_all(user_id='deck-a')['results']) == 1
    store.vectors.close(); store.db.close()


def test_reopening_committed_outline_does_not_dispatch_ai(monkeypatch):
    import json
    import uuid
    from types import SimpleNamespace
    from api.v1.ppt.endpoints import outlines
    value = {'id': str(uuid.uuid4()), 'outlines': {'slides': [{'content': '## 中文\n\nSaved outline'}]}}
    presentation = SimpleNamespace(outlines=value['outlines'], model_dump=lambda **kwargs: value)
    async def get(*args): return presentation
    async def connected(): return False
    async def must_not_generate(*args, **kwargs):
        raise AssertionError('reopening must restore the committed result')
    monkeypatch.setattr(outlines, 'generate_ppt_outline', must_not_generate)
    async def run():
        response = await outlines.stream_outlines(uuid.UUID(value['id']), SimpleNamespace(is_disconnected=connected), SimpleNamespace(get=get))
        return [frame async for frame in response.body_iterator]
    frames = asyncio.run(run())
    assert len(frames) == 1
    assert json.loads(frames[0].split('data: ', 1)[1])['presentation'] == value
