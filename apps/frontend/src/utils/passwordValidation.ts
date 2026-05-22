/** Requisits de contrasenya (molt permissius). */
export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 128;

export function validatePasswordLoose(password: string): string | null {
  const len = password.length;
  if (len < PASSWORD_MIN_LENGTH) {
    return `La contrasenya ha de tenir almenys ${PASSWORD_MIN_LENGTH} caràcters.`;
  }
  if (len > PASSWORD_MAX_LENGTH) {
    return `La contrasenya no pot superar ${PASSWORD_MAX_LENGTH} caràcters.`;
  }
  return null;
}

export const PASSWORD_HINT = `Mínim ${PASSWORD_MIN_LENGTH} caràcters (sense requisits especials).`;
