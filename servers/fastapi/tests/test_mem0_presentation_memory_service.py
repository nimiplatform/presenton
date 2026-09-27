import asyncio
import threading
import time
import uuid
from unittest.mock import patch

import services.mem0_oss_memory as mem0_oss
from services.chat.chat_memory_store import ChatMemoryStore
from services.mem0_presentation_memory_service import Mem0PresentationMemoryService


class FakeMemoryClient:
    instances: list["FakeMemoryClient"] = []

    def __init__(self):
        self.add_calls = []
        self.search_calls = []
        self.next_search_response = {"results": []}
        FakeMemoryClient.instances.append(self)

    def add(self, *args, **kwargs):
        messages = kwargs.get("messages") if "messages" in kwargs else None
        if messages is None and args:
            messages = args[0]

        self.add_calls.append(
            {
                "messages": messages,
                "user_id": kwargs.get("user_id"),
                "infer": kwargs.get("infer"),
            }
        )
        return {"ok": True}

    def search(self, query, *args, **kwargs):
        self.search_calls.append(
            {
                "query": query,
                "filters": kwargs.get("filters"),
                "user_id": kwargs.get("user_id"),
                "top_k": kwargs.get("top_k"),
            }
        )
        return self.next_search_response


def _mem0_oss_fresh() -> None:
    mem0_oss._shared_client = None  # type: ignore[attr-defined]


class TestMem0PresentationMemoryService:
    def setup_method(self):
        FakeMemoryClient.instances = []
        _mem0_oss_fresh()

    def test_shared_client_keeps_notes_in_workspace_without_provider_inference(self, monkeypatch, tmp_path):
        from services.nimi_memory import PresentationMemory
        monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        client = mem0_oss.get_shared_mem0_client()
        try:
            assert isinstance(client, PresentationMemory)
            assert mem0_oss.get_shared_mem0_client() is client
            client.add([{"content": "source document"}], user_id="deck", infer=False)
            assert client.get_all(user_id="deck")["results"][0]["memory"] == "source document"
            assert (tmp_path / "retrieval" / "notes.sqlite").is_file()
        finally:
            client.vectors.close()
            client.db.close()
            mem0_oss._shared_client = None

    def test_store_generation_context_uses_presentation_scope(self):
        with patch.dict(
            "os.environ",
            {
                "MEM0_ENABLED": "true",
                "APP_DATA_DIRECTORY": "/tmp/presenton-test",
            },
            clear=False,
        ), patch(
            "services.mem0_presentation_memory_service.get_shared_mem0_client",
            return_value=FakeMemoryClient(),
        ):
            service = Mem0PresentationMemoryService()
            presentation_id = uuid.uuid4()
            asyncio.run(
                service.store_generation_context(
                    presentation_id=presentation_id,
                    system_prompt="system prompt",
                    user_prompt="user prompt",
                    extracted_document_text="doc text",
                    source_content="seed prompt",
                    instructions="be concise",
                )
            )

        assert len(FakeMemoryClient.instances) == 1
        client = FakeMemoryClient.instances[0]
        assert len(client.add_calls) == 5

        scoped_user_id = f"presentation:{presentation_id}"
        for call in client.add_calls:
            assert call["user_id"] == scoped_user_id
            assert call["infer"] is False

        serialized_messages = "\n".join(
            str(call["messages"][0]["content"]) for call in client.add_calls
        )
        assert "[outline_system_prompt]" in serialized_messages
        assert "[outline_user_prompt]" in serialized_messages
        assert "[document_extracted_text]" in serialized_messages
        assert "[presentation_source_prompt]" in serialized_messages

    def test_retrieve_context_uses_same_scope_and_deduplicates(self):
        with patch.dict(
            "os.environ",
            {
                "MEM0_ENABLED": "true",
                "MEM0_TOP_K": "5",
                "APP_DATA_DIRECTORY": "/tmp/presenton-test",
            },
            clear=False,
        ), patch(
            "services.mem0_presentation_memory_service.get_shared_mem0_client",
            return_value=FakeMemoryClient(),
        ):
            service = Mem0PresentationMemoryService()
            presentation_id = uuid.uuid4()

            asyncio.run(
                service.store_generated_outlines(
                    presentation_id,
                    {"slides": [{"content": "One"}]},
                )
            )

            client = FakeMemoryClient.instances[0]
            client.next_search_response = {
                "results": [
                    {"memory": "Memory A"},
                    {"memory": "Memory A"},
                    {"memory": "Memory B"},
                ]
            }

            context = asyncio.run(
                service.retrieve_context(
                    presentation_id=presentation_id,
                    query="change the conclusion",
                )
            )

        assert "Memory A" in context
        assert "Memory B" in context
        assert context.count("Memory A") == 1

        assert len(client.search_calls) == 1
        assert client.search_calls[0]["query"] == "change the conclusion"
        assert client.search_calls[0]["filters"] == {
            "user_id": f"presentation:{presentation_id}"
        }
        assert client.search_calls[0]["top_k"] == 5

    def test_presentation_and_chat_operations_are_serialized(self):
        class ConcurrentWriteClient(FakeMemoryClient):
            def __init__(self):
                super().__init__()
                self.active_calls = 0
                self.max_active_calls = 0
                self.state_lock = threading.Lock()

            def add(self, *args, **kwargs):
                with self.state_lock:
                    self.active_calls += 1
                    self.max_active_calls = max(
                        self.max_active_calls,
                        self.active_calls,
                    )
                try:
                    time.sleep(0.05)
                    return super().add(*args, **kwargs)
                finally:
                    with self.state_lock:
                        self.active_calls -= 1

        client = ConcurrentWriteClient()
        presentation_id = uuid.uuid4()
        conversation_id = uuid.uuid4()

        async def run_concurrent_writes():
            presentation_memory = Mem0PresentationMemoryService()
            chat_memory = ChatMemoryStore()
            await asyncio.gather(
                presentation_memory.store_generated_outlines(
                    presentation_id,
                    {"slides": [{"content": "One"}]},
                ),
                chat_memory.store_chat_turn(
                    presentation_id=presentation_id,
                    conversation_id=conversation_id,
                    user_message="Tighten the copy",
                    assistant_message="Done",
                ),
            )

        with patch.dict(
            "os.environ",
            {"MEM0_ENABLED": "true"},
            clear=False,
        ), patch(
            "services.mem0_presentation_memory_service.get_shared_mem0_client",
            return_value=client,
        ), patch(
            "services.chat.chat_memory_store.get_shared_mem0_client",
            return_value=client,
        ):
            asyncio.run(run_concurrent_writes())

        assert len(client.add_calls) == 2
        assert client.max_active_calls == 1
