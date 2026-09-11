import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` existe para que el bundler falle si un módulo de
      // servidor llega al cliente. En pruebas de Node no aplica: se
      // reemplaza por un módulo vacío para poder ejercitar ese código.
      "server-only": fileURLToPath(
        new URL("./lib/db/__tests__/support/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // Las pruebas de integración arrancan un Postgres en proceso.
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
