import useToastStore from '../store/toastStore.js';
import useAuthStore from '../store/authStore.js';

// Drop-in replacement for react-toastify's `toast.success/error/info/warning`
// — same call shape (message, then an options object) so call sites didn't
// need restructuring, just the import swapped. See
// components/notifications/ToastContainer.jsx for the rendering side.
const DEFAULT_DURATION = 3500;

function push(type, message, opts = {}) {
  // Errors always surface — a disabled "notifications" toggle is meant to
  // quiet success/info/warning chatter, not hide failures the user needs
  // to act on (e.g. a failed upload).
  const user = useAuthStore.getState().user;
  if (type !== 'error' && user?.notifications_enabled === false) return null;
  return useToastStore.getState().push({
    type,
    message,
    // autoClose:false in react-toastify == persist:true here (no auto-dismiss timer).
    duration: opts.persist ? null : (opts.duration ?? DEFAULT_DURATION),
    action: opts.action || null,
  });
}

export const notify = {
  success: (message, opts) => push('success', message, opts),
  error: (message, opts) => push('error', message, opts),
  info: (message, opts) => push('info', message, opts),
  warning: (message, opts) => push('warning', message, opts),
  warn: (message, opts) => push('warning', message, opts), // react-toastify alias, kept for drop-in compatibility
  dismiss: (id) => useToastStore.getState().dismiss(id),
};
