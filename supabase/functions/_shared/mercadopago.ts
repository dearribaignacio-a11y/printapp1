// Helpers compartidos por las dos Edge Functions.
// El Access Token sale SIEMPRE de las variables de entorno de Supabase.
// Nunca se manda al navegador y nunca se escribe en este repositorio.

export const MP_API = "https://api.mercadopago.com";

/** CORS: la página de prueba y el panel corren en otro dominio (Hostinger). */
export function cors(origin: string | null): Record<string, string> {
  const permitidos = (Deno.env.get("ORIGENES_PERMITIDOS") ?? "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const abierto = permitidos.includes("*");
  const ok = origin && permitidos.includes(origin);

  return {
    "Access-Control-Allow-Origin": abierto ? "*" : (ok ? origin! : permitidos[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(cuerpo: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function accessToken(): string {
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) throw new Error("Falta el secret MP_ACCESS_TOKEN en Supabase.");
  return token;
}

/** GET a la API de Mercado Pago con el token del vendedor. */
export async function mpGet(ruta: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${MP_API}${ruta}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`Mercado Pago ${r.status} en ${ruta}: ${JSON.stringify(cuerpo)}`);
  }
  return cuerpo as Record<string, unknown>;
}

/**
 * external_reference viaja hasta el webhook y vuelve.
 * Guardamos ahí el usuario y el plan para que el webhook se banque solo,
 * incluso si por algún motivo no encuentra la fila de suscripciones.
 */
export function armarReferencia(usuarioId: string, plan: string) {
  return `${usuarioId}|${plan}`;
}

export function leerReferencia(ref: unknown): { usuarioId: string | null; plan: string | null } {
  if (typeof ref !== "string" || !ref.includes("|")) return { usuarioId: null, plan: null };
  const [usuarioId, plan] = ref.split("|");
  return { usuarioId: usuarioId || null, plan: plan || null };
}

/** Estado de Mercado Pago -> estado nuestro. */
export function traducirEstado(estadoMp: unknown): "pendiente" | "activo" | "pausado" | "cancelado" | "rechazado" {
  switch (String(estadoMp)) {
    case "authorized": return "activo";
    case "paused":     return "pausado";
    case "cancelled":  return "cancelado";
    case "pending":    return "pendiente";
    default:           return "pendiente";
  }
}
