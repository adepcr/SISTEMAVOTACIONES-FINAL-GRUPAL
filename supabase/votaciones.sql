-- =====================================================================
--  ADEP Vota — base de datos en Supabase
--
--  Cómo usarlo: en Supabase (proyecto inventario-archivo), abra "SQL Editor",
--  pegue TODO este archivo y toque "Run". Se puede correr más de una vez sin
--  perder datos. Antes debe haberse corrido basedatos/supabase.sql del carnet
--  (crea la lista compartida de afiliados).
--
--  Todas las tablas empiezan con "vota_" para convivir con el inventario y
--  el carnet en el mismo proyecto sin mezclarse.
--
--  Quién es quién:
--   - Administrador: cuenta de Supabase (Authentication → Users) que aparece
--     activa en vota_admins. Nunca un afiliado.
--   - Afiliado: NO tiene cuenta de Supabase (así nunca puede ver el inventario).
--     Entra con su cédula y su clave, o con el código general de ingreso, y
--     recibe una "sesión" (un número secreto al azar) que guarda su celular.
--     Todo lo que hace pasa por las funciones vota_* de abajo, que revisan esa
--     sesión. Las tablas no se pueden leer ni escribir directamente.
--
--  Lista de afiliados: es la MISMA del carnet (public.carnet_afiliados), que
--  se reemplaza cada mes con el reporte de ADEP. Este sistema solo agrega lo
--  suyo (clave, celular, teléfono) en vota_cuentas.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 1. Lista compartida de afiliados (la del carnet): nombre y filial
-- ---------------------------------------------------------------------
alter table public.carnet_afiliados add column if not exists nombre text;
alter table public.carnet_afiliados add column if not exists filial text;


-- ---------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------

-- Administradores (cuentas de Supabase)
create table if not exists public.vota_admins (
  uid     uuid primary key references auth.users (id) on delete cascade,
  nombre  text not null check (length(trim(nombre)) between 2 and 80),
  correo  text not null,
  activo  boolean not null default true,
  creada  timestamptz not null default now()
);

-- Cuenta de cada afiliado en este sistema (lo que no está en la lista compartida)
create table if not exists public.vota_cuentas (
  cedula          text primary key,
  telefono        text not null default '',
  bloqueado       boolean not null default false,   -- desactivado solo para votar
  tipo            text check (tipo in ('clave', 'dispositivo')),  -- null = todavía no ha entrado
  activado        boolean not null default false,
  pendiente       boolean not null default false,   -- espera que un administrador apruebe el ingreso
  dispositivo     text not null default '',
  ultimo_ingreso  timestamptz,
  pin_hash        text,                             -- clave de 6 números, cifrada (bcrypt)
  act_hash        text,                             -- huella SHA-256 del código de activación (nunca el código)
  act_usada       boolean not null default true,
  fallos          int not null default 0,
  bloqueo_hasta   timestamptz,
  creada          timestamptz not null default now()
);

-- Sesiones de los afiliados (se guarda la huella SHA-256, nunca el número secreto)
create table if not exists public.vota_sesiones (
  huella  text primary key,
  cedula  text not null references public.vota_cuentas (cedula) on delete cascade,
  tipo    text not null check (tipo in ('clave', 'dispositivo')),
  creada  timestamptz not null default now()
);
create index if not exists vota_sesiones_cedula on public.vota_sesiones (cedula);

-- Ajustes: general (práctica), publico (WhatsApp, enlace de la app), ingreso (código general)
create table if not exists public.vota_config (
  clave  text primary key,
  valor  jsonb not null default '{}'::jsonb
);

-- Consultas. "datos" guarda todo lo que arma la página (título, opciones, horario, ...)
create table if not exists public.vota_polls (
  id      bigint primary key,
  datos   jsonb not null,
  creada  timestamptz not null default now()
);

-- Conteo de votos: c[1..10] = votos por opción. El voto secreto existe SOLO aquí, sin cédula.
create table if not exists public.vota_conteos (
  poll_id  bigint primary key references public.vota_polls (id) on delete cascade,
  c        int[] not null default array_fill(0, array[10]),
  total    int not null default 0 check (total >= 0)
);

-- Quién ya votó (nunca qué eligió) + código de su comprobante
create table if not exists public.vota_participacion (
  poll_id  bigint not null references public.vota_polls (id) on delete cascade,
  cedula   text not null,
  fecha    text not null,
  codigo   text not null,
  primary key (poll_id, cedula)
);

-- Votos de consultas públicas (nombre y opción visibles)
create table if not exists public.vota_votos (
  poll_id  bigint not null references public.vota_polls (id) on delete cascade,
  cedula   text not null,
  nombre   text not null,
  filial   text not null default '',
  opcion   text not null,
  idx      int not null,
  codigo   text not null,
  fecha    text not null,
  primary key (poll_id, cedula)
);

-- Códigos de verificación de los comprobantes
create table if not exists public.vota_codigos (
  codigo   text primary key,
  poll_id  bigint not null references public.vota_polls (id) on delete cascade,
  fecha    text not null
);

-- Bitácora
create table if not exists public.vota_auditoria (
  id       bigint generated always as identity primary key,
  fecha    timestamptz not null default now(),
  accion   text not null,
  detalle  text not null default '',
  por      text not null,
  uid      text not null
);
create index if not exists vota_auditoria_fecha on public.vota_auditoria (fecha desc);

