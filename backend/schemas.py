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


class DraftCheckRequest(BaseModel):
    text: str
    # Sources already saved to the active project, so the coach can spot claims the
    # student's own bibliography covers ("backed") instead of re-recommending them.
    saved_papers: list[dict] = []


class PaperChatRequest(BaseModel):
    messages: list[dict]  # [{"role": "user"|"assistant", "content": str}, ...]
    papers: list[dict]
    project_name: str = ""


class AnnotatedBibRequest(BaseModel):
    papers: list[dict]
    thesis: str = ""
    style: str = "apa"


class OutlineRequest(BaseModel):
    papers: list[dict]
    thesis: str = ""


class ArgumentReviewRequest(BaseModel):
    text: str


class CheckCitationsRequest(BaseModel):
    text: str


class QuotesRequest(BaseModel):
    pdf_url: str
    query: str
    title: str = ""


class MoreSourcesRequest(BaseModel):
    claim: str
    year_from: Optional[int] = None
    seen_ids: list[str] = []


class AskSourcesRequest(BaseModel):
    question: str
    claim: str
    papers: list[dict]


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class SyncProject(BaseModel):
    id: str
    name: str = "Untitled paper"
    # Sources, draft, and chat. Kept opaque here so the client can add to a
    # project's contents without a schema change on both sides.
    data: dict = {}
    # Milliseconds since the epoch, from the client's clock: it is the only
    # clock that knows when the student actually made the edit.
    updated_at: int = 0
    deleted: bool = False


class SyncRequest(BaseModel):
    projects: list[SyncProject] = []


class ImportRequest(BaseModel):
    text: str
    # auto | ris | bibtex | doi. "auto" is what the UI sends; the explicit
    # values exist so an uploaded .bib is not re-sniffed and mis-detected.
    format: str = "auto"


class DocxExportRequest(BaseModel):
    # The draft itself, which may legitimately be empty when a student only
    # wants the works-cited page.
    text: str = ""
    papers: list[dict] = []
    style: str = "apa"
    title: str = ""
    author: str = ""
