"""App-owned worker channel. Only the supervised Electron Host consumes Nimi.

The worker receives business inputs and model results, never Nimi credentials,
Runtime endpoints or a generic protected-method forwarding interface.
"""
from __future__ import annotations

import asyncio
import json
import queue
import sys
import threading
import uuid
from collections.abc import Iterator

_output = None
_pending: dict[str, queue.Queue] = {}
_lock = threading.Lock()
_closed = False
_on_disconnect = None
MAX_FRAME_BYTES = 48 * 1024 * 1024


class NimiCallError(RuntimeError):
    def __init__(self, frame):
        super().__init__(frame.get("message", "Nimi AI request failed"))
        self.reason_code = frame.get("reasonCode", "")
        self.action_hint = frame.get("actionHint", "")
        self.retryable = frame.get("retryable") is True
        self.diagnostic_stage = frame.get("diagnosticStage")


def start_channel(on_disconnect=None, *, output=None) -> None:
    global _output, _on_disconnect
    _on_disconnect = on_disconnect
    if _output is not None:
        raise RuntimeError("Presenton worker channel is already started")
    sys.stderr.reconfigure(encoding="utf-8")
    _output = sys.stdout.buffer if output is None else output
    sys.stdout = sys.stderr
    threading.Thread(target=_read, name="presenton-host", daemon=True).start()


def _send(value: dict) -> None:
    if _output is None or _closed:
        raise RuntimeError("Launch Presenton through Nimi to use AI")
    frame = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
    if len(frame) > MAX_FRAME_BYTES:
        raise ValueError("Presenton AI request exceeds the worker message limit")
    with _lock:
        _output.write(frame)
        _output.flush()


def _read() -> None:
    global _closed
    try:
        while True:
            frame = sys.stdin.buffer.readline(MAX_FRAME_BYTES + 1)
            if not frame:
                break
            if len(frame) > MAX_FRAME_BYTES or not frame.endswith(b"\n"):
                raise ValueError("Invalid Host response frame")
            message = json.loads(frame.decode("utf-8", errors="strict"))
            with _lock:
                target = _pending.get(message.get("id"))
            if target is not None:
                target.put(message)
    finally:
        _closed = True
        with _lock:
            for target in _pending.values():
                target.put({"type": "error", "message": "Nimi Host disconnected"})
        if _on_disconnect is not None:
            _on_disconnect()


def stream(operation: str, payload: dict, cancel: threading.Event | None = None) -> Iterator[dict]:
    if operation not in {"text", "image", "embed"}:
        raise ValueError("Unknown Presenton AI operation")
    if cancel is not None and cancel.is_set():
        raise RuntimeError("Presenton generation canceled")
    request_id = str(uuid.uuid4())
    target: queue.Queue = queue.Queue()
    with _lock:
        _pending[request_id] = target
    terminal = False
    try:
        _send({"id": request_id, "operation": operation, "payload": payload})
        while True:
            if cancel is not None and cancel.is_set():
                raise RuntimeError("Presenton generation canceled")
            try:
                message = target.get(timeout=0.1)
            except queue.Empty:
                continue
            if message["type"] == "error":
                terminal = True
                raise NimiCallError(message)
            # A request consumer may return immediately after this yield and
            # close the iterator. A completed request must not send cancel.
            if message["type"] == "result":
                terminal = True
            yield message
            if terminal:
                return
    finally:
        with _lock:
            _pending.pop(request_id, None)
        if not terminal and not _closed:
            _send({"id": request_id, "operation": "cancel"})


def request(operation: str, payload: dict, cancel: threading.Event | None = None) -> dict:
    for event in stream(operation, payload, cancel):
        if event["type"] == "result":
            return event["value"]
    raise RuntimeError("Nimi returned no completed result")


async def request_async(operation: str, payload: dict) -> dict:
    # Cancelling asyncio.to_thread alone leaves its synchronous request running.
    # Keep this event outside the worker so cancellation also covers queued work.
    cancel = threading.Event()
    try:
        return await asyncio.to_thread(request, operation, payload, cancel)
    finally:
        cancel.set()


def ready(port: int) -> None:
    _send({"type": "ready", "port": port})
