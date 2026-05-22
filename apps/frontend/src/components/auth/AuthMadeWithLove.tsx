import { Heart } from "lucide-react";

export default function AuthMadeWithLove() {
  return (
    <footer className="auth-made-by">
      <p>
        Fet amb{" "}
        <Heart size={13} className="auth-made-by-heart" fill="currentColor" aria-hidden />{" "}
        <strong>ImpactFlow</strong>
      </p>
    </footer>
  );
}
