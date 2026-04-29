import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  duration?: number;
};

type ToastStore = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: Toast = { id, duration: 4500, ...t };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => get().dismiss(id), toast.duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// Conveniència
export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().push({ kind: "success", title, message }),
  error: (title: string, message?: string) =>
    useToastStore.getState().push({ kind: "error", title, message, duration: 6500 }),
  info: (title: string, message?: string) =>
    useToastStore.getState().push({ kind: "info", title, message }),
  warning: (title: string, message?: string) =>
    useToastStore.getState().push({ kind: "warning", title, message }),
};
