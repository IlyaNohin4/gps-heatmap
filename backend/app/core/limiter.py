from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory storage: with a single uvicorn worker (dev) limits are exact.
# In prod (T11, --workers 2) each worker keeps its own counter, so the
# effective limit is roughly doubled. Acceptable for brute-force protection.
limiter = Limiter(key_func=get_remote_address)
