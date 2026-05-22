import { Navigate, Route, Routes } from "react-router-dom";
import { RoleLayout } from "./components/layout/MobileShell";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import AdminControlCenterPage from "./pages/admin/AdminControlCenter";
import OverviewPage from "./pages/Overview";
import ProgramDashboardPage from "./pages/coordinator/ProgramDashboard";
import ReportsPage from "./pages/coordinator/ReportsPage";
import MicroGoalsPage from "./pages/coordinator/MicroGoalsPage";
import ParticipantsPage from "./pages/coordinator/ParticipantsPage";
import ParticipantProfile from "./pages/coordinator/ParticipantProfile";
import PlansPage from "./pages/coordinator/PlansPage";
import UsersRolesPage from "./pages/coordinator/UsersRolesPage";
import SchoolsPage from "./pages/coordinator/SchoolsPage";
import GestioPage from "./pages/coordinator/GestioPage";
import LandingEditorPage from "./pages/coordinator/LandingEditorPage";
import ImpactPortalPage from "./pages/donor/ImpactPortal";
import SessionLoggerPage from "./pages/professional/SessionLogger";
import ProgramsPage from "./pages/coordinator/ProgramsPage";
import SessionsHistoryPage from "./pages/coordinator/SessionsHistoryPage";
import AdvancedAnalyticsPage from "./pages/coordinator/AdvancedAnalyticsPage";
import DataSimulationPage from "./pages/coordinator/DataSimulationPage";
import ProgressPage from "./pages/voluntari/ProgressPage";
import SeguimentPage from "./pages/voluntari/SeguimentPage";
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
  return <RoleLayout>{children}</RoleLayout>;
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
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/voluntari/session-logger" element={<Navigate to="/professional/session-logger" replace />} />
      <Route
        path="/admin/control-center"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminControlCenterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/overview"
        element={
          <ProtectedRoute allowedRoles={["professional", "coordinator", "admin", "donor", "viewer"]}>
            <OverviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professional/session-logger"
        element={
          <ProtectedRoute allowedRoles={["professional", "coordinator", "admin"]}>
            <SessionLoggerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/voluntari/progress"
        element={
          <ProtectedRoute allowedRoles={["professional", "coordinator", "admin"]}>
            <ProgressPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/voluntari/seguiment"
        element={
          <ProtectedRoute allowedRoles={["professional", "coordinator", "admin"]}>
            <SeguimentPage />
          </ProtectedRoute>
        }
      />
      <Route path="/voluntari/avaluacio" element={<Navigate to="/voluntari/seguiment" replace />} />
      <Route
        path="/coordinator/dashboard"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <ProgramDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/schools"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <SchoolsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/gestio"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <GestioPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/landing"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <LandingEditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/reports"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/micro-goals"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin", "professional"]}>
            <MicroGoalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/participants"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin", "professional"]}>
            <ParticipantsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/participants/:participantId"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin", "professional"]}>
            <ParticipantProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/programs"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <ProgramsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/sessions"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin", "professional"]}>
            <SessionsHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/advanced"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <AdvancedAnalyticsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/simulation"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <DataSimulationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coordinator/users"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <UsersRolesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/plans"
        element={
          <ProtectedRoute allowedRoles={["coordinator", "admin"]}>
            <PlansPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/donor/impact-portal"
        element={
          <RoleLayout>
            <ImpactPortalPage />
          </RoleLayout>
        }
      />
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}
