import { beforeAll, describe, expect, it } from "vitest";
import {
  nowSeconds,
  signSession,
  verifySession,
  SESSION_TTL_SECONDS,
} from "../token";

beforeAll(() => {
  process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
});

const USER = { sub: "6f1a2b3c-4d5e-4f60-8a91-b2c3d4e5f607", email: "admin@liga.mx" };

describe("token de sesión", () => {
  it("firma y verifica de ida y vuelta", async () => {
    const token = await signSession(USER);
    const claims = await verifySession(token);
    expect(claims?.sub).toBe(USER.sub);
    expect(claims?.email).toBe(USER.email);
    expect(claims?.exp).toBeGreaterThan(nowSeconds());
    expect(claims?.exp).toBeLessThanOrEqual(nowSeconds() + SESSION_TTL_SECONDS + 1);
  });

  it("rechaza un token manipulado", async () => {
    const token = await signSession(USER);
    const [body, signature] = token.split(".");
    const forged = btoa(
      JSON.stringify({ ...USER, iat: nowSeconds(), exp: nowSeconds() + 999 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySession(`${forged}.${signature}`)).toBeNull();
    expect(await verifySession(`${body}.${signature}x`)).toBeNull();
  });

  it("rechaza un token firmado con otro secreto", async () => {
    const token = await signSession(USER);
    process.env.AUTH_SECRET = "otro-secreto-distinto-de-mas-de-32-caracteres";
    expect(await verifySession(token)).toBeNull();
    process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
  });

  it("rechaza un token expirado", async () => {
    const past = nowSeconds() - 10;
    const token = await signSession({ ...USER, iat: past - 100, exp: past });
    expect(await verifySession(token)).toBeNull();
  });

  it("rechaza basura y valores vacíos", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("sin-punto")).toBeNull();
    expect(await verifySession(".")).toBeNull();
    expect(await verifySession("a.b")).toBeNull();
  });

  it("exige un secreto suficientemente largo", async () => {
    process.env.AUTH_SECRET = "corto";
    await expect(signSession(USER)).rejects.toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = "secreto-de-pruebas-con-mas-de-32-caracteres";
  });
});
