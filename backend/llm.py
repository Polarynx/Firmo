"""Mistral client + JSON helpers. All LLM traffic goes through here."""
import json
import os
import re

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

MODEL = "mistral-small-latest"

_client = AsyncOpenAI(
    api_key=os.getenv("MISTRAL_API_KEY"),
    base_url="https://api.mistral.ai/v1",
)


async def chat(prompt: str, max_tokens: int = 512, json_mode: bool = False) -> str:
    kwargs = {}
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    msg = await _client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
        **kwargs,
    )
    return msg.choices[0].message.content.strip()


def parse_json(raw: str):
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


async def chat_json(prompt: str, max_tokens: int = 512) -> dict:
    """One LLM call, JSON mode, parsed. Raises on failure — callers own their fallback."""
    return parse_json(await chat(prompt, max_tokens=max_tokens, json_mode=True))
