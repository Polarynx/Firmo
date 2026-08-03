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
    # The rest of the paper. The chat could only see the sources, so it could
    # answer "what do these say about X" and nothing else — not "does this
    # section work", not "how should I word this", not "what am I missing",
    # which are the questions someone actually has at 2am with a half-written
    # draft open. All optional: a chat opened before any of this exists still
    # works, it just knows less.
    question: str = ""
    outline: list[dict] = []
    draft: str = ""


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
    # The shape the original search was judged under. Without it these papers are
    # scored against the generic role hints and land in the same stacks reading
    # "Supports" while everything around them reads "Effect estimate".
    question_shape: Optional[str] = None


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


class RecordEvent(BaseModel):
    # Client-generated, so a retried flush appends once rather than twice.
    id: str
    kind: str
    # Milliseconds since the epoch, from the client's clock: an event logged
    # offline should keep the time it actually happened.
    at: int = 0
    payload: dict = {}


class RecordAppendRequest(BaseModel):
    project_id: str
    events: list[RecordEvent] = []


class ResolveRequest(BaseModel):
    """What an external client knows about the page a student is looking at."""
    url: str = ""
    doi: str = ""
    title: str = ""
    # Free text scraped from the page, used only as a last resort to find a DOI.
    hint: str = ""


class SaveSourceRequest(BaseModel):
    project_id: str = ""
    paper: dict = {}
    # Where the save came from: "extension", "docs", "word". Recorded, so the
    # process record can show that a source was captured while reading rather
    # than found through Firmo's own search.
    origin: str = "extension"


class CorpusIngestRequest(BaseModel):
    project_id: str
    # The saved sources to read. Only those already carrying an open-access PDF
    # link are fetched; the rest are reported back as skipped.
    papers: list[dict] = []


class CorpusSearchRequest(BaseModel):
    project_id: str
    claim: str
    top_k: int = 4


class ShareRequest(BaseModel):
    project_id: str
    title: str = ""
    author: str = ""


class DocxExportRequest(BaseModel):
    # The draft itself, which may legitimately be empty when a student only
    # wants the works-cited page.
    text: str = ""
    papers: list[dict] = []
    style: str = "apa"
    title: str = ""
    author: str = ""
