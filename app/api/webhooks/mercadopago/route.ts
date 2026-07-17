import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMpPayment } from "@/lib/admin/mercadopago";

/**
 * Verifica el header `x-signature` de Mercado Pago (HMAC-SHA256 sobre el
 * manifiesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con la clave
 * secreta del webhook). Si MP_WEBHOOK_SECRET no está configurada aún, se
 * omite la verificación — la seguridad real sigue siendo que el estado del
 * pago se consulta de vuelta a la API de MP, nunca se cree del cuerpo.
 */
function verifyMpSignature(request: NextRequest): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = request.headers.get("x-signature") ?? "";
  const parts = new Map(
    signature.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim() ?? "", rest.join("=").trim()] as const;
    }),
  );
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!ts || !v1) return false;

  const dataId = request.nextUrl.searchParams.get("data.id") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const received = Buffer.from(v1, "utf8");
  const computed = Buffer.from(expected, "utf8");
  return received.length === computed.length && timingSafeEqual(received, computed);
}

/**
 * Webhook de Mercado Pago: al aprobarse un pago, activa la inscripción.
 * La verdad se consulta de vuelta a la API de MP (nunca se confía en el
 * cuerpo del webhook) y la escritura usa la service key (el webhook no
 * tiene sesión de usuario). Idempotente: re-notificar no cambia nada.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "No configurado" }, { status: 503 });
  }
  if (!verifyMpSignature(request)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let paymentId: string | null = null;
  try {
    const body = (await request.json()) as {
      type?: string;
      data?: { id?: string | number };
    };
    if (body.type === "payment" && body.data?.id !== undefined) {
      paymentId = String(body.data.id);
    }
  } catch {
    // Cuerpo no-JSON: MP también notifica por query params.
  }
  paymentId ??= request.nextUrl.searchParams.get("data.id") ?? request.nextUrl.searchParams.get("id");
  if (!paymentId) return NextResponse.json({ received: true });

  const payment = await fetchMpPayment(paymentId);
  if (!payment?.externalReference) return NextResponse.json({ received: true });

  if (payment.status === "approved") {
    const supabase = createClient(url, serviceKey);
    await supabase
      .from("registrations")
      .update({
        status: "paid",
        payment_method: "mercado_pago",
        payment_ref: paymentId,
      })
      .eq("id", payment.externalReference)
      .neq("status", "paid");
  }
  return NextResponse.json({ received: true });
}
