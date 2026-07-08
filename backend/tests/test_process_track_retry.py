"""T09 — retry policy for the process_track Celery task.

Permanent errors (invalid/unparseable file) must set the track to error
immediately, without retrying. Transient errors (DB/Redis unavailable) must
propagate uncaught so Celery's autoretry_for/retry_backoff can retry them,
and must only be recorded as an error once retries are exhausted.

`_orig_run` (celery's autoretry decorator stores the undecorated function
there) plus `push_request`/`pop_request` let us drive process_track's own
try/except branches directly, without going through celery's real retry
machinery (which needs a full worker context: task id, broker, etc).
"""
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import OperationalError

from app.tasks.process_track import process_track


def _mock_track():
    track = MagicMock()
    track.id = 1
    track.file_format = "gpx"
    track.regions = []
    return track


_PARSE_RESULT = {
    "points": [{"lat": 1.0, "lon": 2.0, "elevation": None, "time": None}],
    "normalized_points": [{"lat": 1.0, "lon": 2.0, "elevation": None, "time": None}],
    "speed_segments": [],
    "distance_km": 0.0,
    "duration_sec": None,
    "speed_avg": None,
    "speed_max": None,
    "speed_min": None,
    "elevation_gain": 0.0,
    "elevation_loss": 0.0,
    "recorded_at": None,
}


class TestRetryPolicy:
    def test_task_is_configured_for_backoff_retries(self):
        assert OperationalError in process_track.autoretry_for
        assert process_track.retry_backoff is True
        assert process_track.retry_backoff_max == 60
        assert process_track.retry_jitter is True
        assert process_track.max_retries == 3

    def test_broken_file_sets_error_without_retry(self):
        """A corrupt file (parser raises ValueError) must mark the track as
        error and return immediately — no exception propagates, no retry."""
        track = _mock_track()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = track

        process_track.push_request(id="test-task-id", retries=0)
        try:
            with patch("app.tasks.process_track.SessionLocal", return_value=db), \
                 patch("app.tasks.process_track._semaphore"), \
                 patch("app.services.parser_factory.parse", side_effect=ValueError("not a valid gpx file")), \
                 patch.object(process_track, "update_state"):
                result = process_track._orig_run(track.id, b"this is not gpx content")
        finally:
            process_track.pop_request()

        assert result["status"] == "error"
        assert "not a valid gpx" in result["detail"]
        assert any(str(r).startswith("__error:") for r in track.regions)
        db.commit.assert_called()

    def test_transient_db_error_propagates_without_setting_error(self):
        """An OperationalError on commit (DB blip), with retries remaining,
        must propagate uncaught (so autoretry_for can retry it) and must
        NOT mark the track as error yet."""
        track = _mock_track()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = track
        db.commit.side_effect = OperationalError("stmt", {}, Exception("connection lost"))

        process_track.push_request(id="test-task-id", retries=0)
        try:
            with patch("app.tasks.process_track.SessionLocal", return_value=db), \
                 patch("app.tasks.process_track._semaphore"), \
                 patch("app.services.parser_factory.parse", return_value=_PARSE_RESULT), \
                 patch("app.services.regions.get_regions", return_value=[]), \
                 patch.object(process_track, "update_state"):
                with pytest.raises(OperationalError):
                    process_track._orig_run(track.id, b"<gpx></gpx>")
        finally:
            process_track.pop_request()

        assert track.regions == []

    def test_transient_db_error_sets_error_once_retries_exhausted(self):
        """Once self.request.retries reaches max_retries, a further
        transient failure must record the error before propagating."""
        track = _mock_track()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = track
        db.commit.side_effect = OperationalError("stmt", {}, Exception("connection lost"))

        process_track.push_request(id="test-task-id", retries=process_track.max_retries)
        try:
            with patch("app.tasks.process_track.SessionLocal", return_value=db), \
                 patch("app.tasks.process_track._semaphore"), \
                 patch("app.services.parser_factory.parse", return_value=_PARSE_RESULT), \
                 patch("app.services.regions.get_regions", return_value=[]), \
                 patch.object(process_track, "update_state"):
                with pytest.raises(OperationalError):
                    process_track._orig_run(track.id, b"<gpx></gpx>")
        finally:
            process_track.pop_request()

        assert any(str(r).startswith("__error:") for r in track.regions)
