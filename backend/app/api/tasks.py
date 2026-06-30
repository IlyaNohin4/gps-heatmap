from fastapi import APIRouter, HTTPException
from celery.result import AsyncResult

from app.tasks.celery_app import celery_app

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}/status")
def get_task_status(task_id: str):
    result = AsyncResult(task_id, app=celery_app)
    payload: dict = {"task_id": task_id, "state": result.state}
    if result.state == "PROGRESS":
        payload["step"] = (result.info or {}).get("step")
    elif result.state == "SUCCESS":
        payload["result"] = result.result
    elif result.state == "FAILURE":
        payload["detail"] = str(result.info)
    return payload
