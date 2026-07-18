import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
