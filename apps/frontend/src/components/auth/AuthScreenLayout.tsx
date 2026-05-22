import { ReactNode } from "react";
import AuthMadeWithLove from "./AuthMadeWithLove";
import QuickAccessCorner from "./QuickAccessCorner";

type Props = {
  children: ReactNode;
};

export default function AuthScreenLayout({ children }: Props) {
  return (
    <div className="auth-screen">
      <div className="auth-bg" aria-hidden>
        <span className="auth-bg-blob auth-bg-blob--1" />
        <span className="auth-bg-blob auth-bg-blob--2" />
        <span className="auth-bg-blob auth-bg-blob--3" />
        <span className="auth-bg-blob auth-bg-blob--4" />
        <span className="auth-bg-vignette" />
      </div>

      <QuickAccessCorner />

      <div className="auth-main">{children}</div>

      <AuthMadeWithLove />
    </div>
  );
}
