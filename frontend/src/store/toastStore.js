import { create } from 'zustand';

// Backing store for the custom toast system (utils/notify.js +
// components/notifications/ToastContainer.jsx) — replaces react-toastify.
// Toasts are plain data here; all rendering/animation/timing lives in the
// container component, this store just holds the queue.
let nextId = 1;

const useToastStore = create((set, get) => ({
  toasts: [],

  push: ({ type, message, duration, action }) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, type, message, duration, action }] }));
    return id;
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export default useToastStore;
