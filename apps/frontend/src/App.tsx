import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import LoginPage from "./pages/Login";
import AdminControlCenterPage from "./pages/admin/AdminControlCenter";
import OverviewPage from "./pages/Overview";
import ProgramDashboardPage from "./pages/coordinator/ProgramDashboard";
import ReportsPage from "./pages/coordinator/ReportsPage";
import MicroGoalsPage from "./pages/coordinator/MicroGoalsPage";
import ParticipantsPage from "./pages/coordinator/ParticipantsPage";
import ParticipantProfile from "./pages/coordinator/ParticipantProfile";
import PlansPage from "./pages/coordinator/PlansPage";
import UsersRolesPage from "./pages/coordinator/UsersRolesPage";
import ImpactPortalPage from "./pages/donor/ImpactPortal";
import SessionLoggerPage from "./pages/professional/SessionLogger";
import { useAuthStore } from "./stores/authStore";

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  if (role && !allowedRoles.includes(role)) return <Navigate to="/donor/impact-portal" replace />;
  return <>{children}</>;
}

export default function App() {
  const role = useAuthStore((s) => s.role);
  const defaultPath =
    role === "professional"
      ? "/professional/session-logger"
      : role === "admin"
        ? "/admin/control-center"
        : role === "coordinator"
        ? "/coordinator/dashboard"
        : "/donor/impact-portal";

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin/control-center"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AppShell>
              <AdminControlCenterPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/overview"
        element={
          <ProtectedRoute allowedRoles={["professional", "coordinator", "admin", "donor", "viewer"]}>
            <AppShell>
              <OverviewPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/professional/session-logger"
        element={
          <ProtectedRoute allowedRoles={["professional", "coordinator", "admin"]}>
            <AppShell>
              <SessionLoggerPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/dashboard"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <AppShell>
              <ProgramDashboardPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/reports"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <AppShell>
              <ReportsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/micro-goals"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin", "professional"]}>
            <AppShell>
              <MicroGoalsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/participants"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin", "professional"]}>
            <AppShell>
              <ParticipantsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/participants/:participantId"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin", "professional"]}>
            <AppShell>
              <ParticipantProfile />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/users"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <AppShell>
              <UsersRolesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/plans"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <AppShell>
              <PlansPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/donor/impact-portal"
        element={
          <AppShell>
            <ImpactPortalPage />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}