-- Avisos: alguien intentó entrar con una cédula que ya está en otro celular
create table if not exists public.vota_alertas (
  id      bigint generated always as identity primary key,
  cedula  text not null,
  fecha   timestamptz not null default now()
);

-- Copia de los afiliados y administradores eliminados
create table if not exists public.vota_eliminados (
  id             bigint generated always as identity primary key,
  tipo           text not null,
  datos          jsonb not null,
  fecha          text not null,
  eliminado_por  text not null
);

-- Intentos fallidos por dirección IP (para frenar a quien pruebe muchas claves o códigos).
create table if not exists public.vota_intentos (
  id     bigint generated always as identity primary key,
  ip     text not null,
  tipo   text not null,
  fecha  timestamptz not null default now()
);
create index if not exists vota_intentos_ip on public.vota_intentos (ip, tipo, fecha);

-- Cada consulta nueva nace con su conteo en cero
create or replace function public.vota_conteo_nuevo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.vota_conteos (poll_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists vota_conteo_nuevo on public.vota_polls;
create trigger vota_conteo_nuevo after insert on public.vota_polls
  for each row execute function public.vota_conteo_nuevo();


-- ---------------------------------------------------------------------
-- 3. Seguridad de las tablas
--    Nadie con la clave pública (anon) toca las tablas: los afiliados usan
--    solo las funciones. Los administradores leen y cambian lo suyo.
-- ---------------------------------------------------------------------
alter table public.vota_admins        enable row level security;
alter table public.vota_cuentas       enable row level security;
alter table public.vota_sesiones      enable row level security;
alter table public.vota_config        enable row level security;
alter table public.vota_polls         enable row level security;
alter table public.vota_conteos       enable row level security;
alter table public.vota_participacion enable row level security;
alter table public.vota_votos         enable row level security;
alter table public.vota_codigos       enable row level security;
alter table public.vota_auditoria     enable row level security;
alter table public.vota_alertas       enable row level security;
alter table public.vota_eliminados    enable row level security;
alter table public.vota_intentos      enable row level security;

revoke all on public.vota_admins, public.vota_cuentas, public.vota_sesiones, public.vota_config,
              public.vota_polls, public.vota_conteos, public.vota_participacion, public.vota_votos,
              public.vota_codigos, public.vota_auditoria, public.vota_alertas, public.vota_eliminados,
              public.vota_intentos
  from anon, authenticated;

-- ¿La cuenta de Supabase conectada es un administrador activo de ADEP Vota?
create or replace function public.vota_es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vota_admins where uid = auth.uid() and activo);
$$;
revoke execute on function public.vota_es_admin() from public, anon;
grant execute on function public.vota_es_admin() to authenticated;

-- Lo que el administrador lee directamente (lo demás, por funciones)
grant select on public.vota_admins, public.vota_config, public.vota_polls, public.vota_conteos,
                public.vota_participacion, public.vota_votos, public.vota_auditoria,
                public.vota_alertas, public.vota_eliminados
  to authenticated;
grant insert, delete on public.vota_polls to authenticated;
grant update (activo) on public.vota_admins to authenticated;
grant delete on public.vota_alertas to authenticated;

