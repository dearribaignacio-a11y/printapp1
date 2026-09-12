// POST /functions/v1/webhook-mercadopago
//
// Lo llama Mercado Pago, no el navegador. Va con verify_jwt = false
// (ver supabase/config.toml): MP no tiene un JWT de Supabase para mandar.
// A cambio validamos la firma x-signature con el secret del webhook.
//
// Qué hace:
//   1. Valida la firma.
//   2. Le pregunta a Mercado Pago el estado REAL de la suscripción
//      (nunca confía en el cuerpo de la notificación).
//   3. Si está "authorized", pone al usuario en "activo".
//
// Siempre responde 200: si devolvemos error, MP reintenta durante horas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { leerReferencia, mpGet, traducirEstado } from "../_shared/mercadopago.ts";

/** manifest = id:<data.id>;request-id:<x-request-id>;ts:<ts>;  → HMAC-SHA256 hex */
async function firmaValida(req: Request, dataId: string): Promise<boolean> {
  const secret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!secret) {
    console.warn("Sin MP_WEBHOOK_SECRET: no se valida la firma (sólo aceptable en pruebas).");
    return true;
  }

  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";

  const partes = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;

  const ts = partes.ts, v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;

  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(manifest));
  const esperado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Comparación de tiempo constante.
  if (esperado.length !== v1.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0;
}

function mesQueViene(desde = new Date()): string {
  const d = new Date(desde);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  try {
    const url = new URL(req.url);
    const aviso = await req.json().catch(() => ({} as Record<string, unknown>));

    const tipo = String(aviso.type ?? aviso.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
    const dataId = String(
      (aviso.data as Record<string, unknown> | undefined)?.id ??
      aviso.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "",
    );

    console.log("webhook mercadopago:", { tipo, dataId });
    if (!dataId) return new Response("sin id", { status: 200 });

    if (!(await firmaValida(req, dataId))) {
      console.error("Firma inválida: se descarta el aviso.");
      return new Response("firma inválida", { status: 401 });
    }

    // --- Qué preapproval es -------------------------------------------------
    let preapprovalId = dataId;
    let pagoAprobado = false;

    if (tipo === "subscription_authorized_payment" || tipo === "authorized_payment") {
      // Es un cobro mensual concreto: sirve para renovar el vencimiento.
      const pago = await mpGet(`/authorized_payments/${dataId}`);
      preapprovalId = String(pago.preapproval_id ?? "");
      const detallePago = pago.payment as { status?: string } | undefined;
      pagoAprobado = String(pago.status) === "processed" || detallePago?.status === "approved";
      if (!preapprovalId) return new Response("pago sin preapproval", { status: 200 });
    } else if (tipo && !["subscription_preapproval", "preapproval"].includes(tipo)) {
      // payment, plan, invoice sueltos: no cambian el estado de la suscripción.
      console.log("Tipo ignorado:", tipo);
      return new Response("ignorado", { status: 200 });
    }

    // --- El estado real, preguntado a Mercado Pago --------------------------
    const sus = await mpGet(`/preapproval/${preapprovalId}`);
    const estado = traducirEstado(sus.status);
    const { usuarioId, plan } = leerReferencia(sus.external_reference);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const vencimiento = (sus.next_payment_date as string | undefined) ??
      (estado === "activo" ? mesQueViene() : null);

    // --- Suscripción --------------------------------------------------------
    const fila: Record<string, unknown> = {
      mercadopago_id: String(preapprovalId),
      estado,
      fecha_vencimiento: vencimiento,
      actualizada_en: new Date().toISOString(),
    };
    if (estado === "activo") fila.fecha_inicio = (sus.date_created as string) ?? new Date().toISOString();
    if (usuarioId) fila.usuario_id = usuarioId;
    if (plan) fila.plan = plan;

    const { error: errorSus } = await db
      .from("suscripciones")
      .upsert(fila, { onConflict: "mercadopago_id" });
    if (errorSus) console.error("No se pudo guardar la suscripción:", errorSus);

    // --- Usuario ------------------------------------------------------------
    if (usuarioId) {
      const cambios: Record<string, unknown> = { estado_pago: estado };
      if (plan) cambios.plan_elegido = plan;
      const { error: errorUsr } = await db.from("usuarios").update(cambios).eq("id", usuarioId);
      if (errorUsr) console.error("No se pudo actualizar el usuario:", errorUsr);
    }

    console.log("Actualizado:", { preapprovalId, estado, usuarioId, plan, pagoAprobado });
    return new Response(JSON.stringify({ ok: true, estado }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    // 200 igual: si devolvemos 500, Mercado Pago reintenta el mismo aviso durante horas.
    console.error("webhook-mercadopago:", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
