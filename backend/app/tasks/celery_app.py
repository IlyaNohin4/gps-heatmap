from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "gps_heatmap",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.process_track"],  # explicit — autodiscover would look for app.tasks.tasks
)
