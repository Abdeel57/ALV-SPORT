import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "@/lib/db/__tests__/support/pg-harness";
import { sql } from "@/lib/db/sql";
import { serviceDb } from "@/lib/db/session";

/**
 * La apuesta más delicada de toda la migración: que las contraseñas que
 * escribió GoTrue sigan validando sin que nadie tenga que cambiar la suya.
 *
 * GoTrue guarda bcrypt (`$2a$…`) en `auth.users.encrypted_password`; aquí se
 * verifica con `crypt()` de pgcrypto dentro de Postgres. Estas pruebas lo
 * comprueban contra un hash bcrypt REAL generado fuera de este código.
 */

/**
 * Vectores de prueba PUBLICADOS de bcrypt (jBCrypt / OpenBSD), ajenos a
 * pgcrypto y a este proyecto. Que Postgres los reproduzca bit a bit
 * demuestra que lee el mismo formato `$2a$` que escribe GoTrue.
 */
const VECTORES: readonly (readonly [string, string])[] = [
  ["abc", "$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i"],
  [
    "abcdefghijklmnopqrstuvwxyz",
    "$2a$10$fVH8e28OQRj9tqiDXs1e1uxpsjN0c7II7YPKXua2NAKYvM6iQk7dq",
  ],
];

/** Coste 10 con prefijo $2a$: exactamente lo que guarda GoTrue. */
const BCRYPT_EXTERNO = VECTORES[1]![1];
const CLAVE_EXTERNA = VECTORES[1]![0];

let harness: Harness;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://pruebas/en-proceso";
  harness = await startHarness({ seed: false });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

describe("cuentas y contraseñas", () => {
  it("reproduce los vectores publicados de bcrypt", async () => {
    // Si esto fallara, las contraseñas existentes dejarían de validar.
    for (const [password, expected] of VECTORES) {
      const salt = expected.slice(0, 29);
      const row = await serviceDb().one<{ hash: string }>(sql`
        select crypt(${password}, ${salt}) as hash
      `);
      expect(row.hash, `vector de "${password}"`).toBe(expected);
    }
  });

  it("valida un hash bcrypt creado por otra implementación", async () => {
    // Simula una cuenta ya existente, escrita por GoTrue.
    await serviceDb().exec(sql`
      insert into auth.users (email, encrypted_password, aud, role)
      values ('heredada@liga.mx', ${BCRYPT_EXTERNO}, 'authenticated', 'authenticated')
    `);

    const { verifyCredentials } = await import("../users");
    const user = await verifyCredentials("heredada@liga.mx", CLAVE_EXTERNA);
    expect(user).not.toBeNull();
    expect(user?.email).toBe("heredada@liga.mx");

    expect(await verifyCredentials("heredada@liga.mx", "incorrecta")).toBeNull();
  });

  it("da de alta una cuenta y la deja iniciar sesión", async () => {
    const { createUser, verifyCredentials } = await import("../users");
    const created = await createUser("nueva@liga.mx", "ContrasenaLarga1");
    expect(created.email).toBe("nueva@liga.mx");

    const user = await verifyCredentials("nueva@liga.mx", "ContrasenaLarga1");
    expect(user?.id).toBe(created.id);
  });

  it("guarda la contraseña cifrada, nunca en claro", async () => {
    const row = await serviceDb().one<{ encrypted_password: string }>(sql`
      select encrypted_password from auth.users where email = 'nueva@liga.mx'
    `);
    expect(row.encrypted_password).not.toContain("ContrasenaLarga1");
    expect(row.encrypted_password.startsWith("$2")).toBe(true);
  });

  it("normaliza el correo y no distingue mayúsculas", async () => {
    const { verifyCredentials } = await import("../users");
    const user = await verifyCredentials("  NUEVA@Liga.MX  ", "ContrasenaLarga1");
    expect(user?.email).toBe("nueva@liga.mx");
  });

  it("cambia la contraseña y revoca la anterior", async () => {
    const { setPassword, verifyCredentials, findUserByEmail } = await import("../users");
    const user = await findUserByEmail("nueva@liga.mx");
    expect(user).not.toBeNull();
    if (!user) return;

    await setPassword(user.id, "OtraContrasena2");
    expect(await verifyCredentials("nueva@liga.mx", "OtraContrasena2")).not.toBeNull();
    expect(await verifyCredentials("nueva@liga.mx", "ContrasenaLarga1")).toBeNull();
  });

  it("rechaza duplicados y contraseñas cortas", async () => {
    const { createUser } = await import("../users");
    await expect(createUser("nueva@liga.mx", "OtraMas12345")).rejects.toThrow(/Ya existe/);
    await expect(createUser("corta@liga.mx", "1234")).rejects.toThrow(/8 caracteres/);
  });

  it("no revela si un correo existe", async () => {
    const { verifyCredentials } = await import("../users");
    expect(await verifyCredentials("noexiste@liga.mx", "loquesea")).toBeNull();
    expect(await verifyCredentials("", "")).toBeNull();
  });

  it("ignora cuentas sin contraseña establecida", async () => {
    const { verifyCredentials } = await import("../users");
    await serviceDb().exec(sql`
      insert into auth.users (email, aud, role)
      values ('sinclave@liga.mx', 'authenticated', 'authenticated')
    `);
    expect(await verifyCredentials("sinclave@liga.mx", "")).toBeNull();
    expect(await verifyCredentials("sinclave@liga.mx", "cualquiera")).toBeNull();
  });
});
