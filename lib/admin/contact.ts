/**
 * Normaliza lo que el admin escribe como contacto de la liga a un enlace:
 * número de WhatsApp (10 dígitos → +52), correo o URL. Devuelve null si no
 * se reconoce nada útil.
 */
export function normalizeContact(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(text)) return text;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `mailto:${text}`;
  if (/^(wa\.me|api\.whatsapp\.com|www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(text)) return `https://${text}`;
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 10 && /^[\d\s()+.-]+$/.test(text)) {
    return `https://wa.me/${digits.length === 10 ? `52${digits}` : digits}`;
  }
  return null;
}
