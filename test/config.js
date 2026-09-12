// Pegá acá los dos datos del proyecto de Supabase.
// Supabase → Project Settings → API
//
// La anon key es PÚBLICA a propósito: no da acceso a nada por sí sola,
// porque las tablas tienen Row Level Security. La que nunca va acá es la
// service_role key.
window.RINDO_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-ANON-KEY",
};
