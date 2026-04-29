import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastViewport } from "./components/common/ToastViewport";
import "./styles.css";
import "./styles/advanced-analytics.css";
import "./styles/session-logger.css";
import "./styles/modern-polish.css";
import "./styles/common-ui.css";
import "./stores/themeStore"; // boot theme from localStorage before render

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
        <ToastViewport />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
