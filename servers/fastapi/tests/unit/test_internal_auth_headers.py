import asyncio
import pytest
from api.v1.auth import internal


def test_internal_headers_use_only_current_business_host_key(monkeypatch):
    monkeypatch.setenv("PRESENTON_HOST_KEY", "a" * 64)
    assert asyncio.run(internal.authenticated_internal_request_headers()) == {
        "X-Presenton-Host": "a" * 64,
    }


def test_internal_headers_fail_without_host(monkeypatch):
    monkeypatch.delenv("PRESENTON_HOST_KEY", raising=False)
    with pytest.raises(KeyError):
        asyncio.run(internal.authenticated_internal_request_headers())
