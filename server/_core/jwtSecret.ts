/**
 * Central JWT secret loader.
 *
 * There is intentionally no built-in fallback: predictable fallback secrets turn
 * a missing environment variable into an authentication bypass. Every runtime
 * that signs or verifies SUPPLEY session/file tokens must provide JWT_SECRET.
 */
export function getJwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET?.trim();

  if (!raw) {
    throw new Error("JWT_SECRET environment variable not configured");
  }

  if (raw.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }

  return new TextEncoder().encode(raw);
}
