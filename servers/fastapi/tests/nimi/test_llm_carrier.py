import json
import threading
from llmai.shared import AssistantMessage, AssistantToolCall, JSONSchemaResponse, SystemMessage, TextContentPart, Tool, ToolResponseMessage, UserMessage
from services.nimi_llm import NimiLLMClient
from services import nimi_channel


def test_unicode_schema_and_whitespace_are_not_rewritten(monkeypatch):
    captured = []
    def stream(operation, payload, cancel):
        captured.append((operation, payload))
        yield {'type': 'delta', 'text': '  中文\n'}
        yield {'type': 'result', 'value': {'text': '  中文\n', 'toolCalls': [], 'outputItems': [{'type': 'text', 'text': '  中文\n'}], 'finishReason': 'stop'}}
    monkeypatch.setattr(nimi_channel, 'stream', stream)
    schema = {'type': 'object', 'properties': {'标题': {'type': 'string'}}}
    output = list(NimiLLMClient().generate(messages=[SystemMessage(content='保留 空格'), UserMessage(content='中文 café')],
        response_format=JSONSchemaResponse(name='Slide', json_schema=schema), stream=True))
    assert output[0].chunk == '  中文\n'
    assert output[-1].content == '  中文\n'
    assert captured[0][1]['responseFormat']['schema'] == schema
    assert captured[0][1]['responseFormat']['strict'] is False
    assert captured[0][1]['messages'][1]['content'][0]['text'] == '中文 café'
    assert 'model' not in captured[0][1]


def test_tool_turn_retains_ordered_opaque_continuity(monkeypatch):
    captured = []
    outputs = [{'type': 'reasoning-continuity', 'carrier': {'kind': 'opaque', 'version': 1, 'payload': [0, 255, 10]}},
               {'type': 'tool-call', 'toolCall': {'id': 'call-1', 'name': 'edit_slide', 'arguments': {'title': '中文'}}}]
    def stream(operation, payload, cancel):
        captured.append(payload)
        yield {'type': 'result', 'value': {'text': '', 'toolCalls': [outputs[1]['toolCall']], 'outputItems': outputs, 'finishReason': 'tool-calls'}}
    monkeypatch.setattr(nimi_channel, 'stream', stream)
    client = NimiLLMClient()
    messages = [UserMessage(content='Edit this slide')]
    response = client.generate(messages=messages, tools=[Tool(name='edit_slide', description='Edit', schema={'type': 'object'})])
    client.generate(messages=[*messages, AssistantMessage(tool_calls=response.tool_calls), ToolResponseMessage(id='call-1', content=[TextContentPart(text='{"ok": true}')])])
    assert captured[1]['messages'][1]['outputItems'] == outputs
    assert captured[1]['messages'][2]['toolResult'] == {'toolCallId': 'call-1', 'toolName': 'edit_slide', 'result': '{"ok": true}'}


def test_provider_options_and_orphan_tool_results_fail_closed():
    import pytest
    with pytest.raises(ValueError, match='provider-specific'):
        NimiLLMClient().generate(messages=[UserMessage(content='x')], extra_body={'model': 'private'})
    with pytest.raises(ValueError, match='preceding model tool call'):
        NimiLLMClient().generate(messages=[ToolResponseMessage(id='unknown', content=[])])


def test_channel_cancel_releases_request_without_waiting_for_a_delta(monkeypatch):
    frames = []
    stop = threading.Event()
    def send(frame):
        frames.append(frame)
        stop.set()
    monkeypatch.setattr(nimi_channel, '_send', send)
    import pytest
    with pytest.raises(RuntimeError, match='canceled'):
        list(nimi_channel.stream('text', {'messages': []}, stop))
    assert [frame['operation'] for frame in frames] == ['text', 'cancel']
    assert not nimi_channel._pending


def test_canceled_queued_request_never_dispatches(monkeypatch):
    import pytest
    frames = []
    monkeypatch.setattr(nimi_channel, '_send', frames.append)
    stop = threading.Event()
    stop.set()
    with pytest.raises(RuntimeError, match='canceled'):
        nimi_channel.request('image', {'prompt': 'unused'}, stop)
    assert frames == []
    assert not nimi_channel._pending


