"""Mistral client + JSON helpers. All LLM traffic goes through here."""
import asyncio
import json
import os
import random
import re

from dotenv import load_dotenv
from openai import (
    APIConnectionError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
)

load_dotenv()

MODEL = "mistral-small-latest"

_client = AsyncOpenAI(
    api_key=os.getenv("MISTRAL_API_KEY"),
    base_url="https://api.mistral.ai/v1",
)

# Mistral throws intermittent 429s and 503 "capacity exceeded" errors; these are
# retryable and must never surface to the student as a degraded experience.
_RETRYABLE = (RateLimitError, InternalServerError, APIConnectionError, APITimeoutError)


async def chat(prompt: str, max_tokens: int = 512, json_mode: bool = False) -> str:
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    last_exc = None
    for attempt in range(3):
        try:
            msg = await _client.chat.completions.create(
                model=MODEL,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
                **kwargs,
            )
            return msg.choices[0].message.content.strip()
        except _RETRYABLE as e:
            last_exc = e
            print(f"[llm retry {attempt + 1}/3] {type(e).__name__}: {e}")
            await asyncio.sleep(1.5 * (2 ** attempt) + random.random())
    raise last_exc


def parse_json(raw: str):
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


async def chat_json(prompt: str, max_tokens: int = 512) -> dict:
    """One LLM call, JSON mode, parsed. Raises on failure — callers own their fallback.

    A parse failure usually means the response was truncated at max_tokens, so
    the single retry runs with double the budget.
    """
    try:
        return parse_json(await chat(prompt, max_tokens=max_tokens, json_mode=True))
    except json.JSONDecodeError as e:
        print(f"[chat_json parse retry] {e}")
        return parse_json(await chat(prompt, max_tokens=max_tokens * 2, json_mode=True))
