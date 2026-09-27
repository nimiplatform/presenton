"""Presenton business defaults; Nimi owns all provider credentials and routing."""
from llmai.shared import GenerationDefaults

def get_generation_defaults():
    return GenerationDefaults()

def get_llm_config(*, use_openai_responses_api=False):
    return None

def get_extra_body(*, uses_tool_choice=False):
    return None

def enable_web_grounding():
    from utils.get_env import get_web_grounding_env
    return (get_web_grounding_env() or "").lower() == "true"

def disable_thinking():
    return False

def has_explicit_reasoning_settings():
    return False
