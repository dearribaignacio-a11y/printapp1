-- Rindo · esquema inicial
-- Se corre una sola vez, desde el SQL Editor de Supabase.
-- Es idempotente: volver a correrlo no rompe nada.

-- ---------------------------------------------------------------------------
-- planes: el catálogo. El precio vive acá y NO lo manda el navegador.
-- La Edge Function lee el precio de esta tabla antes de hablar con
-- Mercado Pago, así nadie puede pagar 1 peso editando el HTML.
-- ---------------------------------------------------------------------------
create table if not exists public.planes (
  slug        text primary key,
  nombre      text        not null,
  descripcion text,
  precio      numeric(12,2) not null check (precio > 0),
  moneda      text        not null default 'ARS',
  activo      boolean     not null default true,
  orden       smallint    not null default 0
);

insert into public.planes (slug, nombre, descripcion, precio, orden) values
  ('hogar',         'Plan Hogar',         'Para uso personal: un solo usuario, hasta 100 movimientos por mes.', 4900.00,  1),
  ('comercial',     'Plan Comercial',     'Para un comercio: movimientos ilimitados, stock y reportes.',         9900.00,  2),
  ('comercial_pro', 'Plan Comercial Pro', 'Varias sucursales, varios usuarios y el asistente con IA.',          19900.00, 3)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- usuarios: el perfil. Se crea solo cuando alguien se registra (trigger abajo).
-- id es el mismo uuid que auth.users, así no hay dos identidades que sincronizar.
-- ---------------------------------------------------------------------------
create table if not exists public.usuarios (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text        not null,
  nombre          text,
  plan_elegido    text        references public.planes (slug),
  estado_pago     text        not null default 'sin_plan'
                    check (estado_pago in ('sin_plan','pendiente','activo','pausado','cancelado','rechazado')),
  fecha_registro  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- suscripciones: una fila por intento de suscripción en Mercado Pago.
-- mercadopago_id es el id del "preapproval" y es la clave con la que
-- el webhook encuentra la fila que tiene que actualizar.
-- ---------------------------------------------------------------------------
create table if not exists public.suscripciones (
  id                 uuid primary key default gen_random_uuid(),
  usuario_id         uuid        not null references public.usuarios (id) on delete cascade,
  plan               text        not null references public.planes (slug),
  mercadopago_id     text        unique,
  estado             text        not null default 'pendiente'
                       check (estado in ('pendiente','activo','pausado','cancelado','rechazado')),
  fecha_inicio       timestamptz,
  fecha_vencimiento  timestamptz,
  creada_en          timestamptz not null default now(),
  actualizada_en     timestamptz not null default now()
);

create index if not exists suscripciones_usuario_idx on public.suscripciones (usuario_id);
create index if not exists suscripciones_mp_idx      on public.suscripciones (mercadopago_id);

-- ---------------------------------------------------------------------------
-- Alta automática del perfil al registrarse.
-- El nombre llega en el metadata del signUp: { data: { nombre: "..." } }.
-- ---------------------------------------------------------------------------
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.usuarios (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nombre',''), split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- Perfiles para usuarios que ya existían antes de correr esto.
insert into public.usuarios (id, email, nombre)
select u.id, u.email, coalesce(nullif(u.raw_user_meta_data->>'nombre',''), split_part(u.email,'@',1))
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- Regla: desde el navegador se puede LEER lo propio y nada más.
-- Ni siquiera el dueño de la fila puede escribir estado_pago: si pudiera,
-- cualquiera se pondría "activo" desde la consola del navegador y usaría
-- la app gratis. Todas las escrituras pasan por las Edge Functions, que
-- usan la service_role key y saltean RLS.
-- ---------------------------------------------------------------------------
alter table public.usuarios      enable row level security;
alter table public.suscripciones enable row level security;
alter table public.planes        enable row level security;

-- "to authenticated" deja afuera al rol anónimo antes de mirar la fila:
-- sin haber pasado por la contraseña no se evalúa ni la condición.
drop policy if exists "cada uno ve su perfil"        on public.usuarios;
create policy "cada uno ve su perfil"
  on public.usuarios for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "cada uno ve sus suscripciones" on public.suscripciones;
create policy "cada uno ve sus suscripciones"
  on public.suscripciones for select
  to authenticated
  using (auth.uid() = usuario_id);

drop policy if exists "los planes son públicos"       on public.planes;
create policy "los planes son públicos"
  on public.planes for select
  using (activo);
