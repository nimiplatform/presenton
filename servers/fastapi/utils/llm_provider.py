from enums.llm_provider import LLMProvider

def get_llm_provider():
    return LLMProvider.NIMI


def is_openai_selected():
    return get_llm_provider() == LLMProvider.OPENAI


def is_deepseek_selected():
    return get_llm_provider() == LLMProvider.DEEPSEEK


def is_google_selected():
    return get_llm_provider() == LLMProvider.GOOGLE


def is_anthropic_selected():
    return get_llm_provider() == LLMProvider.ANTHROPIC


def is_vertex_selected():
    return get_llm_provider() == LLMProvider.VERTEX


def is_azure_selected():
    return get_llm_provider() == LLMProvider.AZURE


def is_bedrock_selected():
    return get_llm_provider() == LLMProvider.BEDROCK


def is_ollama_selected():
    return get_llm_provider() == LLMProvider.OLLAMA


def is_custom_llm_selected():
    return get_llm_provider() == LLMProvider.CUSTOM


def is_cerebras_selected():
    return get_llm_provider() == LLMProvider.CEREBRAS


def is_openrouter_selected():
    return get_llm_provider() == LLMProvider.OPENROUTER


def is_fireworks_selected():
    return get_llm_provider() == LLMProvider.FIREWORKS


def is_together_selected():
    return get_llm_provider() == LLMProvider.TOGETHER


def is_codex_selected():
    return get_llm_provider() == LLMProvider.CODEX


def is_litellm_selected():
    return get_llm_provider() == LLMProvider.LITELLM


def is_lmstudio_selected():
    return get_llm_provider() == LLMProvider.LMSTUDIO


def get_model():
    # Capability identity, never a provider or model route.
    return "text.generate"


def get_large_model():
    return get_model()