do $$
declare t text;
begin
  foreach t in array array['vota_admins', 'vota_config', 'vota_polls', 'vota_conteos', 'vota_participacion',
                           'vota_votos', 'vota_auditoria', 'vota_alertas', 'vota_eliminados']
  loop
    execute format('drop policy if exists "administradores" on public.%I', t);
    execute format('create policy "administradores" on public.%I for all to authenticated
                    using ((select public.vota_es_admin())) with check ((select public.vota_es_admin()))', t);
  end loop;
end $$;

-- El servidor (clave secreta) puede respaldar y restaurar
grant usage on schema public to service_role;
grant select, insert, update, delete on public.vota_admins, public.vota_cuentas, public.vota_sesiones,
  public.vota_config, public.vota_polls, public.vota_conteos, public.vota_participacion, public.vota_votos,
  public.vota_codigos, public.vota_auditoria, public.vota_alertas, public.vota_eliminados, public.vota_intentos
  to service_role;


-- ---------------------------------------------------------------------
-- 4. Ayudantes internos (no se pueden llamar desde la página)
-- ---------------------------------------------------------------------

-- Dirección IP de quien llama (Supabase la pasa en los encabezados)
create or replace function public.vota_ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(trim(split_part(
    coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-forwarded-for', ',', 1)), ''), 'desconocida');
$$;

-- ¿Esta IP ya hizo demasiados intentos fallidos de este tipo en los últimos 15 minutos?
create or replace function public.vota_frenado(p_tipo text, p_max int) returns boolean
language sql security definer set search_path = '' as $$
  select count(*) >= p_max from public.vota_intentos
  where ip = public.vota_ip() and tipo = p_tipo and fecha > now() - interval '15 minutes';
$$;

create or replace function public.vota_fallo(p_tipo text) returns void
language sql security definer set search_path = '' as $$
  delete from public.vota_intentos where fecha < now() - interval '1 day';
  insert into public.vota_intentos (ip, tipo) values (public.vota_ip(), p_tipo);
$$;

create or replace function public.vota_ahora_ms() returns bigint
language sql stable set search_path = '' as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

create or replace function public.vota_huella(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex');
$$;

-- Huella del código de activación: SHA-256 en base64 "url" (igual que la calcula la página)
create or replace function public.vota_huella_activacion(p_cedula text, p_codigo text) returns text
language sql immutable set search_path = '' as $$
  select translate(encode(extensions.digest(p_cedula || ':' || p_codigo, 'sha256'), 'base64'), '+/', '-_');
$$;

-- Texto al azar con las letras dadas
create or replace function public.vota_azar(p_n int, p_letras text) returns text
language plpgsql volatile set search_path = '' as $$
declare b bytea := extensions.gen_random_bytes(p_n); s text := ''; i int;
begin
  for i in 0 .. p_n - 1 loop
    s := s || substr(p_letras, (get_byte(b, i) % length(p_letras)) + 1, 1);
  end loop;
  return s;
end;
$$;

-- Afiliado de la lista compartida, activo y sin bloqueo para votar (null si no puede entrar)
create or replace function public.vota_afiliado(p_cedula text) returns public.carnet_afiliados
language sql stable security definer set search_path = '' as $$
  select a.* from public.carnet_afiliados a
  left join public.vota_cuentas c on c.cedula = a.cedula
  where a.cedula = p_cedula and a.activo and not coalesce(c.bloqueado, false);
$$;

-- Crea una sesión nueva y devuelve su número secreto
create or replace function public.vota_nueva_sesion(p_cedula text, p_tipo text) returns text
language plpgsql security definer set search_path = '' as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.vota_sesiones (huella, cedula, tipo) values (public.vota_huella(t), p_cedula, p_tipo);
  return t;
end;
$$;

-- Cédula de la sesión, si sigue valiendo (la cuenta no fue liberada, borrada ni desactivada)
create or replace function public.vota_cedula_sesion(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select s.cedula from public.vota_sesiones s
  join public.vota_cuentas c on c.cedula = s.cedula and c.tipo = s.tipo
  where s.huella = public.vota_huella(coalesce(p_token, ''))
    and public.vota_afiliado(s.cedula) is not null;
$$;

create or replace function public.vota_perfil(p_cedula text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('uid', a.cedula, 'rol', 'Afiliado', 'cedula', a.cedula,
           'nombre', coalesce(nullif(a.nombre, ''), 'Afiliado ' || a.cedula),
           'provincia', coalesce(a.filial, ''), 'telefono', coalesce(c.telefono, ''),
           'pendiente', coalesce(c.pendiente, false))
  from public.carnet_afiliados a left join public.vota_cuentas c on c.cedula = a.cedula
  where a.cedula = p_cedula;
$$;

-- La consulta está publicada y dentro de su horario
create or replace function public.vota_abierta(p_datos jsonb) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((p_datos ->> 'publicada')::boolean, false)
     and (coalesce((p_datos ->> 'aperturaMs')::bigint, 0) = 0 or public.vota_ahora_ms() >= (p_datos ->> 'aperturaMs')::bigint)
     and (coalesce((p_datos ->> 'cierreMs')::bigint, 0) = 0 or public.vota_ahora_ms() <  (p_datos ->> 'cierreMs')::bigint);
$$;

drop function if exists public.vota_conteo_json(public.vota_conteos);
create or replace function public.vota_conteo_json(p_c int[], p_total int) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('total', p_total) || coalesce(
    (select jsonb_object_agg('c' || (i - 1), coalesce(p_c[i], 0)) from generate_series(1, 10) i), '{}'::jsonb);
$$;

do $$
declare f text;
begin
  foreach f in array array['vota_ip()', 'vota_frenado(text, int)', 'vota_fallo(text)', 'vota_ahora_ms()',
    'vota_huella(text)', 'vota_huella_activacion(text, text)', 'vota_azar(int, text)', 'vota_afiliado(text)',
    'vota_nueva_sesion(text, text)', 'vota_cedula_sesion(text)', 'vota_perfil(text)', 'vota_abierta(jsonb)',
    'vota_conteo_json(int[], int)', 'vota_conteo_nuevo()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 5. Funciones de la pantalla de ingreso (cualquiera, sin sesión)
--    Los errores esperados se devuelven como {"error": "..."} (no como
--    excepción) para que el intento fallido quede anotado.
-- ---------------------------------------------------------------------

-- Ajustes visibles antes de entrar (WhatsApp de ayuda, enlace de la app) y si ya hay administrador
create or replace function public.vota_publico() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select valor from public.vota_config where clave = 'publico'), '{}'::jsonb)
         || jsonb_build_object('instalado', exists (select 1 from public.vota_admins));
$$;

-- ¿Cómo entra esta cédula? 'activa' (con clave) | 'dispositivo' (ya está en un celular) | 'sin-activar'
create or replace function public.vota_estado_cedula(p_cedula text) returns text
language sql stable security definer set search_path = '' as $$
  select case (select tipo from public.vota_cuentas where cedula = p_cedula)
           when 'clave' then 'activa' when 'dispositivo' then 'dispositivo' else 'sin-activar' end;
$$;

-- Primera vez: con el código de activación que le dio ADEP, el afiliado crea su clave de 6 números
create or replace function public.vota_activar(p_cedula text, p_codigo text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.vota_cuentas;
begin
  if public.vota_frenado('activar', 20) then
    return jsonb_build_object('error', 'Demasiados intentos. Espere 15 minutos e intente de nuevo.');
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{6}$' then
    return jsonb_build_object('error', 'La clave debe tener 6 números.');
  end if;
  select * into c from public.vota_cuentas where cedula = p_cedula for update;
  if c.cedula is null or c.act_usada or c.act_hash is distinct from public.vota_huella_activacion(p_cedula, upper(coalesce(p_codigo, '')))
     or public.vota_afiliado(p_cedula) is null then
    perform public.vota_fallo('activar');
    return jsonb_build_object('error', 'La cédula o el código de activación no son correctos, o el código ya se usó. Revíselos o pida un código nuevo a ADEP.');
  end if;
  delete from public.vota_sesiones where cedula = p_cedula;
  update public.vota_cuentas set tipo = 'clave', activado = true, pendiente = false, dispositivo = '',
    pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), act_usada = true,
    fallos = 0, bloqueo_hasta = null, ultimo_ingreso = now()
  where cedula = p_cedula;
  return jsonb_build_object('token', public.vota_nueva_sesion(p_cedula, 'clave'), 'perfil', public.vota_perfil(p_cedula));
end;
$$;

-- Ingreso con cédula y clave de 6 números
create or replace function public.vota_login(p_cedula text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.vota_cuentas;
begin
  if public.vota_frenado('login', 30) then
    return jsonb_build_object('error', 'Demasiados intentos. Espere 15 minutos e intente de nuevo.');
  end if;
  select * into c from public.vota_cuentas where cedula = p_cedula and tipo = 'clave' for update;
  if c.cedula is null then
    perform public.vota_fallo('login');
    return jsonb_build_object('error', 'La cédula o la clave no son correctas. Revise e intente de nuevo.');
  end if;
  if c.bloqueo_hasta is not null and c.bloqueo_hasta > now() then
    return jsonb_build_object('error', 'Demasiados intentos con esta cédula. Espere 15 minutos e intente de nuevo.');
  end if;
  if c.pin_hash is null or extensions.crypt(coalesce(p_pin, ''), c.pin_hash) <> c.pin_hash then
    perform public.vota_fallo('login');
    update public.vota_cuentas set
      fallos = case when c.fallos + 1 >= 5 then 0 else c.fallos + 1 end,
      bloqueo_hasta = case when c.fallos + 1 >= 5 then now() + interval '15 minutes' else null end
    where cedula = p_cedula;
    return jsonb_build_object('error', 'La cédula o la clave no son correctas. Revise e intente de nuevo.');
  end if;
  if public.vota_afiliado(p_cedula) is null then
    return jsonb_build_object('error', 'Su cuenta fue desactivada o su acceso fue renovado. Comuníquese con ADEP.');
  end if;
  update public.vota_cuentas set fallos = 0, bloqueo_hasta = null, ultimo_ingreso = now() where cedula = p_cedula;
  return jsonb_build_object('token', public.vota_nueva_sesion(p_cedula, 'clave'), 'perfil', public.vota_perfil(p_cedula));
end;
$$;

-- Ingreso con el código general (6 números): la cédula queda amarrada a este celular
create or replace function public.vota_ingresar_codigo(p_cedula text, p_codigo text, p_dispositivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g jsonb; c public.vota_cuentas;
begin
  if public.vota_frenado('ingreso', 20) then
    return jsonb_build_object('error', 'Demasiados intentos. Espere 15 minutos e intente de nuevo.');
  end if;
  g := coalesce((select valor from public.vota_config where clave = 'ingreso'), '{}'::jsonb);
  if not (coalesce((g ->> 'activo')::boolean, false) and p_codigo = (g ->> 'codigo')
          and public.vota_ahora_ms() < coalesce((g ->> 'venceMs')::bigint, 0))
     or public.vota_afiliado(p_cedula) is null then
    perform public.vota_fallo('ingreso');
    return jsonb_build_object('error', 'El código de ingreso no es correcto o ya venció. Revíselo o pídalo de nuevo a ADEP. Si su cédula no está registrada, comuníquese con ADEP.');
  end if;
  insert into public.vota_cuentas (cedula) values (p_cedula) on conflict do nothing;
  select * into c from public.vota_cuentas where cedula = p_cedula for update;
  if c.tipo = 'dispositivo' then
    return jsonb_build_object('error', 'Esta cédula ya se está usando en otro celular. Si no fue usted, comuníquese con ADEP.', 'enUso', true);
  end if;
  if c.tipo is not null then
    return jsonb_build_object('error', 'Esta cédula ya tiene clave. Toque «Cambiar», escriba su cédula y luego su clave de 6 números.');
  end if;
  update public.vota_cuentas set tipo = 'dispositivo', activado = true,
    pendiente = coalesce((g ->> 'aprobacion')::boolean, false),
    dispositivo = left(coalesce(p_dispositivo, ''), 60), ultimo_ingreso = now()
  where cedula = p_cedula;
  return jsonb_build_object('token', public.vota_nueva_sesion(p_cedula, 'dispositivo'), 'perfil', public.vota_perfil(p_cedula));
end;
$$;

-- Aviso al administrador: alguien intentó entrar con una cédula que ya está en otro celular
create or replace function public.vota_avisar_intento(p_cedula text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.vota_frenado('alerta', 20) then return; end if;
  perform public.vota_fallo('alerta');
  if exists (select 1 from public.vota_cuentas where cedula = p_cedula and tipo = 'dispositivo') then
    insert into public.vota_alertas (cedula) values (left(p_cedula, 15));
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Funciones del afiliado (con su sesión)
-- ---------------------------------------------------------------------

-- Perfil del afiliado de esta sesión, o null si la sesión ya no vale
create or replace function public.vota_yo(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ced text := public.vota_cedula_sesion(p_token);
begin
  if ced is null then return null; end if;
  update public.vota_cuentas set ultimo_ingreso = now()
  where cedula = ced and (ultimo_ingreso is null or ultimo_ingreso < now() - interval '10 minutes');
  return public.vota_perfil(ced);
end;
$$;

-- Todo lo que ve el afiliado: consultas publicadas, conteos, sus votos y los votos públicos
create or replace function public.vota_datos(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ced text := public.vota_cedula_sesion(p_token);
begin
  if ced is null then
    -- 'desactivado': la sesión existe pero el afiliado salió de la lista o fue bloqueado (puede volver)
    return jsonb_build_object('error', case when exists (
      select 1 from public.vota_sesiones s join public.vota_cuentas c on c.cedula = s.cedula and c.tipo = s.tipo
      where s.huella = public.vota_huella(coalesce(p_token, ''))) then 'desactivado' else 'sesion' end);
  end if;
  if (select pendiente from public.vota_cuentas where cedula = ced) then
    return jsonb_build_object('error', 'pendiente', 'yo', public.vota_perfil(ced));
  end if;
  return jsonb_build_object(
    'yo', public.vota_perfil(ced),
    'polls', coalesce((select jsonb_agg(p.datos || jsonb_build_object('id', p.id) order by p.id)
                       from public.vota_polls p where coalesce((p.datos ->> 'publicada')::boolean, false)), '[]'::jsonb),
    'conteos', coalesce((select jsonb_object_agg(c.poll_id::text, public.vota_conteo_json(c.c, c.total))
                         from public.vota_conteos c join public.vota_polls p on p.id = c.poll_id
                         where coalesce((p.datos ->> 'publicada')::boolean, false)), '{}'::jsonb),
    'participacion', coalesce((select jsonb_agg(jsonb_build_object('pollId', r.poll_id, 'cedula', r.cedula, 'fecha', r.fecha, 'codigo', r.codigo))
                               from public.vota_participacion r where r.cedula = ced), '[]'::jsonb),
    'votos', coalesce((select jsonb_agg(jsonb_build_object('pollId', v.poll_id, 'cedula', v.cedula, 'nombre', v.nombre,
                                 'filial', v.filial, 'opcion', v.opcion, 'idx', v.idx, 'codigo', v.codigo, 'fecha', v.fecha))
                       from public.vota_votos v join public.vota_polls p on p.id = v.poll_id
                       where coalesce((p.datos ->> 'publicada')::boolean, false)), '[]'::jsonb),
    'config', coalesce((select valor from public.vota_config where clave = 'general'), '{}'::jsonb),
    'padron', (select count(*) from public.carnet_afiliados a left join public.vota_cuentas c on c.cedula = a.cedula
               where a.activo and not coalesce(c.bloqueado, false))
  );
end;
$$;

-- Emitir el voto. Todo en un solo paso: si algo falla, no se guarda nada.
create or replace function public.vota_votar(p_token text, p_poll bigint, p_idx int, p_fecha text, p_dia text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ced text := public.vota_cedula_sesion(p_token);
  p public.vota_polls; a public.carnet_afiliados; cod text; publica boolean; opcion text;
begin
  if ced is null then return jsonb_build_object('error', 'Su sesión terminó. Vuelva a ingresar.'); end if;
  if (select pendiente from public.vota_cuentas where cedula = ced) then
    return jsonb_build_object('error', 'Su ingreso todavía espera la aprobación de ADEP.');
  end if;
  select * into p from public.vota_polls where id = p_poll for share;
  if p.id is null or not public.vota_abierta(p.datos) then
    return jsonb_build_object('error', 'Esta consulta no está abierta para votar.');
  end if;
  opcion := p.datos -> 'opciones' ->> p_idx;
  if p_idx is null or p_idx < 0 or p_idx >= 10 or opcion is null then
    return jsonb_build_object('error', 'La opción elegida no es válida.');
  end if;
  if exists (select 1 from public.vota_participacion where poll_id = p_poll and cedula = ced) then
    return jsonb_build_object('error', 'Ya emitió su voto en esta consulta.');
  end if;
  publica := coalesce((p.datos ->> 'publica')::boolean, false);
  a := public.vota_afiliado(ced);
  loop
    cod := 'ADEP-' || public.vota_azar(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') || '-' || public.vota_azar(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    exit when not exists (select 1 from public.vota_codigos where codigo = cod);
  end loop;
  begin
    insert into public.vota_participacion (poll_id, cedula, fecha, codigo) values (p_poll, ced, left(p_fecha, 40), cod);
  exception when unique_violation then
    return jsonb_build_object('error', 'Ya emitió su voto en esta consulta.');
  end;
  update public.vota_conteos set c[p_idx + 1] = c[p_idx + 1] + 1, total = total + 1 where poll_id = p_poll;
  -- En el voto secreto el comprobante solo guarda el día, para que la hora no delate el voto
  insert into public.vota_codigos (codigo, poll_id, fecha) values (cod, p_poll, left(case when publica then p_fecha else p_dia end, 40));
  if publica then
    insert into public.vota_votos (poll_id, cedula, nombre, filial, opcion, idx, codigo, fecha)
    values (p_poll, ced, coalesce(nullif(a.nombre, ''), 'Afiliado ' || ced), coalesce(a.filial, ''), opcion, p_idx, cod, left(p_fecha, 40));
  end if;
  return jsonb_build_object('codigo', cod, 'fecha', left(p_fecha, 40));
end;
$$;

-- Cerrar sesión (la "llave" de un celular amarrado no se borra: así vuelve a entrar sin código)
create or replace function public.vota_salir(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.vota_sesiones where huella = public.vota_huella(coalesce(p_token, '')) and tipo = 'clave';
$$;

-- Verificar el código de un comprobante (afiliado con sesión o administrador)
create or replace function public.vota_verificar(p_token text, p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('pollId', k.poll_id, 'titulo', coalesce(p.datos ->> 'titulo', 'Consulta no disponible'), 'fecha', k.fecha)
  from public.vota_codigos k join public.vota_polls p on p.id = k.poll_id
  where k.codigo = upper(trim(p_codigo))
    and (public.vota_es_admin() or public.vota_cedula_sesion(p_token) is not null);
$$;

-- Bitácora: queda con el nombre real de quien la escribe (afiliado con sesión o administrador)
create or replace function public.vota_log(p_token text, p_accion text, p_detalle text) returns void
language plpgsql security definer set search_path = '' as $$
declare ced text; adm public.vota_admins;
begin
  if p_token is not null then
    ced := public.vota_cedula_sesion(p_token);
    if ced is null then return; end if;
    insert into public.vota_auditoria (accion, detalle, por, uid)
    values (left(p_accion, 120), left(coalesce(p_detalle, ''), 300), (public.vota_perfil(ced) ->> 'nombre'), ced);
  else
    select * into adm from public.vota_admins where uid = auth.uid() and activo;
    if adm.uid is null then return; end if;
    insert into public.vota_auditoria (accion, detalle, por, uid)
    values (left(p_accion, 120), left(coalesce(p_detalle, ''), 300), adm.nombre, adm.uid::text);
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Funciones de los administradores
-- ---------------------------------------------------------------------

create or replace function public.vota_exigir_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.vota_es_admin() then raise exception 'Sin permiso: solo administradores de ADEP Vota.' using errcode = '42501'; end if;
end;
$$;
revoke execute on function public.vota_exigir_admin() from public, anon, authenticated;

-- Primera instalación: la cuenta de Supabase conectada queda como primer administrador (solo una vez)
create or replace function public.vota_instalar(p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Debe iniciar sesión.'; end if;
  lock table public.vota_admins in exclusive mode;
  if exists (select 1 from public.vota_admins) then
    return jsonb_build_object('error', 'El sistema ya tiene un administrador. Ingrese con su cuenta o pida una a otro administrador.');
  end if;
  insert into public.vota_admins (uid, nombre, correo)
  select id, trim(p_nombre), lower(email) from auth.users where id = auth.uid();
  insert into public.vota_config (clave, valor) values ('general', '{"practica_activa": true}')
  on conflict (clave) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- Administrador conectado (o null)
create or replace function public.vota_admin_perfil() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('uid', uid, 'rol', 'Administrador', 'nombre', nombre, 'correo', correo, 'cedula', uid, 'provincia', '')
  from public.vota_admins where uid = auth.uid() and activo;
$$;

-- Dar permiso de administrador a una cuenta de Supabase que ya existe (Authentication → Users)
create or replace function public.vota_agregar_admin(p_nombre text, p_correo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  perform public.vota_exigir_admin();
  select id into u from auth.users where lower(email) = lower(trim(p_correo));
  if u is null then
    return jsonb_build_object('error', 'No hay ninguna cuenta de Supabase con ese correo. Créela primero en Supabase → Authentication → Users → Add user (marque «Auto Confirm User») y vuelva a intentar.');
  end if;
  insert into public.vota_admins (uid, nombre, correo) values (u, trim(p_nombre), lower(trim(p_correo)))
  on conflict (uid) do update set nombre = excluded.nombre, activo = true;
  return jsonb_build_object('ok', true, 'correo', lower(trim(p_correo)));
end;
$$;

-- Lista de afiliados (la compartida) con los datos de su cuenta en este sistema
create or replace function public.vota_padron() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cedula', a.cedula, 'nombre', coalesce(nullif(a.nombre, ''), 'Afiliado ' || a.cedula), 'provincia', coalesce(a.filial, ''),
      'telefono', coalesce(c.telefono, ''), 'activo', a.activo and not coalesce(c.bloqueado, false),
      'enLista', a.activo, 'activado', coalesce(c.activado, false), 'pendiente', coalesce(c.pendiente, false),
      'dispositivo', coalesce(c.dispositivo, ''), 'uid', case when c.tipo is not null then a.cedula end,
      'ultimoIngreso', c.ultimo_ingreso, 'creada', coalesce(c.creada, a.actualizado)) order by a.cedula)
    from public.carnet_afiliados a left join public.vota_cuentas c on c.cedula = a.cedula), '[]'::jsonb);
end;
$$;

-- Agregar o actualizar afiliados. Cada elemento: {cedula, nombre?, provincia?, telefono?, hash?}
-- Con "hash" (huella de un código de activación nuevo) la cuenta anterior deja de funcionar.
create or replace function public.vota_guardar_afiliados(p_lista jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare x jsonb; n int := 0; ced text;
begin
  perform public.vota_exigir_admin();
  for x in select * from jsonb_array_elements(p_lista) loop
    ced := x ->> 'cedula';
    if ced !~ '^[0-9]{9,12}$' then
      raise exception 'Cédula inválida: % (debe tener de 9 a 12 números)', ced;
    end if;
    insert into public.carnet_afiliados (cedula, activo, nombre, filial)
    values (ced, true, nullif(trim(x ->> 'nombre'), ''), nullif(trim(x ->> 'provincia'), ''))
    on conflict (cedula) do update set
      nombre = coalesce(nullif(trim(x ->> 'nombre'), ''), public.carnet_afiliados.nombre),
      filial = case when x ? 'provincia' then nullif(trim(x ->> 'provincia'), '') else public.carnet_afiliados.filial end,
      actualizado = now();
    insert into public.vota_cuentas (cedula) values (ced) on conflict do nothing;
    if x ? 'telefono' then update public.vota_cuentas set telefono = coalesce(x ->> 'telefono', '') where cedula = ced; end if;
    if x ? 'hash' then
      delete from public.vota_sesiones where cedula = ced;
      update public.vota_cuentas set act_hash = x ->> 'hash', act_usada = false, tipo = null, activado = false,
        pendiente = false, dispositivo = '', pin_hash = null, fallos = 0, bloqueo_hasta = null
      where cedula = ced;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Cambiar un afiliado: {provincia?, telefono?, activo?, pendiente?}
-- "activo" solo bloquea o desbloquea para votar (no toca la lista compartida ni el carnet).
create or replace function public.vota_cambiar_afiliado(p_cedula text, p_cambios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  if p_cambios ? 'provincia' then
    update public.carnet_afiliados set filial = nullif(trim(p_cambios ->> 'provincia'), ''), actualizado = now() where cedula = p_cedula;
  end if;
  insert into public.vota_cuentas (cedula) values (p_cedula) on conflict do nothing;
  update public.vota_cuentas set
    telefono  = case when p_cambios ? 'telefono'  then coalesce(p_cambios ->> 'telefono', '') else telefono end,
    bloqueado = case when p_cambios ? 'activo'    then not (p_cambios ->> 'activo')::boolean else bloqueado end,
    pendiente = case when p_cambios ? 'pendiente' then (p_cambios ->> 'pendiente')::boolean else pendiente end
  where cedula = p_cedula;
end;
$$;

-- Saca la cédula del celular donde está: puede entrar de nuevo (desde otro celular)
create or replace function public.vota_liberar(p_cedula text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  delete from public.vota_sesiones where cedula = p_cedula;
  update public.vota_cuentas set tipo = null, activado = false, pendiente = false, dispositivo = '', pin_hash = null
  where cedula = p_cedula;
end;
$$;

-- Quitar un afiliado de la lista compartida (también deja de tener carnet). Queda copia en vota_eliminados.
create or replace function public.vota_eliminar_afiliado(p_cedula text, p_fecha text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  insert into public.vota_eliminados (tipo, datos, fecha, eliminado_por)
  select 'Afiliado', jsonb_build_object('cedula', a.cedula, 'nombre', a.nombre, 'provincia', a.filial, 'telefono', c.telefono),
         left(p_fecha, 40), (select nombre from public.vota_admins where uid = auth.uid())
  from public.carnet_afiliados a left join public.vota_cuentas c on c.cedula = a.cedula where a.cedula = p_cedula;
  delete from public.vota_cuentas where cedula = p_cedula;
  delete from public.carnet_afiliados where cedula = p_cedula;
end;
$$;

-- Borra TODA la lista compartida y las cuentas de este sistema. Los votos ya emitidos no se tocan.
create or replace function public.vota_eliminar_todos(p_fecha text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.vota_exigir_admin();
  insert into public.vota_eliminados (tipo, datos, fecha, eliminado_por)
  select 'Afiliado', jsonb_build_object('cedula', a.cedula, 'nombre', a.nombre, 'provincia', a.filial, 'telefono', c.telefono),
         left(p_fecha, 40), (select nombre from public.vota_admins where uid = auth.uid())
  from public.carnet_afiliados a left join public.vota_cuentas c on c.cedula = a.cedula;
  get diagnostics n = row_count;
  delete from public.vota_cuentas where true;
  delete from public.carnet_afiliados where true;
  return n;
end;
$$;

-- Cambiar una consulta (se mezclan los cambios con lo que ya tiene)
create or replace function public.vota_cambiar_poll(p_id bigint, p_cambios jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  update public.vota_polls set datos = datos || (p_cambios - 'id') where id = p_id;
end;
$$;

-- Restaurar un voto por equivocación: el afiliado podrá votar de nuevo
-- (p_idx: en voto secreto, la opción que el afiliado indica; en voto público se toma la suya)
create or replace function public.vota_restaurar(p_poll bigint, p_cedula text, p_idx int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.vota_polls; r public.vota_participacion; i int; publica boolean;
begin
  perform public.vota_exigir_admin();
  select * into p from public.vota_polls where id = p_poll;
  if p.id is null then return jsonb_build_object('error', 'Consulta no encontrada.'); end if;
  if not public.vota_abierta(p.datos) then return jsonb_build_object('error', 'Solo se puede restaurar un voto mientras la consulta está abierta.'); end if;
  select * into r from public.vota_participacion where poll_id = p_poll and cedula = p_cedula for update;
  if r.cedula is null then return jsonb_build_object('error', 'Este afiliado no ha votado.'); end if;
  publica := coalesce((p.datos ->> 'publica')::boolean, false);
  if publica then
    select idx into i from public.vota_votos where poll_id = p_poll and cedula = p_cedula;
    if i is null then return jsonb_build_object('error', 'No se encontró el voto de este afiliado.'); end if;
  else
    i := p_idx;
  end if;
  if i is null or i < 0 or i >= 10 or (select c[i + 1] from public.vota_conteos where poll_id = p_poll) < 1 then
    return jsonb_build_object('error', 'No se pudo restaurar: la opción elegida no tiene votos. Revise con el afiliado qué opción eligió.');
  end if;
  update public.vota_conteos set c[i + 1] = c[i + 1] - 1, total = total - 1 where poll_id = p_poll;
  delete from public.vota_participacion where poll_id = p_poll and cedula = p_cedula;
  delete from public.vota_votos where poll_id = p_poll and cedula = p_cedula;
  delete from public.vota_codigos where codigo = r.codigo;
  return jsonb_build_object('ok', true);
end;
$$;

-- Guardar ajustes (se mezclan con los que ya hay)
create or replace function public.vota_guardar_config(p_clave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  if p_clave not in ('general', 'publico', 'ingreso') then raise exception 'Ajuste desconocido: %', p_clave; end if;
  insert into public.vota_config (clave, valor) values (p_clave, p_valor)
  on conflict (clave) do update set valor = public.vota_config.valor || excluded.valor;
end;
$$;

-- Borra un administrador (queda copia en vota_eliminados). Nadie puede borrarse a sí mismo.
create or replace function public.vota_eliminar_admin(p_uid uuid, p_fecha text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  if p_uid = auth.uid() then raise exception 'No puede eliminarse a sí mismo.'; end if;
  insert into public.vota_eliminados (tipo, datos, fecha, eliminado_por)
  select 'Administrador', to_jsonb(a) - 'uid', left(p_fecha, 40), (select nombre from public.vota_admins where uid = auth.uid())
  from public.vota_admins a where a.uid = p_uid;
  delete from public.vota_admins where uid = p_uid;
end;
$$;

-- Borra toda la bitácora; devuelve cuántos registros había
create or replace function public.vota_limpiar_auditoria() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.vota_exigir_admin();
  delete from public.vota_auditoria where true;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Respaldo completo (todas las tablas de este sistema, sin claves ni sesiones)
create or replace function public.vota_respaldo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.vota_exigir_admin();
  return jsonb_build_object(
    'afiliados',     coalesce((select jsonb_agg(to_jsonb(a)) from public.carnet_afiliados a), '[]'),
    'cuentas',       coalesce((select jsonb_agg(to_jsonb(c) - 'pin_hash' - 'act_hash') from public.vota_cuentas c), '[]'),
    'admins',        coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_admins x), '[]'),
    'config',        coalesce((select jsonb_object_agg(clave, valor) from public.vota_config), '{}'),
    'polls',         coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_polls x), '[]'),
    'conteos',       coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_conteos x), '[]'),
    'participacion', coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_participacion x), '[]'),
    'votos',         coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_votos x), '[]'),
    'codigos',       coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_codigos x), '[]'),
    'auditoria',     coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_auditoria x), '[]'),
    'alertas',       coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_alertas x), '[]'),
    'eliminados',    coalesce((select jsonb_agg(to_jsonb(x)) from public.vota_eliminados x), '[]'));
end;
$$;


-- ---------------------------------------------------------------------
-- 8. Quién puede llamar cada función
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  -- Pantalla de ingreso y afiliados (sin cuenta de Supabase)
  foreach f in array array['vota_publico()', 'vota_estado_cedula(text)', 'vota_activar(text, text, text)',
    'vota_login(text, text)', 'vota_ingresar_codigo(text, text, text)', 'vota_avisar_intento(text)',
    'vota_yo(text)', 'vota_datos(text)', 'vota_votar(text, bigint, int, text, text)', 'vota_salir(text)',
    'vota_verificar(text, text)', 'vota_log(text, text, text)']
  loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  -- Administradores (cada función revisa además que sea administrador activo)
  foreach f in array array['vota_instalar(text)', 'vota_admin_perfil()', 'vota_agregar_admin(text, text)',
    'vota_padron()', 'vota_guardar_afiliados(jsonb)', 'vota_cambiar_afiliado(text, jsonb)', 'vota_liberar(text)',
    'vota_eliminar_afiliado(text, text)', 'vota_eliminar_todos(text)', 'vota_cambiar_poll(bigint, jsonb)',
    'vota_restaurar(bigint, text, int)', 'vota_guardar_config(text, jsonb)', 'vota_eliminar_admin(uuid, text)',
    'vota_limpiar_auditoria()', 'vota_respaldo()']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 9. Primer administrador (opcional): descomente, cambie el correo y corra
--    solo estas líneas. La cuenta debe existir en Authentication → Users.
-- ---------------------------------------------------------------------
-- insert into public.vota_admins (uid, nombre, correo)
-- select id, 'Edwin Escobar', email from auth.users where email = 'eescobar@adepcr.org'
-- on conflict (uid) do update set activo = true;
