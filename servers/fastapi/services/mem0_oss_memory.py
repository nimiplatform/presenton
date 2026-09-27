"""Shared App-owned presentation retrieval. Inference belongs to Nimi."""
import threading
from services.nimi_memory import PresentationMemory

_memory_lock = threading.RLock()
_shared_client = None

def run_shared_mem0_operation(operation):
    with _memory_lock:
        return operation()

def get_shared_mem0_client():
    global _shared_client
    with _memory_lock:
        if _shared_client is None:
            _shared_client = PresentationMemory()
        return _shared_client
