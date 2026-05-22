const USERNAME_RE = /^[a-zA-Z0-9._]+$/;

export function validateUsername(value: string): string | null {
  const v = value.trim();
  if (v.length < 3) return "El nom d'usuari ha de tenir almenys 3 caràcters.";
  if (!USERNAME_RE.test(v)) {
    return "Només lletres, números, punts i guions baixos.";
  }
  return null;
}
