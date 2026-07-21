import re
from urllib.parse import quote


def safe_content_disposition(filename: str) -> str:
    """Build a Content-Disposition header value from a user-controlled
    filename. Strips CR/LF (header injection) and drops characters that
    aren't safe inside a quoted-string (browsers disagree on backslash
    escaping, so we avoid relying on it), then adds an RFC 5987 filename*
    so non-ASCII names still round-trip correctly."""
    sanitized = re.sub(r"[\r\n]", "", filename)
    ascii_fallback = re.sub(r'[\\"]', "", sanitized) or "download"
    encoded = quote(sanitized, safe="")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"
