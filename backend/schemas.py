from typing import Optional

from pydantic import BaseModel


class ResearchRequest(BaseModel):
    query: str
    year_from: Optional[int] = None


class SummarizeRequest(BaseModel):
    abstract: str


class CitationRequest(BaseModel):
    title: str
    authors: list[str]
    year: Optional[int] = None
    url: Optional[str] = None
    doi: Optional[str] = None
    journal: Optional[str] = None
    style: str


class ExportRequest(BaseModel):
    papers: list[dict]
    style: str = "apa"
    format: str = "text"  # text | bibtex | ris


class DigDeepRequest(BaseModel):
    claim: str
    title: str
    abstract: str


class SynthesizeSourcesRequest(BaseModel):
    claim: str
    papers: list[dict]


class ClaimChainRequest(BaseModel):
    text: str


class MoreSourcesRequest(BaseModel):
    claim: str
    year_from: Optional[int] = None
    seen_ids: list[str] = []


class AskSourcesRequest(BaseModel):
    question: str
    claim: str
    papers: list[dict]
