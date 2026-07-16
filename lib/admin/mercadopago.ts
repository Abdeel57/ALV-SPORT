import "server-only";

/**
 * Integración mínima con Mercado Pago (Checkout Pro) vía REST, sin SDK.
 * Requiere MP_ACCESS_TOKEN en el entorno. El webhook
 * (/api/webhooks/mercadopago) confirma el pago y activa la inscripción.
 */

export function hasMercadoPago(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

export async function createMpPreference(input: {
  registrationId: string;
  title: string;
  amount: number;
}): Promise<string> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Mercado Pago no está configurado (MP_ACCESS_TOKEN). Usa pago en efectivo o configura la credencial.",
    );
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          title: input.title,
          quantity: 1,
          currency_id: "MXN",
          unit_price: input.amount,
        },
      ],
      external_reference: input.registrationId,
      notification_url: `${siteUrl}/api/webhooks/mercadopago`,
      back_urls: { success: `${siteUrl}/admin/inscripciones?ok=1` },
    }),
  });
  if (!response.ok) {
    throw new Error(`Mercado Pago respondió ${response.status}`);
  }
  const data = (await response.json()) as { init_point?: string };
  if (!data.init_point) throw new Error("Mercado Pago no regresó el link de pago");
  return data.init_point;
}

export async function fetchMpPayment(paymentId: string): Promise<{
  status: string;
  externalReference: string | null;
} | null> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return null;
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    status?: string;
    external_reference?: string;
  };
  return {
    status: data.status ?? "unknown",
    externalReference: data.external_reference ?? null,
  };
}
