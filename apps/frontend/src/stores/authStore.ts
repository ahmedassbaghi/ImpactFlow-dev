import { create } from "zustand";

type Role = "admin" | "coordinator" | "professional" | "donor" | "viewer" | null;

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  role: Role;
  userId: string | null;
  setAuth: (payload: { accessToken: string; refreshToken: string; role: Role; userId: string }) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem("if_access_token"),
  refreshToken: localStorage.getItem("if_refresh_token"),
  role: (localStorage.getItem("if_role") as Role) ?? null,
  userId: localStorage.getItem("if_user_id"),
  setAuth: ({ accessToken, refreshToken, role, userId }) => {
    localStorage.setItem("if_access_token", accessToken);
    localStorage.setItem("if_refresh_token", refreshToken);
    localStorage.setItem("if_role", role ?? "");
    localStorage.setItem("if_user_id", userId);
    set({ accessToken, refreshToken, role, userId });
  },
  clear: () => {
    localStorage.removeItem("if_access_token");
    localStorage.removeItem("if_refresh_token");
    localStorage.removeItem("if_role");
    localStorage.removeItem("if_user_id");
    set({ accessToken: null, refreshToken: null, role: null, userId: null });
  },
}));
