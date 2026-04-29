import axios from "axios";
import { useAuthStore } from "../stores/authStore";
import { toast } from "../stores/toastStore";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8013/api/v1";

export const apiClient = axios.create({ baseURL });

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (error) => {
    // Skip silent endpoints (toasts on dashboard polling would be noise)
    const url: string = error?.config?.url ?? "";
    const silent = (error?.config?.headers as any)?.["X-Silent"] === "true";
    const status = error?.response?.status;

    if (status === 401) {
      // 401 on login is handled at form-level; only react globally if we already had a token
      const hadToken = !!useAuthStore.getState().accessToken;
      if (hadToken && !url.includes("/auth/login")) {
        useAuthStore.getState().clear();
        toast.warning("Sessió expirada", "Torna a iniciar sessió.");
      }
    } else if (status >= 500) {
      if (!silent) toast.error("Error del servidor", "Tornarem a provar en uns moments.");
    } else if (status === 403) {
      if (!silent) toast.warning("Permís denegat", "No tens accés a aquesta acció.");
    } else if (!error?.response) {
      if (!silent) toast.error("Sense connexió", "Comprova la connexió amb el servidor.");
    }
    return Promise.reject(error);
  }
);
