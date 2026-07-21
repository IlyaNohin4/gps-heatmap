/** FastAPI returns `detail` as a plain string for most errors, but as an
 * array of Pydantic validation-error objects ({loc, msg, type}) on 422 —
 * passing that array straight to toast.error() renders "[object Object]".
 * Normalize either shape into a single readable string. */
export function apiErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => e.msg || JSON.stringify(e)).join('; ');
  }
  return fallback;
}
