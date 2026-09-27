"""Authenticate the App-owned HTTP helper, not a Nimi identity endpoint.

Only a session-bound Host starts this worker and it stops the worker when its
protected scope is invalidated. This ephemeral business key cannot call Nimi.
"""
import hmac
import os
from fastapi import APIRouter
from starlette.responses import JSONResponse
from api.v1.auth.presenton_oauth import PRESENTON_OAUTH_ROUTER

router = APIRouter(prefix="/api/v1/auth")
router.include_router(PRESENTON_OAUTH_ROUTER)


@router.get("/status")
async def status():
    # The request has already passed HostOnlyMiddleware. This is the business
    # server's availability, never a claimed Nimi user or login credential.
    return {"configured": True, "authenticated": True, "username": None,
            "user_id": None, "role": "admin"}


class HostOnlyMiddleware:
    def __init__(self, app):
        self.app = app
        self.key = os.environ.get("PRESENTON_HOST_KEY", "")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        supplied = headers.get(b"x-presenton-host", b"").decode("ascii", errors="replace")
        if not self.key or not hmac.compare_digest(self.key, supplied):
            return await JSONResponse({"detail": "Open Presenton from Nimi"}, status_code=401)(scope, receive, send)
        return await self.app(scope, receive, send)
