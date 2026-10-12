"""Presentation-scoped retrieval, using Qdrant and Nimi embeddings.

These are document working notes, not canonical Nimi Agent Memory. Source text
is durable independently of vectors. A changed Runtime embedding space gets a
new collection, populated lazily from the same source notes.
"""
from __future__ import annotations

import hashlib
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from qdrant_client import QdrantClient, models
from services.nimi_channel import request


# @nimi-authority: rule.nimi.runtime.ai-provider.embedding-retrieval-purpose
def embed(inputs, *, purpose):
    result = request("embed", {"inputs": inputs, "purpose": purpose})
    if not result.get("spaceId") or len(result.get("vectors", [])) != len(inputs):
        raise RuntimeError("Nimi returned incomplete embeddings")
    return result


class PresentationMemory:
    def __init__(self):
        root = os.path.join(os.environ["APP_DATA_DIRECTORY"], "retrieval")
        os.makedirs(root, exist_ok=True)
        self.db = sqlite3.connect(os.path.join(root, "notes.sqlite"), check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, scope TEXT NOT NULL, text TEXT NOT NULL, created TEXT NOT NULL)")
        self.db.commit()
        self.vectors = QdrantClient(path=os.path.join(root, "vectors"))
        self.lock = threading.RLock()

    def add(self, messages, *, user_id, infer=False):
        if infer:
            raise ValueError("Presentation notes are stored without inferred memories")
        content = "\n".join(message["content"] for message in messages)
        return self.add_notes([content], user_id=user_id)

    def add_notes(self, texts, *, user_id):
        items = [{"id": str(uuid.uuid4()), "memory": text,
                  "created_at": datetime.now(timezone.utc).isoformat()} for text in texts]
        # A bundled catalog is seeded atomically. Interrupted initialization
        # must not leave a partial catalog that looks ready on the next launch.
        with self.lock, self.db:
            self.db.executemany("INSERT INTO notes VALUES (?, ?, ?, ?)",
                [(item["id"], user_id, item["memory"], item["created_at"]) for item in items])
        return {"results": items}

    def get_all(self, *, user_id=None, filters=None, limit=100, **kwargs):
        scope = user_id or (filters or {}).get("user_id")
        if not scope:
            raise ValueError("Presentation memory requires a document scope")
        with self.lock:
            rows = self.db.execute("SELECT id, text, created FROM notes WHERE scope=? ORDER BY created DESC LIMIT ?", (scope, min(int(limit), 10000))).fetchall()
        return {"results": [{"id": row[0], "memory": row[1], "created_at": row[2]} for row in rows]}

    def search(self, query, *, user_id=None, filters=None, limit=8, **kwargs):
        scope = user_id or (filters or {}).get("user_id")
        notes = self.get_all(user_id=scope, limit=10000)["results"]
        if not notes:
            return {"results": []}
        current = embed([query], purpose="retrieval-query")
        space = current["spaceId"]
        collection = "presentation_" + hashlib.sha256(space.encode()).hexdigest()[:24]
        with self.lock:
            if not self.vectors.collection_exists(collection):
                self.vectors.create_collection(collection, vectors_config=models.VectorParams(size=len(current["vectors"][0]), distance=models.Distance.COSINE))
            existing = {str(point.id) for point in self.vectors.retrieve(collection, [note["id"] for note in notes], with_payload=False)}
            missing = [note for note in notes if note["id"] not in existing]
            for offset in range(0, len(missing), 16):
                batch = missing[offset:offset+16]
                encoded = embed([note["memory"] for note in batch], purpose="retrieval-document")
                if encoded["spaceId"] != space:
                    raise RuntimeError("Embedding configuration changed; retry document retrieval")
                self.vectors.upsert(collection, [models.PointStruct(id=note["id"], vector=vector,
                    payload={**note, "scope": scope}) for note, vector in zip(batch, encoded["vectors"], strict=True)])
            points = self.vectors.query_points(collection, query=current["vectors"][0],
                query_filter=models.Filter(must=[models.FieldCondition(key="scope", match=models.MatchValue(value=scope))]),
                limit=limit).points
        return {"results": [{**point.payload, "score": point.score} for point in points]}
