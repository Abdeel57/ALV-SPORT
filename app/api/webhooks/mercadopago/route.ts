import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchMpPayment } from "@/lib/admin/mercadopago";

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
