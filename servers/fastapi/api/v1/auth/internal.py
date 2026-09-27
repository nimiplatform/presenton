"""Headers for the current App-owned business helper only."""
import os
async def authenticated_internal_request_headers() -> dict[str, str]:
    key = os.environ["PRESENTON_HOST_KEY"]
    return {"X-Presenton-Host": key}
