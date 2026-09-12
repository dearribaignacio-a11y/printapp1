// Prueba del backend de Rindo: registro, login, elección de plan y
// suscripción por Mercado Pago (sandbox).
//
// Todo lo sensible vive en Supabase. Acá sólo hay la anon key, que es pública
// y no sirve para nada sin una sesión válida gracias a Row Level Security.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const CFG = window.RINDO_CONFIG ?? {};
const $ = (id) => document.getElementById(id);

const pantallas = ["config", "auth", "planes", "esperando", "activo", "debug"];
function mostrar(...cuales) {
  for (const p of pantallas) $("pantalla-" + p).hidden = !cuales.includes(p);
}

function aviso(el, texto, tipo = "error") {
  el.textContent = texto;
  el.className = "aviso " + tipo;
  el.hidden = !texto;
}

// --- Configuración ----------------------------------------------------------
if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("TU-PROYECTO") ||
    !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY.includes("TU-ANON-KEY")) {
  $("config-error").textContent = "Todavía no cargaste SUPABASE_URL y SUPABASE_ANON_KEY.";
  mostrar("config");
  throw new Error("Falta configurar test/config.js");
}

// persistSession: true (por defecto) guarda la sesión en localStorage,
// así no hay que loguearse cada vez que se abre la página.
const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// --- Errores de Supabase en castellano --------------------------------------
function traducirError(e) {
  const m = String(e?.message ?? e ?? "").toLowerCase();
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Ese email ya tiene una cuenta. Probá iniciar sesión.";
  if (m.includes("invalid login credentials"))
    return "Email o contraseña incorrectos.";
  if (m.includes("email not confirmed"))
    return "Falta confirmar el email. Mirá tu casilla, o desactivá la confirmación en Supabase mientras probás.";
  if (m.includes("password should be at least"))
    return "La contraseña tiene que tener al menos 6 caracteres.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Ese email no parece válido.";
  if (m.includes("for security purposes") || m.includes("rate limit"))
    return "Demasiados intentos seguidos. Esperá unos segundos.";
  if (m.includes("failed to fetch"))
    return "No se pudo conectar con Supabase. Revisá la URL del proyecto y la conexión.";
  return e?.message ?? "Ocurrió un error inesperado.";
}

// --- Pestañas registro / login ----------------------------------------------
function pestania(cual) {
  const login = cual === "login";
  $("tab-login").setAttribute("aria-selected", String(login));
  $("tab-registro").setAttribute("aria-selected", String(!login));
  $("form-login").hidden = !login;
  $("form-registro").hidden = login;
  aviso($("auth-aviso"), "");
}
$("tab-login").onclick = () => pestania("login");
$("tab-registro").onclick = () => pestania("registro");

// --- Registro ---------------------------------------------------------------
$("form-registro").onsubmit = async (ev) => {
  ev.preventDefault();
  const boton = ev.target.querySelector("button");
  boton.disabled = true;
  aviso($("auth-aviso"), "");

  const { data, error } = await supabase.auth.signUp({
    email: $("reg-email").value.trim(),
    password: $("reg-pass").value,
    // El nombre viaja en el metadata; el trigger de la base lo copia a usuarios.nombre.
    options: { data: { nombre: $("reg-nombre").value.trim() } },
  });

  boton.disabled = false;

  if (error) return aviso($("auth-aviso"), traducirError(error));

  // Supabase devuelve un "usuario fantasma" sin identidades cuando el email ya existe
  // y la confirmación por mail está activada: no filtra si la cuenta existe, pero
  // para probar conviene decirlo.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return aviso($("auth-aviso"), "Ese email ya tiene una cuenta. Probá iniciar sesión.");
  }

  if (!data.session) {
    return aviso($("auth-aviso"),
      "Cuenta creada. Confirmá el email desde tu casilla y después iniciá sesión.", "ok");
  }
  await refrescar();
};

// --- Login ------------------------------------------------------------------
$("form-login").onsubmit = async (ev) => {
  ev.preventDefault();
  const boton = ev.target.querySelector("button");
  boton.disabled = true;
  aviso($("auth-aviso"), "");

  const { error } = await supabase.auth.signInWithPassword({
    email: $("login-email").value.trim(),
    password: $("login-pass").value,
  });

  boton.disabled = false;
  if (error) return aviso($("auth-aviso"), traducirError(error));
  await refrescar();
};

$("btn-salir").onclick = async () => {
  detenerSondeo();
  await supabase.auth.signOut();
  location.href = location.pathname; // limpia los parámetros que deja Mercado Pago
};

