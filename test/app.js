// Prueba del backend de Rindo: registro, login, elección de plan y
// suscripción por Mercado Pago (sandbox).
//
// El login y el registro salen de ../auth.js, el mismo módulo que va a usar
// el panel real. Acá sólo está el armado de las pantallas de prueba.

import {
  supabase, problemaDeConfig, traducirError,
  registrar, entrar, salir, sesionActual,
} from "../auth.js";

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
const problema = problemaDeConfig();
if (problema) {
  $("config-error").textContent = problema;
  mostrar("config");
  throw new Error(problema);
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

  const r = await registrar({
    nombre: $("reg-nombre").value,
    email: $("reg-email").value,
    password: $("reg-pass").value,
  });

  boton.disabled = false;

  if (!r.ok) return aviso($("auth-aviso"), r.error);
  if (!r.sesion) return aviso($("auth-aviso"), r.mensaje, "ok");
  await refrescar();
};

// --- Login ------------------------------------------------------------------
$("form-login").onsubmit = async (ev) => {
  ev.preventDefault();
  const boton = ev.target.querySelector("button");
  boton.disabled = true;
  aviso($("auth-aviso"), "");

  const r = await entrar({
    email: $("login-email").value,
    password: $("login-pass").value,
  });

  boton.disabled = false;

  if (!r.ok) return aviso($("auth-aviso"), r.error);
  await refrescar();
};

$("btn-salir").onclick = async () => {
  detenerSondeo();
  await salir();
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
  const sesion = await sesionActual();

  if (!sesion) {
    detenerSondeo();
    mostrar("auth");
    return;
  }

  const { data: perfil, error } = await supabase
    .from("usuarios").select("*").eq("id", sesion.user.id).maybeSingle();

  const { data: subs } = await supabase
    .from("suscripciones").select("*").order("creada_en", { ascending: false }).limit(3);

  $("debug").textContent = JSON.stringify(
    { sesion: sesion.user.email, usuarios: perfil ?? error?.message, suscripciones: subs ?? [] }, null, 2);

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

// La sesión persiste en el navegador: al volver del checkout ya está logueado.
supabase.auth.onAuthStateChange(() => refrescar());
refrescar();
