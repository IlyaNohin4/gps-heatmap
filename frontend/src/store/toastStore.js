import { create } from 'zustand';

// Backing store for the custom toast system (utils/notify.js +
// components/notifications/ToastContainer.jsx) — replaces react-toastify.
// Toasts are plain data here; all rendering/animation/timing lives in the
// container component, this store just holds the queue.
let nextId = 1;

// At most this many toasts on screen at once — a burst (e.g. several
// uploads finishing close together) used to stack up unboundedly and
// cover a chunk of the map. Newest wins: pushing past the cap silently
// drops the oldest toast rather than queuing it to appear later once
// older ones clear, which read as toasts "coming back" after being
// dismissed.
const MAX_VISIBLE = 2;

const useToastStore = create((set, get) => ({
  toasts: [],

  push: ({ type, message, duration, action }) => {
    const id = nextId++;
    set((s) => ({
      toasts: [...s.toasts, { id, type, message, duration, action }].slice(-MAX_VISIBLE),
    }));
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export default useToastStore;