// --- Planes -----------------------------------------------------------------
async function pintarPlanes() {
  const cont = $("lista-planes");
  const { data: planes, error } = await supabase
    .from("planes").select("*").eq("activo", true).order("orden");

  if (error) {
    cont.innerHTML = "";
    return aviso($("planes-aviso"), "No se pudieron leer los planes: " + traducirError(error));
  }

  cont.innerHTML = "";
  for (const plan of planes ?? []) {
    const div = document.createElement("div");
    div.className = "plan";

    const h3 = document.createElement("h3");
    h3.textContent = plan.nombre;

    const p = document.createElement("p");
    p.textContent = plan.descripcion ?? "";

    const precio = document.createElement("p");
    precio.className = "precio";
    precio.textContent = `$${Number(plan.precio).toLocaleString("es-AR")} / mes`;

    const boton = document.createElement("button");
    boton.textContent = "Elegir";
    boton.onclick = () => elegirPlan(plan.slug, boton);

    div.append(h3, p, precio, boton);
    cont.append(div);
  }
}

async function elegirPlan(slug, boton) {
  const botones = $("lista-planes").querySelectorAll("button");
  botones.forEach((b) => (b.disabled = true));
  boton.textContent = "Creando la suscripción…";
  aviso($("planes-aviso"), "");

  try {
    // La Edge Function pone el precio y habla con Mercado Pago.
    // Desde acá sólo viaja el nombre del plan.
    const { data, error } = await supabase.functions.invoke("crear-suscripcion", {
      body: { plan: slug },
    });

    // Cuando la función responde 4xx/5xx, supabase-js no trae el cuerpo: hay que leerlo.
    if (error) {
      let detalle = error.message;
      try { detalle = (await error.context?.json?.())?.error ?? detalle; } catch { /* sin cuerpo */ }
      throw new Error(detalle);
    }
    if (!data?.ok) throw new Error(data?.error ?? "La función no devolvió un link.");

    window.location.href = data.init_point; // al checkout de Mercado Pago
  } catch (e) {
    aviso($("planes-aviso"), "No se pudo crear la suscripción: " + traducirError(e));
    botones.forEach((b) => (b.disabled = false));
    boton.textContent = "Elegir";
  }
}

$("btn-otro-plan").onclick = () => { detenerSondeo(); mostrar("planes", "debug"); pintarPlanes(); };
$("btn-refrescar").onclick = () => refrescar();

// --- Estado del usuario -----------------------------------------------------
let sondeo = null;
function detenerSondeo() { if (sondeo) { clearInterval(sondeo); sondeo = null; } }

const NOMBRES = { hogar: "Plan Hogar", comercial: "Plan Comercial", comercial_pro: "Plan Comercial Pro" };

async function refrescar() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    detenerSondeo();
    mostrar("auth");
    return;
  }

  const { data: perfil, error } = await supabase
    .from("usuarios").select("*").eq("id", session.user.id).maybeSingle();

  const { data: subs } = await supabase
    .from("suscripciones").select("*").order("creada_en", { ascending: false }).limit(3);

  $("debug").textContent = JSON.stringify(
    { sesion: session.user.email, usuarios: perfil ?? error?.message, suscripciones: subs ?? [] }, null, 2);

  if (!perfil) {
    mostrar("planes", "debug");
    aviso($("planes-aviso"),
      "La sesión anda, pero no hay fila en usuarios. ¿Corriste la migración 0001_init.sql?", "error");
    return pintarPlanes();
  }

  const nombrePlan = NOMBRES[perfil.plan_elegido] ?? perfil.plan_elegido ?? "—";

  if (perfil.estado_pago === "activo") {
    detenerSondeo();
    $("plan-activo").textContent = `Plan activo: ${nombrePlan}`;
    const sub = (subs ?? []).find((s) => s.estado === "activo");
    $("activo-detalle").textContent = sub?.fecha_vencimiento
      ? `Próximo cobro: ${new Date(sub.fecha_vencimiento).toLocaleDateString("es-AR")}`
      : "Suscripción confirmada por Mercado Pago.";
    return mostrar("activo", "debug");
  }

  if (perfil.estado_pago === "pendiente") {
    $("esperando-detalle").textContent = `${nombrePlan} · pendiente de pago`;
    mostrar("esperando", "debug");
    if (!sondeo) sondeo = setInterval(refrescar, 4000); // el webhook puede tardar unos segundos
    return;
  }

  detenerSondeo();
  mostrar("planes", "debug");
  if (["cancelado", "rechazado", "pausado"].includes(perfil.estado_pago)) {
    aviso($("planes-aviso"), `La suscripción quedó en "${perfil.estado_pago}". Podés elegir un plan de nuevo.`, "info");
  }
  await pintarPlanes();
}

// La sesión persiste en localStorage: al volver del checkout ya está logueado.
supabase.auth.onAuthStateChange(() => refrescar());
refrescar();
