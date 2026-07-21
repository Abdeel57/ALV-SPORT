import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Etiqueta de temporada con su liga (modalidad): "Slowpitch Mixto · Temporada
 * 2026". Sin la liga, temporadas y divisiones homónimas de distintas
 * modalidades son indistinguibles en los selectores del panel.
 */
export function seasonLabel(
  season: { name: string; leagues: { name: string } | null } | null | undefined,
): string {
  return [season?.leagues?.name, season?.name].filter(Boolean).join(" · ")
}

/** Convierte un texto a slug URL-safe: minúsculas, sin acentos, con guiones. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

/**
 * Compara dos números de playera para ordenar un roster. El número es
 * opcional (al inscribirse aún no se reparten), así que quien no tiene número
 * va al FINAL: sin esto `Number(null)` es 0 y los colaría al principio.
 * Devuelve 0 cuando ninguno tiene número, para que el llamador desempate.
 */
export function compareJerseyNumber(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const numA = a ? Number(a) : Number.NaN
  const numB = b ? Number(b) : Number.NaN
  const okA = Number.isFinite(numA)
  const okB = Number.isFinite(numB)
  if (okA && okB) return numA - numB
  if (okA) return -1
  if (okB) return 1
  return 0
}

/** Divide un nombre completo en nombre y apellido (heurística es-MX). */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" }
  // Dos apellidos son comunes: si hay 4+ tokens, nombre = primeros 2.
  const pivot = parts.length >= 4 ? 2 : 1
  return {
    firstName: parts.slice(0, pivot).join(" "),
    lastName: parts.slice(pivot).join(" "),
  }
}
