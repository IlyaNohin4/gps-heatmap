FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgdal-dev gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


FROM python:3.12-slim

WORKDIR /app

# Non-root: gcc/libgdal-dev (build-only) stay in the builder stage and never
# reach this image, and the app itself never runs as root.
RUN useradd --create-home --shell /usr/sbin/nologin appuser

# --chown so `pip install -r requirements-test.txt` still works as appuser
# in dev (docker compose exec backend ...), same as it did running as root.
COPY --from=builder --chown=appuser:appuser /install /usr/local
COPY --chown=appuser:appuser . .

# Pre-create with appuser ownership: a fresh named Docker volume mounted at
# this path (uploads_data, shared with celery_worker — see docker-compose)
# inherits whatever's already at that path in the image on first mount, root
# otherwise, which appuser can't write into.
RUN mkdir -p /app/uploads && chown appuser:appuser /app/uploads

USER appuser

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
