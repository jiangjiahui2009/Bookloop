from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str


class BookResponse(BaseModel):
    book_id: str
    book_name: str
    author: str
    message: str
    match_reason: str


class ChatResponse(BaseModel):
    responses: list[BookResponse]


class AddBookRequest(BaseModel):
    name: str
    author: str = ""
    from_library: bool = False


class AddBookResponse(BaseModel):
    success: bool
    book: dict | None = None
    error: str | None = None
