/**
 * Token de sesión firmado (HMAC-SHA256) — reemplaza a los JWT de GoTrue.
 *
 * No importa nada de Node: usa Web Crypto, así que el mismo código corre en
 * el middleware (runtime Edge) y en el servidor. El algoritmo está fijo en
 * el verificador, por lo que no existe la confusión de algoritmo típica de
 * JWT: un token con otra firma simplemente no valida.
 */

export interface SessionClaims {
  /** id del usuario en auth.users */
  sub: string;
  email: string;
  /** emitido en (segundos epoch) */
  iat: number;
  /** expira en (segundos epoch) */
  exp: number;
}

export const SESSION_COOKIE = "alv_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días
/** Debajo de este resto, el middleware reemite el token (sesión rodante). */
export const SESSION_REFRESH_SECONDS = 60 * 60 * 24 * 7; // 7 días

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  // ArrayBuffer explícito: Web Crypto no acepta un búfer posiblemente compartido.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "Falta AUTH_SECRET (mínimo 32 caracteres). Genera uno con: openssl rand -base64 48",
    );
  }
  return value;
}

let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(): Promise<CryptoKey> {
  const current = secret();
  if (cachedKey && cachedKey.secret === current) return cachedKey.key;
  const key = crypto.subtle.importKey(
    "raw",
    encoder.encode(current),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  cachedKey = { secret: current, key };
  return key;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Firma las claims y devuelve `payload.firma` en base64url. */
export async function signSession(
  claims: Omit<SessionClaims, "iat" | "exp"> & Partial<Pick<SessionClaims, "iat" | "exp">>,
): Promise<string> {
  const issued = claims.iat ?? nowSeconds();
  const payload: SessionClaims = {
    sub: claims.sub,
    email: claims.email,
    iat: issued,
    exp: claims.exp ?? issued + SESSION_TTL_SECONDS,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    encoder.encode(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Verifica firma y expiración. Devuelve null ante cualquier problema. */
export async function verifySession(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      base64UrlDecode(signature),
      encoder.encode(body),
    );
    if (!valid) return null;

    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    );
    if (typeof parsed !== "object" || parsed === null) return null;
    const claims = parsed as Partial<SessionClaims>;
    if (
      typeof claims.sub !== "string" ||
      typeof claims.email !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }
    if (claims.exp <= nowSeconds()) return null;
    return { sub: claims.sub, email: claims.email, iat: claims.iat, exp: claims.exp };
  } catch {
    return null;
  }
}

/** Opciones de la cookie de sesión (mismas al ponerla y al borrarla). */
export function cookieOptions(maxAgeSeconds: number): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
