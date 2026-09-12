// Prueba de seguridad: demuestra que los datos no salen de la base sin haber
// pasado por la contraseña, y que cada uno ve sólo lo suyo.
//
// No prueba el código de esta página: prueba las políticas de la base. Si
// alguna comprobación falla, el problema está en Supabase, no acá.

import { supabase, problemaDeConfig, entrar, salir, sesionActual } from "../auth.js";

const $ = (id) => document.getElementById(id);

const problema = problemaDeConfig();
if (problema) {
  $("config-error").textContent = problema;
  $("pantalla-config").hidden = false;
  $("pantalla-form").hidden = true;
  throw new Error(problema);
}

const pruebas = [];
function anotar(nombre, pasa, detalle) {
  pruebas.push({ nombre, pasa, detalle });
}

async function correr(email, password) {
  pruebas.length = 0;

  // Punto de partida limpio: nadie logueado.
  await salir();

  // --- Sin sesión: la base no tiene que entregar nada -----------------------
  {
    const { data, error } = await supabase.from("usuarios").select("*");
    anotar("Sin sesión, leer usuarios devuelve 0 filas",
      !error && (data ?? []).length === 0,
      error ? `error: ${error.message}` : `filas: ${(data ?? []).length}`);
  }
  {
    const { data, error } = await supabase.from("suscripciones").select("*");
    anotar("Sin sesión, leer suscripciones devuelve 0 filas",
      !error && (data ?? []).length === 0,
      error ? `error: ${error.message}` : `filas: ${(data ?? []).length}`);
  }
  {
    // Este SÍ tiene que verse: es el catálogo de precios, es público a propósito.
    const { data } = await supabase.from("planes").select("*");
    anotar("Sin sesión, los planes sí se ven (son públicos a propósito)",
      (data ?? []).length > 0, `planes: ${(data ?? []).length}`);
  }

  // --- Contraseña equivocada: no se emite sesión ----------------------------
  {
    const r = await entrar({ email, password: password + "-mal-a-proposito" });
    const sesion = await sesionActual();
    anotar("Con la contraseña equivocada NO se inicia sesión",
      !r.ok && !sesion, r.ok ? "entró igual" : `rechazado: ${r.error}`);
  }
  {
    const { data } = await supabase.from("usuarios").select("*");
    anotar("Después del intento fallido sigue sin entregar datos",
      (data ?? []).length === 0, `filas: ${(data ?? []).length}`);
  }

  // --- Contraseña correcta --------------------------------------------------
  const login = await entrar({ email, password });
  anotar("Con la contraseña correcta sí inicia sesión",
    login.ok, login.ok ? `usuario: ${login.usuario.email}` : `rechazado: ${login.error}`);

  if (!login.ok) return;   // sin sesión no tiene sentido seguir
  const uid = login.usuario.id;

  // --- Con sesión: sólo la fila propia --------------------------------------
  {
    const { data, error } = await supabase.from("usuarios").select("*");
    const filas = data ?? [];
    anotar("Con sesión, usuarios devuelve exactamente 1 fila",
      !error && filas.length === 1, error ? `error: ${error.message}` : `filas: ${filas.length}`);
    anotar("Y esa fila es la propia",
      filas.length === 1 && filas[0].id === uid,
      filas.length === 1 ? `id devuelto: ${filas[0].id}` : "no hay una sola fila");
  }

  // --- La prueba que más importa: no puede activarse el plan solo -----------
  {
    const antes = (await supabase.from("usuarios").select("estado_pago").eq("id", uid).maybeSingle()).data;

    const { data, error } = await supabase
      .from("usuarios").update({ estado_pago: "activo" }).eq("id", uid).select();

    const despues = (await supabase.from("usuarios").select("estado_pago").eq("id", uid).maybeSingle()).data;

    anotar("NO puede ponerse estado_pago = activo por su cuenta",
      (data ?? []).length === 0 && despues?.estado_pago === antes?.estado_pago,
      `antes: ${antes?.estado_pago} · después: ${despues?.estado_pago}` +
      (error ? ` · error: ${error.message}` : " · la base ignoró el update"));
  }

  // --- Cerrar sesión vuelve a cerrar la puerta ------------------------------
  await salir();
  {
    const { data } = await supabase.from("usuarios").select("*");
    anotar("Al cerrar sesión deja de entregar datos",
      (data ?? []).length === 0, `filas: ${(data ?? []).length}`);
  }
}

function pintar() {
  const fallan = pruebas.filter((p) => !p.pasa);

  $("resumen").innerHTML = "";
  const div = document.createElement("div");
  div.className = "aviso " + (fallan.length ? "error" : "ok");
  div.textContent = fallan.length
    ? `${fallan.length} de ${pruebas.length} comprobaciones fallaron. Revisá las políticas en Supabase.`
    : `Las ${pruebas.length} comprobaciones pasaron. La base sólo entrega datos con sesión válida.`;
  $("resumen").append(div);

  $("detalle").textContent = pruebas
    .map((p) => `${p.pasa ? "PASA  " : "FALLA "} ${p.nombre}\n         ${p.detalle}`)
    .join("\n\n");

  $("pantalla-form").hidden = true;
  $("pantalla-resultado").hidden = false;
}

$("form-probar").onsubmit = async (ev) => {
  ev.preventDefault();
  const boton = $("btn-probar");
  boton.disabled = true;
  boton.textContent = "Probando…";
  try {
    await correr($("email").value.trim(), $("pass").value);
    pintar();
  } catch (e) {
    anotar("La prueba se cortó por un error inesperado", false, String(e.message ?? e));
    pintar();
  }
  boton.disabled = false;
  boton.textContent = "Correr las pruebas";
};

$("btn-otra").onclick = () => {
  $("pantalla-resultado").hidden = true;
  $("pantalla-form").hidden = false;
};
