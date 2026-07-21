from fastapi import APIRouter, Depends, HTTPException
from celery.result import AsyncResult

from app.core.deps import get_current_user
from app.core.redis_client import redis_client
from app.models.user import User
from app.tasks.celery_app import celery_app

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}/status")
def get_task_status(task_id: str, current_user: User = Depends(get_current_user)):
    owner_id = redis_client.get(f"task_owner:{task_id}")
    if owner_id is None or int(owner_id) != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")

    result = AsyncResult(task_id, app=celery_app)
    payload: dict = {"task_id": task_id, "state": result.state}
    if result.state == "PROGRESS":
        payload["step"] = (result.info or {}).get("step")
    elif result.state == "SUCCESS":
        payload["result"] = result.result
    elif result.state == "FAILURE":
        payload["detail"] = str(result.info)
    return payload
