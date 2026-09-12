/* auth.js — las cuentas de Rindo, sobre Supabase Auth.
   Un solo lugar para registrar, entrar, salir y saber quién está.
   Lo usan la página de prueba (test/) y, cuando llegue el momento, el panel.

   La contraseña la verifica Supabase, no este archivo ni la base: viaja por
   HTTPS, se compara contra un hash y, si no coincide, no se emite ninguna
   sesión. Acá no hay nada que decidir sobre eso.

   Cómo se carga (config.js primero, y el que lo use como módulo):
     <script src="config.js"></script>
     <script type="module" src="mi-archivo.js"></script>
*/

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const CFG = globalThis.RINDO_CONFIG ?? {};

/** Devuelve el problema de configuración, o null si está todo. */
export function problemaDeConfig() {
  if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("TU-PROYECTO"))
    return "Falta SUPABASE_URL en config.js.";
  if (!CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY.includes("TU-ANON-KEY"))
    return "Falta SUPABASE_ANON_KEY en config.js.";
  return null;
}

/* persistSession guarda la sesión en el navegador y autoRefreshToken la
   renueva sola: por eso no hay que loguearse cada vez que se abre la app. */
export const supabase = problemaDeConfig() ? null : createClient(
  CFG.SUPABASE_URL,
  CFG.SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

/** Los errores de Supabase vienen en inglés y crudos. */
export function traducirError(e) {
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

function sinConfigurar() {
  return { ok: false, error: problemaDeConfig() };
}

/**
 * Crear cuenta.
 * El nombre viaja en el metadata; el trigger de la base lo copia a usuarios.nombre.
 *
 * → { ok: true,  sesion: true }              quedó logueado
 * → { ok: true,  sesion: false, mensaje }    falta que confirme el email
 * → { ok: false, error }
 */
export async function registrar({ nombre, email, password }) {
  if (!supabase) return sinConfigurar();

  const { data, error } = await supabase.auth.signUp({
    email: String(email).trim(),
    password,
    options: { data: { nombre: String(nombre ?? "").trim() } },
  });

  if (error) return { ok: false, error: traducirError(error) };

  /* Con la confirmación por mail activada, Supabase no delata si el email ya
     existe: devuelve un usuario sin identidades. Para probar conviene decirlo. */
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, error: "Ese email ya tiene una cuenta. Probá iniciar sesión." };
  }

  if (!data.session) {
    return {
      ok: true,
      sesion: false,
      mensaje: "Cuenta creada. Confirmá el email desde tu casilla y después iniciá sesión.",
    };
  }
  return { ok: true, sesion: true };
}

/**
 * Iniciar sesión. Autoriza únicamente si el email existe y la contraseña
 * coincide: si no, Supabase no emite sesión y devolvemos el error.
 *
 * → { ok: true, usuario }  |  { ok: false, error }
 */
export async function entrar({ email, password }) {
  if (!supabase) return sinConfigurar();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim(),
    password,
  });

  if (error) return { ok: false, error: traducirError(error) };
  return { ok: true, usuario: data.user };
}

export async function salir() {
  if (!supabase) return sinConfigurar();
  const { error } = await supabase.auth.signOut();
  return error ? { ok: false, error: traducirError(error) } : { ok: true };
}

/** La sesión guardada, o null. Es lo que se pregunta al abrir la app. */
export async function sesionActual() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * El perfil del que está logueado: plan_elegido, estado_pago, etc.
 * Devuelve null si no hay sesión. RLS se encarga de que sólo vuelva su fila.
 */
export async function perfil() {
  const sesion = await sesionActual();
  if (!sesion) return null;

  const { data, error } = await supabase
    .from("usuarios").select("*").eq("id", sesion.user.id).maybeSingle();

  if (error) throw new Error(traducirError(error));
  return data;
}

/** Avisa cuando alguien entra o sale, en esta o en otra pestaña. */
export function alCambiarSesion(fn) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => fn(sesion));
  return () => data.subscription.unsubscribe();
}
