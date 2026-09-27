from starlette.requests import Request

from api.v1.ppt.endpoints.presentation import build_export_cookie_header
from api.v1.auth.config import SESSION_COOKIE_NAME


def _request(*, headers: dict[str, str]) -> Request:
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/ppt/generate",
            "headers": [
                (name.lower().encode(), value.encode())
                for name, value in headers.items()
            ],
        }
    )
    return request


def test_export_uses_host_key_not_an_internal_or_bearer_token(monkeypatch):
    monkeypatch.setenv("PRESENTON_HOST_KEY", "a" * 64)
    request = _request(
        headers={"Authorization": "Bearer sk-presenton-api-key"}
    )
    request.state.internal_session_token = "middleware-generated-jwt"

    assert build_export_cookie_header(request) == (
        "presenton_session=" + "a" * 64
    )


def test_browser_cookie_does_not_replace_business_host_key(monkeypatch):
    monkeypatch.setenv("PRESENTON_HOST_KEY", "b" * 64)
    cookie_header = f"{SESSION_COOKIE_NAME}=browser-jwt; theme=dark"
    request = _request(
        headers={
            "Cookie": cookie_header,
            "Authorization": "Bearer sk-presenton-api-key",
        }
    )
    request.state.internal_session_token = "middleware-generated-jwt"

    assert build_export_cookie_header(request) == "presenton_session=" + "b" * 64
