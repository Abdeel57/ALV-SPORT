import { describe, expect, it } from "vitest";
import { normalizeContact } from "../contact";
import { formatWinPct } from "@/lib/utils";

describe("normalizeContact", () => {
  it("convierte un número de WhatsApp de 10 dígitos a wa.me con lada de México", () => {
    expect(normalizeContact("55 1234 5678")).toBe("https://wa.me/525512345678");
    expect(normalizeContact("+52 1 55 1234 5678")).toBe("https://wa.me/5215512345678");
  });

  it("respeta enlaces y correos", () => {
    expect(normalizeContact("https://wa.me/525512345678")).toBe("https://wa.me/525512345678");
    expect(normalizeContact("wa.me/525512345678")).toBe("https://wa.me/525512345678");
    expect(normalizeContact("liga@ejemplo.mx")).toBe("mailto:liga@ejemplo.mx");
    expect(normalizeContact("mailto:liga@ejemplo.mx")).toBe("mailto:liga@ejemplo.mx");
  });

  it("rechaza lo que no es contacto", () => {
    expect(normalizeContact("")).toBeNull();
    expect(normalizeContact("hola")).toBeNull();
    expect(normalizeContact("123")).toBeNull();
  });
});

describe("formatWinPct", () => {
  it("usa milésimas sin cero inicial, estilo béisbol", () => {
    expect(formatWinPct(0.75)).toBe(".750");
    expect(formatWinPct(0)).toBe(".000");
    expect(formatWinPct(1)).toBe("1.000");
    expect(formatWinPct(2 / 3)).toBe(".667");
  });
});
