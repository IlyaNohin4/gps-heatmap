"""Tests for safe_content_disposition — filename encoding for downloads."""
from app.core.http_utils import safe_content_disposition


def test_cyrillic_filename_does_not_crash_and_has_ascii_fallback():
    header = safe_content_disposition("Трек.gpx")
    # The header value itself must be encodable as latin-1, matching what
    # Starlette/ASGI actually does when sending the response.
    header.encode("latin-1")
    assert 'filename="' in header
    # ascii_fallback must not contain the raw Cyrillic bytes
    fallback_part = header.split('filename="')[1].split('"')[0]
    fallback_part.encode("ascii")


def test_cyrillic_filename_utf8_star_preserves_real_name():
    header = safe_content_disposition("Трек.gpx")
    assert "filename*=UTF-8''" in header
    assert "%D0%A2%D1%80%D0%B5%D0%BA.gpx" in header


def test_ascii_filename_unchanged():
    header = safe_content_disposition("track.gpx")
    assert 'filename="track.gpx"' in header


def test_filename_with_quotes_and_backslashes_sanitized():
    header = safe_content_disposition('evil"name\\.gpx')
    fallback_part = header.split('filename="')[1].split('"')[0]
    assert '"' not in fallback_part
    assert "\\" not in fallback_part


def test_empty_ascii_fallback_defaults_to_download():
    # Purely non-ASCII name — fallback would be empty without the "or download" guard
    header = safe_content_disposition("Трек.gpx".replace(".gpx", ""))
    fallback_part = header.split('filename="')[1].split('"')[0]
    assert fallback_part == "download"


def test_crlf_injection_stripped():
    header = safe_content_disposition("evil\r\nX-Injected: true.gpx")
    assert "\r" not in header
    assert "\n" not in header
