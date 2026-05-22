const NARINAN_LOGO = "/images/narinan/Narinan_logo.png";

export default function AuthLogo() {
  return (
    <div className="auth-logo-wrap">
      <img
        src={NARINAN_LOGO}
        alt="Narinan"
        className="auth-logo-img"
        width={220}
        height={80}
        decoding="async"
      />
    </div>
  );
}
