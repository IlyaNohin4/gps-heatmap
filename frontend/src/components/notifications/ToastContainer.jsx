import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import useToastStore from '../../store/toastStore.js';
import useAppStore from '../../store/appStore.js';
import { notify } from '../../utils/notify.js';

// 76 (not 16) on top positions clears TopIsland (centered, ~64px tall +
// margin) even on narrower viewports; bottom positions use a plain 16 —
// picking a bottom corner is the user's own choice (see TopIsland's
// notification-position setting), so no special-casing for BottomIsland here.
const POSITION_STYLE = {
  'top-right': { top: 76, right: 16 },
  'top-left': { top: 76, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left': { bottom: 16, left: 16 },
};

const ICON_BY_TYPE = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

// Icon/left-border color per type. Mirrors app-wide color conventions
// (--accent for info, --danger for error) plus two colors already used
// elsewhere in the app (speed legend) for success/warning so the palette
// isn't invented from scratch.
const COLOR_BY_TYPE = {
  success: '#34c759',
  error: 'var(--danger)',
  info: 'var(--accent)',
  warning: '#ff9500',
};

// Must match globals.css's .toast-animate-out animation-duration (0.2s) —
// the store removal is delayed by this long so the exit animation gets to
// play instead of the toast just vanishing mid-transition.
const EXIT_DURATION = 200;

function ToastItem({ toast }) {
  const { id, type, message, duration, action } = toast;
  const timerRef = useRef(null);
  const remainingRef = useRef(duration);
  const startRef = useRef(null);
  const [leaving, setLeaving] = useState(false);

  function dismiss() {
    setLeaving(true);
    setTimeout(() => notify.dismiss(id), EXIT_DURATION);
  }

  useEffect(() => {
    if (duration == null) return; // persist: no auto-dismiss
    startRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, duration]);

  function handleMouseEnter() {
    if (duration == null) return;
    clearTimeout(timerRef.current);
    remainingRef.current -= Date.now() - startRef.current;
  }

  function handleMouseLeave() {
    if (duration == null) return;
    startRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, Math.max(remainingRef.current, 0));
  }

  const Icon = ICON_BY_TYPE[type] || Info;
  const color = COLOR_BY_TYPE[type] || COLOR_BY_TYPE.info;

  return (
    <div
      className={leaving ? 'toast-animate-out' : 'panel-animate-in-up'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={dismiss}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        width: 320,
        maxWidth: 'calc(100vw - 32px)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius)',
        background: 'var(--glass)',
        backdropFilter: 'blur(20px)',
        boxShadow: 'var(--shadow)',
        borderLeft: `3px solid ${color}`,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    >
      <Icon size={18} color={color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word' }}>
        {message}
        {action && (
          <button
            onClick={(e) => { e.stopPropagation(); action.onClick(); }}
            style={{
              display: 'block',
              marginTop: 'var(--space-2)',
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--accent)',
              fontWeight: 600,
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
            }}
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0, padding: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const toastPosition = useAppStore((s) => s.toastPosition);

  if (toasts.length === 0) return null;

  return (
    // Corner is a user setting (TopIsland → Display → Notifications).
    // Unbounded height (stacks/grows toward the anchored edge) — a bounded,
    // scrollable area was tried and reverted, this reads better.
    <div
      style={{
        position: 'fixed',
        zIndex: 20000,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        pointerEvents: 'none',
        ...(POSITION_STYLE[toastPosition] || POSITION_STYLE['top-right']),
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
