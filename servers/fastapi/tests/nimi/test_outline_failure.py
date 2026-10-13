import asyncio
import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException
from models.sql.presentation import PresentationModel, PresentationVersion
from models.presentation_with_slides import PresentationWithSlides
from api.v1.ppt.endpoints import outlines


def test_terminal_failure_is_saved_and_reopening_never_dispatches_ai(monkeypatch, tmp_path):
    presentation = PresentationModel(id=uuid.uuid4(), version=PresentationVersion.V2_STANDARD,
        content='蓝鸟743', n_slides=5, language='Chinese', include_title_slide=False)
    calls = []
    async def generate(*args, **kwargs):
        calls.append(True)
        error = HTTPException(422, 'Output validation failed')
        error.error_type = 'ai-output-invalid'
        error.diagnostic_stage = 'text_json_schema_min_length'
        yield error
    monkeypatch.setattr(outlines, 'generate_ppt_outline', generate)
    monkeypatch.setattr(outlines.TEMP_FILE_SERVICE, 'create_temp_dir', lambda: str(tmp_path))
    monkeypatch.setattr(outlines.MEM0_PRESENTATION_MEMORY_SERVICE, 'store_generation_context', AsyncMock())
    session = SimpleNamespace(get=AsyncMock(return_value=presentation), add=lambda value: None,
        commit=AsyncMock(), rollback=AsyncMock())
    request = SimpleNamespace(is_disconnected=AsyncMock(return_value=False))
    async def run():
        first = await outlines.stream_outlines(presentation.id, request, session)
        first_frames = [json.loads(frame.split('data: ', 1)[1]) async for frame in first.body_iterator]
        reopened = await outlines.stream_outlines(presentation.id, request, session)
        reopened_frames = [json.loads(frame.split('data: ', 1)[1]) async for frame in reopened.body_iterator]
        return first_frames, reopened_frames
    first, reopened = asyncio.run(run())
    assert len(calls) == 1
    assert session.commit.await_count == 1
    assert presentation.outline_error['error_type'] == 'ai-output-invalid'
    assert presentation.outline_error['diagnostic_stage'] == 'text_json_schema_min_length'
    assert first[-1] == reopened[0]
    assert reopened[0]['retryable'] is False
    assert presentation.outlines is None


def test_presentation_response_preserves_all_outline_settings():
    from datetime import datetime, timezone
    value = dict(id=uuid.uuid4(), content='中文', n_slides=5, language='Chinese', slides=[],
        created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
        instructions='保留事实', file_paths=['文档.txt'], include_title_slide=False,
        include_table_of_contents=True, web_search=True,
        outline_error={'detail': 'Output failed', 'retryable': False},
        outlines={'slides': [{'content': '## 计划'}]})
    response = PresentationWithSlides(**value).model_dump()
    for key in ('content', 'n_slides', 'language', 'instructions', 'file_paths', 'include_title_slide',
                'include_table_of_contents', 'web_search', 'outline_error', 'outlines'):
        assert response[key] == value[key]
