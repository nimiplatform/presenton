import asyncio
import importlib.util
import uuid
from pathlib import Path

from llmai.shared import UserMessage
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import create_engine, inspect, text
from alembic.migration import MigrationContext
from alembic.operations import Operations

from services import nimi_channel
from services.nimi_llm import NimiLLMClient, model_output_items
from services.chat.service import PresentationChatService
from services.chat import sql_chat_history
from models.sql.chat_history_message import ChatHistoryMessageModel

OUTPUT = [{"type": "reasoning-continuity", "carrier": {"kind": "opaque", "version": 1, "payload": "AP+A"}}, {"type": "text", "text": "Canonical answer"}]


def test_final_no_tool_output_survives_new_client_and_sql_reopen(monkeypatch, tmp_path):
    def stream(operation, payload, cancel):
        yield {"type": "result", "value": {"text": "Canonical answer", "toolCalls": [], "outputItems": OUTPUT, "finishReason": "stop"}}
    monkeypatch.setattr(nimi_channel, "stream", stream)
    response = NimiLLMClient().generate(messages=[UserMessage(content="Question")])
    assert model_output_items(response) == OUTPUT

    async def run():
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'history.db'}")
        try:
            async with engine.begin() as connection:
                await connection.run_sync(lambda c: ChatHistoryMessageModel.__table__.create(c))
            presentation, conversation = uuid.uuid4(), uuid.uuid4()
            async with AsyncSession(engine) as session:
                await sql_chat_history.append_turn(session, presentation_id=presentation, conversation_id=conversation,
                    user_message="Question", assistant_message="Displayed answer", nimi_output_items=model_output_items(response))
                await session.commit()
            async with AsyncSession(engine) as session:
                history = await sql_chat_history.load_messages(session, presentation_id=presentation, conversation_id=conversation)
                visible = await sql_chat_history.load_messages_with_meta(session, presentation_id=presentation, conversation_id=conversation)
            assert history[-1]["nimi_output_items"] == OUTPUT
            assert history[-1]["content"] == "Displayed answer"
            assert all("nimi_output_items" not in item for item in visible)
            message = PresentationChatService._convert_history_to_messages(history)[-1]
            assert NimiLLMClient()._message(message)["outputItems"] == OUTPUT
        finally:
            await engine.dispose()
    asyncio.run(run())


def test_output_migration_preserves_existing_display_history(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'existing.db'}")
    file = Path(__file__).parents[2] / "alembic/versions/f1e3d5c7b9a0_add_nimi_chat_output_items.py"
    spec = importlib.util.spec_from_file_location("output_migration", file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE chat_history_messages (id TEXT PRIMARY KEY, content TEXT NOT NULL)"))
        connection.execute(text("INSERT INTO chat_history_messages VALUES ('one', 'Saved display')"))
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
            module.upgrade()
        assert "nimi_output_items" in {column["name"] for column in inspect(connection).get_columns("chat_history_messages")}
        assert connection.execute(text("SELECT content, nimi_output_items FROM chat_history_messages")).one() == ("Saved display", None)
    engine.dispose()
