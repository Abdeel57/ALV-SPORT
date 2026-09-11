"use client";

import { useEffect, useRef } from "react";

/**
 * Atajos de teclado de la mesa.
 *
 * Reglas: no se activan mientras se escribe en un campo, no se disparan por
 * mantener la tecla presionada (`repeat`), ignoran combinaciones con Ctrl,
 * Alt o Meta (no pisan al navegador ni a la accesibilidad) y se pueden
 * desactivar en bloque. Las teclas se normalizan a mayúsculas.
 */

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function normalizeKey(event: KeyboardEvent): string {
  const key = event.key;
  if (key === "Escape") return "ESC";
  if (key === "Enter") return "ENTER";
  if (key === "Backspace") return "BACKSPACE";
  if (key.startsWith("Arrow")) return key.replace("Arrow", "").toUpperCase();
  if (key === "?" || (key === "/" && event.shiftKey)) return "?";
  return key.length === 1 ? key.toUpperCase() : key.toUpperCase();
}

export function useShortcuts(
  map: ShortcutMap,
  options: { enabled: boolean; allowInInputs?: string[] } = { enabled: true },
): void {
  const mapRef = useRef(map);
  mapRef.current = map;
  const { enabled, allowInInputs = ["ESC"] } = options;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat) return;
      const key = normalizeKey(event);
      if (isTyping(event.target) && !allowInInputs.includes(key)) return;
      const handler = mapRef.current[key];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, allowInInputs]);
}

/** <kbd> uniforme para mostrar el atajo junto a cada acción. */
export function keyLabel(key: string): string {
  return key === "ESC" ? "Esc" : key === "ENTER" ? "Enter" : key;
}
