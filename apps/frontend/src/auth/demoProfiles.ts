import { Eye, UserCheck, Users } from "lucide-react";

export const DEMO_PROFILES = [
  {
    role: "coordinator",
    label: "Coordinadora",
    email: "coord1@impactflow.dev",
    password: "coord123",
    icon: Users,
    color: "#f58220",
  },
  {
    role: "professional",
    label: "Voluntari/a",
    email: "prof1@impactflow.dev",
    password: "prof123",
    icon: UserCheck,
    color: "#10b981",
  },
  {
    role: "donor",
    label: "Donant",
    email: "donor@impactflow.dev",
    password: "donor123",
    icon: Eye,
    color: "#f59e0b",
  },
] as const;

export function getRoleRedirect(role: string) {
  if (role === "professional") return "/professional/session-logger";
  if (role === "coordinator" || role === "admin") return "/coordinator/dashboard";
  return "/donor/impact-portal";
}
