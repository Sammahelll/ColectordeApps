-- ============================================================
-- MANTEC Satélites — Schema Supabase
-- Proyecto nuevo, independiente del Supabase de MANTEC.
-- Diseño: una tabla de equipos + una tabla de análisis genérica
-- (jsonb) para no tener que rigidizar 6 esquemas distintos por
-- cada módulo. Cada módulo escribe su payload propio en `datos`.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- EQUIPOS ----------
-- Catálogo común de equipos, compartido por los 6 módulos.
create table if not exists equipos (
  id          uuid primary key default gen_random_uuid(),
  tag         text not null unique,        -- ej: "MOT-204", "TKSA-41"
  nombre      text not null,
  tipo        text,                        -- ej: "motor", "tablero", "bomba"
  ubicacion   text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_equipos_tag on equipos (tag);

-- ---------- ANÁLISIS ----------
-- Un registro por cada análisis/lectura cargado desde cualquiera
-- de los 6 módulos satélite.
create table if not exists analisis (
  id           uuid primary key default gen_random_uuid(),
  equipo_id    uuid references equipos(id) on delete set null,
  modulo       text not null check (modulo in (
                 'motor_pro','tablero_pro','vibra_pro',
                 'thermovision','lubricacion','alineacion'
               )),
  fecha        timestamptz not null default now(),
  severidad    text check (severidad in ('ok','atencion','critico')),
  resumen      text,               -- descripción corta, para listados
  datos        jsonb not null,     -- payload completo tal cual lo genera el módulo
  autor        text,               -- nombre/usuario de quien cargó (texto libre por ahora)
  created_at   timestamptz not null default now()
);

create index if not exists idx_analisis_equipo on analisis (equipo_id);
create index if not exists idx_analisis_modulo on analisis (modulo);
create index if not exists idx_analisis_fecha on analisis (fecha desc);
create index if not exists idx_analisis_datos_gin on analisis using gin (datos);

-- ---------- STORAGE ----------
-- Bucket para imágenes/capturas (termografías, fotos de motor, etc.)
insert into storage.buckets (id, name, public)
values ('analisis-media', 'analisis-media', true)
on conflict (id) do nothing;

-- ============================================================
-- RLS — punto de partida abierto (anon read/write) para arrancar
-- rápido con los técnicos en campo. Cuando haya login de Supabase
-- Auth, reemplazar `using (true)` por `using (auth.uid() is not null)`
-- y agregar una columna `created_by uuid references auth.users(id)`.
-- ============================================================

alter table equipos enable row level security;
alter table analisis enable row level security;

create policy "equipos_anon_all" on equipos
  for all using (true) with check (true);

create policy "analisis_anon_all" on analisis
  for all using (true) with check (true);

create policy "media_anon_all" on storage.objects
  for all using (bucket_id = 'analisis-media')
  with check (bucket_id = 'analisis-media');

-- ---------- trigger updated_at ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_equipos_updated_at on equipos;
create trigger trg_equipos_updated_at
  before update on equipos
  for each row execute function set_updated_at();
