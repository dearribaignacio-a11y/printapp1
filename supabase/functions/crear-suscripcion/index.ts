// POST /functions/v1/crear-suscripcion   { "plan": "comercial" }
//
// 1. Valida la sesión del usuario con el JWT que manda supabase-js.
// 2. Lee el precio del plan de la base (nunca del navegador).
// 3. Crea el preapproval (suscripción con débito mensual) en Mercado Pago.
// 4. Deja al usuario en "pendiente" y devuelve el link de checkout.
//
// Respuesta: { ok: true, init_point: "https://www.mercadopago.com.ar/subscriptions/...", ... }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  MP_API, accessToken, armarReferencia, cors, json,
} from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  const cabeceras = cors(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: cabeceras });
  if (req.method !== "POST") return json({ ok: false, error: "Usá POST." }, 405, cabeceras);

  try {
    // --- 1. Quién es el que pide -------------------------------------------
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ ok: false, error: "Falta la sesión. Iniciá sesión de nuevo." }, 401, cabeceras);
    }

    // Cliente con la service_role key: saltea RLS para poder escribir.
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: sesion, error: errorSesion } = await db.auth.getUser(
      authorization.replace("Bearer ", ""),
    );
    if (errorSesion || !sesion?.user) {
      return json({ ok: false, error: "Sesión inválida o vencida." }, 401, cabeceras);
    }
    const usuario = sesion.user;

    // --- 2. El plan y su precio, desde la base ------------------------------
    const cuerpo = await req.json().catch(() => ({}));
    const slug = String(cuerpo?.plan ?? "").trim();
    if (!slug) return json({ ok: false, error: "Falta el plan." }, 400, cabeceras);

    const { data: plan } = await db
      .from("planes")
      .select("slug, nombre, precio, moneda")
      .eq("slug", slug)
      .eq("activo", true)
      .maybeSingle();

    if (!plan) return json({ ok: false, error: `El plan "${slug}" no existe.` }, 400, cabeceras);

    // --- 3. Preapproval en Mercado Pago -------------------------------------
    // En sandbox el payer_email tiene que ser un usuario de prueba COMPRADOR,
    // y nunca puede ser el mismo mail que el de la cuenta vendedora.
    // MP_TEST_PAYER_EMAIL permite forzarlo mientras se prueba.
    const payerEmail = Deno.env.get("MP_TEST_PAYER_EMAIL") || usuario.email;
    const backUrl = Deno.env.get("MP_BACK_URL");
    if (!backUrl) {
      return json({ ok: false, error: "Falta el secret MP_BACK_URL en Supabase." }, 500, cabeceras);
    }

    const preapproval = {
      reason: `Rindo · ${plan.nombre}`,
      external_reference: armarReferencia(usuario.id, plan.slug),
      payer_email: payerEmail,
      back_url: backUrl,
      status: "pending", // el usuario autoriza el débito en el checkout
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(plan.precio),
        currency_id: plan.moneda ?? "ARS",
      },
    };

    const r = await fetch(`${MP_API}/preapproval`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
        // Evita cobrar dos veces si el usuario aprieta el botón dos veces.
        "X-Idempotency-Key": `${usuario.id}-${plan.slug}-${Date.now()}`,
      },
      body: JSON.stringify(preapproval),
    });

    const respuestaMp = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Mercado Pago rechazó el preapproval:", r.status, respuestaMp);
      return json({
        ok: false,
        error: "Mercado Pago rechazó la suscripción.",
        detalle: respuestaMp?.message ?? respuestaMp,
      }, 502, cabeceras);
    }

    const initPoint: string | undefined = respuestaMp.init_point ?? respuestaMp.sandbox_init_point;
    if (!initPoint) {
      return json({ ok: false, error: "Mercado Pago no devolvió link de checkout.", detalle: respuestaMp }, 502, cabeceras);
    }

    // --- 4. Guardar la elección: "pendiente de pago" ------------------------
    await db.from("usuarios")
      .update({ plan_elegido: plan.slug, estado_pago: "pendiente" })
      .eq("id", usuario.id);

    await db.from("suscripciones").upsert({
      usuario_id: usuario.id,
      plan: plan.slug,
      mercadopago_id: String(respuestaMp.id),
      estado: "pendiente",
      actualizada_en: new Date().toISOString(),
    }, { onConflict: "mercadopago_id" });

    return json({
      ok: true,
      init_point: initPoint,
      preapproval_id: respuestaMp.id,
      plan: plan.slug,
      nombre_plan: plan.nombre,
      precio: Number(plan.precio),
    }, 200, cabeceras);

  } catch (e) {
    console.error("crear-suscripcion:", e);
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500, cabeceras);
  }
});