def test_completed_request_does_not_send_cancel(monkeypatch):
    frames = []
    def send(frame):
        frames.append(frame)
        if frame['operation'] == 'embed':
            nimi_channel._pending[frame['id']].put({'type': 'result', 'value': {'spaceId': 'test', 'vectors': [[1.0]]}})
    monkeypatch.setattr(nimi_channel, '_send', send)
    assert nimi_channel.request('embed', {'inputs': ['note']})['spaceId'] == 'test'
    assert [frame['operation'] for frame in frames] == ['embed']
    assert not nimi_channel._pending


def test_worker_pipe_is_strict_utf8_and_logs_stay_off_the_protocol():
    import subprocess
    import sys
    code = '''import os, time
from services.nimi_channel import start_channel, request
start_channel(lambda: os._exit(0))
print("business log 中文")
value = request("embed", {"inputs": ["中文 café"]})
assert value == {"answer": "原样 сохранено"}
while True: time.sleep(1)
'''
    child = subprocess.Popen([sys.executable, '-c', code], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        frame = json.loads(child.stdout.readline().decode('utf-8'))
        assert frame['payload']['inputs'] == ['中文 café']
        reply = {'id': frame['id'], 'type': 'result', 'value': {'answer': '原样 сохранено'}}
        child.stdin.write((json.dumps(reply, ensure_ascii=False) + '\n').encode('utf-8')); child.stdin.flush()
        child.stdin.close()
        assert child.wait(timeout=5) == 0
        assert 'business log 中文' in child.stderr.read().decode('utf-8')
    finally:
        if child.poll() is None: child.kill()


def test_configuration_failure_keeps_retry_disposition_in_sse():
    from services.nimi_channel import NimiCallError
    from utils.llm_client_error_handler import handle_llm_client_exceptions
    from models.sse_response import SSEErrorResponse
    error = handle_llm_client_exceptions(NimiCallError({'message': 'missing connector', 'reasonCode': 'ai-connector-not-found', 'retryable': False}))
    assert error.status_code == 422
    assert error.retryable is False
    assert 'Settings' in error.detail
    event = SSEErrorResponse(detail=error.detail, retryable=error.retryable, error_type=error.error_type).to_string()
    value = json.loads(event.split('data: ', 1)[1])
    assert value['retryable'] is False
    assert value['error_type'] == 'ai-connector-not-found'


def test_rejected_draft_is_only_used_for_feedback_and_new_step_can_complete(monkeypatch):
    import asyncio
    from utils.llm_utils import generate_structured_with_schema_retries
    calls = []
    schema = {'type': 'object', 'properties': {'title': {'type': 'string', 'maxLength': 3}}, 'required': ['title']}
    def stream(operation, payload, cancel):
        assert not cancel.is_set()
        calls.append(payload)
        if len(calls) == 1:
            yield {'type': 'delta', 'text': '{"title":"too long"}'}
            raise nimi_channel.NimiCallError({'reasonCode': 'ai-output-invalid'})
        yield {'type': 'result', 'value': {'text': '{"title":"中文"}', 'toolCalls': [], 'outputItems': [], 'finishReason': 'stop'}}
    monkeypatch.setattr(nimi_channel, 'stream', stream)
    result = asyncio.run(generate_structured_with_schema_retries(NimiLLMClient(), 'text.generate',
        messages=[UserMessage(content='Make a title')], response_format=JSONSchemaResponse(json_schema=schema, strict=False),
        json_schema=schema, validate_schema=True))
    assert result == {'title': '中文'}
    assert len(calls) == 2
    assert 'too long' in calls[1]['messages'][-1]['content'][0]['text']


def test_repeated_rejected_output_never_becomes_success(monkeypatch):
    import asyncio
    import pytest
    from utils.llm_utils import generate_structured_with_schema_retries
    calls = []
    schema = {'type': 'object', 'properties': {'title': {'type': 'string'}}}
    def stream(operation, payload, cancel):
        calls.append(payload)
        yield {'type': 'delta', 'text': '{"title":"looks valid"}'}
        raise nimi_channel.NimiCallError({'reasonCode': 'ai-output-invalid'})
    monkeypatch.setattr(nimi_channel, 'stream', stream)
    with pytest.raises(nimi_channel.NimiCallError):
        asyncio.run(generate_structured_with_schema_retries(NimiLLMClient(), 'text.generate',
            messages=[UserMessage(content='Make a title')], response_format=JSONSchemaResponse(json_schema=schema, strict=False),
            json_schema=schema, validate_schema=True))
    assert len(calls) == 3
