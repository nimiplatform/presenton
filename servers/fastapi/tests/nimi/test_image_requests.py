import asyncio
import base64
import threading
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from models.image_prompt import ImagePrompt
from services import nimi_channel
from services.image_generation_service import ImageGenerationService

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')


@pytest.fixture(autouse=True)
def nimi_images(monkeypatch):
    monkeypatch.setenv('IMAGE_PROVIDER', 'nimi')
    monkeypatch.setenv('DISABLE_IMAGE_GENERATION', 'false')


def test_generated_artifact_is_saved_in_the_requested_directory(monkeypatch, tmp_path):
    request = AsyncMock(return_value={'data': base64.b64encode(PNG).decode(), 'mimeType': 'image/png'})
    monkeypatch.setattr('services.image_generation_service.request_async', request)
    prompt = ImagePrompt(prompt='A tree', theme_prompt='Watercolor')
    image = asyncio.run(ImageGenerationService(str(tmp_path)).generate_image(prompt))
    assert Path(image.path).parent == tmp_path
    assert Path(image.path).read_bytes() == PNG
    assert image.extras == {'prompt': 'A tree', 'theme_prompt': 'Watercolor'}
    request.assert_awaited_once_with('image', {'prompt': prompt.get_image_prompt(with_theme=True)})


def test_canceling_an_image_sends_cancel_and_leaves_another_request_running(monkeypatch, tmp_path):
    frames = []
    frame_lock = threading.Lock()

    def send(frame):
        with frame_lock:
            frames.append(frame)

    def operations():
        with frame_lock:
            return list(frames)

    monkeypatch.setattr(nimi_channel, '_send', send)

    async def wait_for(predicate):
        async with asyncio.timeout(3):
            while not predicate():
                await asyncio.sleep(0.01)

    async def run():
        service = ImageGenerationService(str(tmp_path))
        first = asyncio.create_task(service.generate_image(ImagePrompt(prompt='first')))
        second = None
        try:
            await wait_for(lambda: len(operations()) == 1)
            first_id = operations()[0]['id']
            second = asyncio.create_task(service.generate_image(ImagePrompt(prompt='second')))
            await wait_for(lambda: len(operations()) == 2)
            second_id = operations()[1]['id']
            first.cancel()
            with pytest.raises(asyncio.CancelledError):
                await first
            await wait_for(lambda: first_id not in nimi_channel._pending)
            assert operations()[-1] == {'id': first_id, 'operation': 'cancel'}
            assert second_id in nimi_channel._pending
            assert not second.done()
            nimi_channel._pending[second_id].put({'type': 'result', 'value': {
                'data': base64.b64encode(PNG).decode(), 'mimeType': 'image/png',
            }})
            image = await second
            assert Path(image.path).read_bytes() == PNG
            assert len(list(tmp_path.iterdir())) == 1
            assert [frame['operation'] for frame in operations()] == ['image', 'image', 'cancel']
        finally:
            for task in (first, second):
                if task is not None and not task.done():
                    task.cancel()
            # Release real worker threads even if an assertion fails.
            for pending in list(nimi_channel._pending.values()):
                pending.put({'type': 'error', 'message': 'test cleanup'})
            await asyncio.gather(*(task for task in (first, second) if task is not None), return_exceptions=True)

    asyncio.run(run())
    assert not nimi_channel._pending
