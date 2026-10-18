-- Esquema para "De la libreta a la caja" (Reto Mibanco).
-- Ejecutar en Supabase: SQL Editor → pegar este archivo → Run.
-- Luego copiar Project URL / anon key / service_role key a .env.local.

create extension if not exists "pgcrypto";

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  ext_id text,                    -- id externo tipo E01 / X01 (modo lote)
  dia text,                       -- día de la semana (opcional)
  texto text not null,            -- texto o transcripción de la nota de voz
  origen text not null default 'texto' check (origen in ('texto', 'audio', 'csv')),
  created_at timestamptz not null default now()
);

create table if not exists transacciones (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid references mensajes(id) on delete set null,
  tipo text not null check (tipo in ('venta', 'gasto', 'fiado', 'cobro_fiado')),
  producto text not null,
  cantidad numeric not null default 1,
  monto numeric,                  -- NULL = dato faltante (nunca se inventa ni se pone 0)
  cliente text,                   -- a quién se fió / quién pagó (para fiados)
  requiere_confirmacion boolean not null default false,
  resuelta boolean not null default true, -- false mientras esperamos respuesta de la usuaria
  created_at timestamptz not null default now()
);

create index if not exists transacciones_tipo_idx on transacciones (tipo);
create index if not exists transacciones_mensaje_idx on transacciones (mensaje_id);

-- Demo de hackathon, una sola usuaria: acceso anónimo completo.
alter table mensajes enable row level security;
alter table transacciones enable row level security;

create policy "demo mensajes" on mensajes for all using (true) with check (true);
create policy "demo transacciones" on transacciones for all using (true) with check (true);
