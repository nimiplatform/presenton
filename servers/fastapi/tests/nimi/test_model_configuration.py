import asyncio

import pytest
from fastapi import HTTPException
from llmai.shared import UserMessage

from services import nimi_channel
from services.nimi_business_settings import save_settings
from services.nimi_llm import NimiLLMClient
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model


@pytest.mark.parametrize('provider', ['openai', 'codex', 'google', 'custom'])
def test_legacy_provider_environment_cannot_override_nimi_configuration(monkeypatch, provider):
    monkeypatch.setenv('LLM', provider)
    monkeypatch.setenv('CODEX_MODEL', 'unselected-model')
    monkeypatch.setenv('OPENAI_MODEL', 'unselected-model')
    monkeypatch.setenv('OPENAI_API_KEY', 'worker-must-not-use-this')
    monkeypatch.setenv('LLM_MAX_OUTPUT_TOKENS', '1')
    monkeypatch.setenv('LLM_REASONING_MODE', 'enabled')
    calls = []

    def stream(operation, payload, cancel):
        calls.append(payload)
        yield {'type': 'result', 'value': {'text': 'ok', 'toolCalls': [], 'outputItems': [], 'finishReason': 'stop'}}

    monkeypatch.setattr(nimi_channel, 'stream', stream)
    client = NimiLLMClient(get_llm_config())
    assert client.generate(model=get_model(), messages=[UserMessage(content='Draft a title')]).content == 'ok'
    assert set(calls[0]) == {'messages'}
    client.generate(model=get_model(), messages=[UserMessage(content='Draft a title')], max_tokens=200)
    assert calls[1]['parameters'] == {'maxTokens': 200}


@pytest.mark.parametrize('setting', ['LLM', 'OPENAI_API_KEY', 'LLM_REASONING_MODE'])
def test_business_settings_reject_model_route_and_credentials(monkeypatch, tmp_path, setting):
    config = tmp_path / 'settings.json'
    monkeypatch.setenv('USER_CONFIG_PATH', str(config))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(save_settings({setting: 'must-not-be-stored'}))
    assert exc.value.status_code == 400
    assert not config.exists()
