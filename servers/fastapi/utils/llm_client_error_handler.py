import logging
import traceback

from fastapi import HTTPException
from services.nimi_channel import NimiCallError

from enums.llm_provider import LLMProvider
from utils.llm_provider import get_llm_provider
from utils.provider_errors import ProviderHTTPException, normalize_provider_error


LOGGER = logging.getLogger(__name__)
CHATGPT_AUTH_REQUIRED_HEADER = {"X-Presenton-Auth-Action": "codex-reauth"}
CHATGPT_AUTH_REQUIRED_PREFIX = "CHATGPT_AUTH_REQUIRED:"


def _is_codex_provider() -> bool:
    try:
        return get_llm_provider() == LLMProvider.CODEX
    except Exception:
        return False


def _chatgpt_auth_required_exception() -> HTTPException:
    error = ProviderHTTPException(
        status_code=401,
        detail=f"{CHATGPT_AUTH_REQUIRED_PREFIX} Your ChatGPT session expired. Please sign in again from Settings.",
        code="chatgpt_auth_required", retryable=False, source="llm",
    )
    error.headers = CHATGPT_AUTH_REQUIRED_HEADER
    return error


def handle_llm_client_exceptions(e: Exception) -> HTTPException:
    if isinstance(e, NimiCallError):
        traceback.print_exc()
        explanation = {
            "ai-config-not-found": "Choose models for Presenton in Settings → AI models before generating content.",
            "ai-connector-not-found": "The selected Nimi connection no longer exists. Select its current connection in Settings → AI models.",
            "ai-remote-model-catalog-stale": "Nimi's model list changed. Choose your model again from the current list in Settings → AI models, then save the selection before trying again.",
            "ai-provider-auth-failed": "The model connection needs authorization in Nimi Cloud Services.",
            "ai-text-behavior-unsupported": "The selected Nimi model does not support this request. Choose a model with the required structured output, tools or image input in Settings → AI models.",
            "ai-output-invalid": "The model response did not pass Nimi's output validation. Your prompt and settings are saved. Review the AI model settings before trying again.",
        }.get(e.reason_code, str(e))
        error = HTTPException(status_code=422, detail=explanation)
        error.error_code = e.reason_code
        error.retryable = e.retryable
        error.error_type = e.reason_code
        error.diagnostic_stage = e.diagnostic_stage
        error.source = "llm"
        return error
    if isinstance(e, HTTPException):
        if _is_codex_provider() and e.status_code in {401, 403}:
            return _chatgpt_auth_required_exception()
        return e
    error = normalize_provider_error(e)
    if _is_codex_provider() and error.status_code in {401, 403}:
        return _chatgpt_auth_required_exception()
    LOGGER.warning("LLM request failed: code=%s status=%s exception=%s", error.error_code, error.status_code, type(e).__name__)
    return error
