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
    AuthenticationError,
    InternalServerError,
    RateLimitError,
)

load_dotenv()

MODEL = "mistral-small-latest"
EMBED_MODEL = "mistral-embed"

_client = AsyncOpenAI(
    api_key=os.getenv("MISTRAL_API_KEY"),
    base_url="https://api.mistral.ai/v1",
)

# Mistral throws intermittent 429s and 503 "capacity exceeded" errors; these are
# retryable and must never surface to the student as a degraded experience.
_RETRYABLE = (RateLimitError, InternalServerError, APIConnectionError, APITimeoutError)


async def chat(prompt: str, max_tokens: int = 512, json_mode: bool = False,
               temperature: float | None = None) -> str:
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    if temperature is not None:
        kwargs["temperature"] = temperature
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
        except AuthenticationError as e:
            # A bad/expired key fails every call, so surface it loudly instead of
            # silently degrading to fallbacks on every request.
            print(f"[llm AUTH ERROR] Mistral rejected the API key. Check MISTRAL_API_KEY "
                  f"in backend/.env and RESTART the server. {e}")
            raise
        except _RETRYABLE as e:
            last_exc = e
            print(f"[llm retry {attempt + 1}/3] {type(e).__name__}: {e}")
            await asyncio.sleep(1.5 * (2 ** attempt) + random.random())
    raise last_exc


async def chat_stream(messages: list[dict], max_tokens: int = 512,
                      temperature: float | None = None):
    """Stream a chat completion as text deltas (async generator).

    Takes a full message list (system/user/assistant) rather than a bare prompt,
    since streaming is used for the multi-turn source chat. Retries transient
    errors only while nothing has been yielded yet; once text has streamed out,
    a mid-stream failure raises so the caller can surface it, because silently
    restarting would duplicate the partial answer.
    """
    last_exc = None
    for attempt in range(3):
        yielded = False
        try:
            stream = await _client.chat.completions.create(
                model=MODEL,
                max_tokens=max_tokens,
                messages=messages,
                stream=True,
                **({"temperature": temperature} if temperature is not None else {}),
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue
                text = chunk.choices[0].delta.content
                if text:
                    yielded = True
                    yield text
            return
        except AuthenticationError as e:
            print(f"[llm AUTH ERROR] Mistral rejected the API key. Check MISTRAL_API_KEY "
                  f"in backend/.env and RESTART the server. {e}")
            raise
        except _RETRYABLE as e:
            if yielded:
                raise
            last_exc = e
            print(f"[llm stream retry {attempt + 1}/3] {type(e).__name__}: {e}")
            await asyncio.sleep(1.5 * (2 ** attempt) + random.random())
    raise last_exc


async def embed_texts(texts: list[str], batch_size: int = 32) -> list:
    """Batch-embed texts for semantic relevance ranking.

    Returns one vector per input, with None in any slot that failed. Embeddings
    are an enhancement, never a hard dependency, so this never raises. Batches run
    in parallel; a batch that keeps failing leaves its slots None and the caller
    falls back to lexical scoring.
    """
    if not texts:
        return []
    out: list = [None] * len(texts)

    async def do_batch(start: int, chunk: list[str]) -> None:
        payload = [(t if (t and t.strip()) else " ")[:2000] for t in chunk]
        for attempt in range(3):
            try:
                resp = await _client.embeddings.create(model=EMBED_MODEL, input=payload)
                for i, d in enumerate(resp.data):
                    out[start + i] = d.embedding
                return
            except _RETRYABLE as e:
                print(f"[embed retry {attempt + 1}/3] {type(e).__name__}: {e}")
                await asyncio.sleep(1.0 * (2 ** attempt) + random.random())
            except Exception as e:
                print(f"[embed batch ERROR] {type(e).__name__}: {e}")
                return

    batches = [(s, texts[s:s + batch_size]) for s in range(0, len(texts), batch_size)]
    await asyncio.gather(*(do_batch(s, c) for s, c in batches))
    return out


def parse_json(raw: str):
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


async def chat_json(prompt: str, max_tokens: int = 512,
                    temperature: float | None = None) -> dict:
    """One LLM call, JSON mode, parsed. Raises on failure so callers own their fallback.

    A parse failure usually means the response was truncated at max_tokens, so
    the single retry runs with double the budget. Pass temperature=0 for tasks that
    must be deterministic (e.g. claim verdicts that should not flip between runs).
    """
    try:
        return parse_json(await chat(prompt, max_tokens=max_tokens, json_mode=True, temperature=temperature))
    except json.JSONDecodeError as e:
        print(f"[chat_json parse retry] {e}")
        return parse_json(await chat(prompt, max_tokens=max_tokens * 2, json_mode=True, temperature=temperature))
