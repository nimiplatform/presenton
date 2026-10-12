"""Translate Presenton's llmai messages to the public Nimi single-step model.

llmai is retained for its message/schema types only. Tool execution and schema
repair stay in Presenton. The Host preserves ordered opaque reasoning items.
"""
from __future__ import annotations

import base64
import json
import threading
from pydantic import Field

from llmai.shared import (
    AssistantMessage, AssistantToolCall, ResponseStreamCompletionChunk,
    ResponseStreamContentChunk, TextContentPart,
)
from services import nimi_channel


class NimiAssistantMessage(AssistantMessage):
    # Display content and canonical model output are separate App facts. The
    # latter contains JSON-safe bytes and is persisted in the SQL checkpoint.
    nimi_output_items: list[dict] | None = Field(default=None, exclude=True)


def model_output_items(response):
    messages = getattr(response, "messages", None) or []
    return getattr(messages[-1], "nimi_output_items", None) if messages else None


def _schema(value):
    if isinstance(value, dict) or value is None:
        return value
    if hasattr(value, "model_json_schema"):
        return value.model_json_schema()
    raise ValueError("Unsupported presentation response schema")


def _parts(value):
    if value is None:
        return []
    if isinstance(value, str):
        return [{"type": "text", "text": value}]
    result = []
    for part in value:
        if isinstance(part, str):
            result.append({"type": "text", "text": part})
        elif getattr(part, "type", None) == "text":
            result.append({"type": "text", "text": part.text})
        elif getattr(part, "type", None) == "image":
            if part.data:
                result.append({"type": "image", "data": base64.b64encode(part.data).decode("ascii"), "mimeType": part.mime_type})
            elif part.url:
                result.append({"type": "image", "url": part.url, "mimeType": part.mime_type})
            else:
                raise ValueError("Image content has no source")
        else:
            raise ValueError("Unsupported presentation message content")
    return result


class NimiLLMClient:
    def __init__(self, config=None):
        self.config = config
        self._outputs = {}
        self._tool_names = {}
        self._cancel = threading.Event()

    def cancel(self):
        self._cancel.set()

    def _message(self, message):
        role = message.role
        result = {"role": role, "content": _parts(message.content)}
        if role == "assistant":
            calls = list(message.tool_calls or [])
            key = tuple(call.id for call in calls)
            saved = getattr(message, "nimi_output_items", None)
            if saved is not None:
                result["outputItems"] = saved
            elif key and key in self._outputs:
                result["outputItems"] = self._outputs[key]
            else:
                result["outputItems"] = [
                    {"type": "text", "text": part["text"]}
                    for part in result["content"] if part["type"] == "text"
                ] + [{"type": "tool-call", "toolCall": {
                    "id": call.id, "name": call.name,
                    "arguments": json.loads(call.arguments or "{}"),
                }} for call in calls]
            result["content"] = []
            for call in calls:
                self._tool_names[call.id] = call.name
        elif role == "tool":
            if message.id not in self._tool_names:
                raise ValueError("Tool result has no preceding model tool call")
            result["toolResult"] = {"toolCallId": message.id,
                "toolName": self._tool_names[message.id],
                "result": "".join(part["text"] for part in result["content"])}
            result["content"] = []
        elif role not in {"user", "system"}:
            raise ValueError("Unsupported presentation message role")
        return result

    def generate(self, *, messages, model=None, stream=False, tools=None,
                 response_format=None, max_tokens=None, tool_choice=None,
                 reasoning=None, extra_body=None, **kwargs):
        if kwargs or extra_body or reasoning is not None:
            raise ValueError("Configure model behavior in Nimi AI settings; provider-specific options are unsupported")
        self._cancel = threading.Event()
        cancellation = self._cancel
        payload = {"messages": [self._message(message) for message in messages]}
        if max_tokens is not None:
            payload["parameters"] = {"maxTokens": max_tokens}
        if tools:
            payload["tools"] = []
            for tool in tools:
                if not hasattr(tool, "input_schema"):
                    raise ValueError("Use Presenton's external search tool; provider-native tools are unsupported")
                payload["tools"].append({"type": "function", "name": tool.name,
                    "description": tool.description,
                    "inputSchema": _schema(tool.input_schema) or {"type": "object", "properties": {}}})
        if response_format is not None:
            kind = response_format.type
            if kind == "json_schema":
                payload["responseFormat"] = {"type": "json-schema",
                    "schema": _schema(response_format.json_schema),
                    "strict": response_format.strict}
                if response_format.name:
                    payload["responseFormat"]["name"] = response_format.name
            elif kind in {"text", "json_object"}:
                payload["responseFormat"] = {"type": kind.replace("_", "-")}
            else:
                raise ValueError("Unsupported presentation response format")
        if tool_choice is not None:
            mode = getattr(tool_choice.mode, "value", tool_choice.mode)
            allowed = getattr(tool_choice, "tools", [])
            if mode in {"auto", "none"}:
                payload["toolChoice"] = mode
                if allowed and tools:
                    payload["tools"] = [tool for tool in payload["tools"] if tool["name"] in allowed]
            elif mode == "required" and len(allowed or []) == 1:
                payload["toolChoice"] = {"type": "tool", "name": allowed[0]}
            elif mode == "required":
                payload["toolChoice"] = "required"
            else:
                raise ValueError("Unsupported tool choice")

        def events():
            for event in nimi_channel.stream("text", payload, cancellation):
                if event["type"] == "delta":
                    yield ResponseStreamContentChunk(chunk=event["text"])
                elif event["type"] == "result":
                    value = event["value"]
                    calls = [AssistantToolCall(id=c["id"], name=c["name"], arguments=json.dumps(c["arguments"], ensure_ascii=False)) for c in value.get("toolCalls", [])]
                    if calls:
                        self._outputs[tuple(call.id for call in calls)] = value["outputItems"]
                    content = value["text"]
                    assistant = NimiAssistantMessage(content=[TextContentPart(text=content)] if content else [], tool_calls=calls,
                        nimi_output_items=value["outputItems"])
                    yield ResponseStreamCompletionChunk(content=content, tool_calls=calls,
                        messages=[*messages, assistant], finish_reason=value["finishReason"])
        if stream:
            return events()
        for event in events():
            if isinstance(event, ResponseStreamCompletionChunk):
                return event
        raise RuntimeError("Nimi returned no completed model step")


def get_client(*, config=None):
    return NimiLLMClient(config)
