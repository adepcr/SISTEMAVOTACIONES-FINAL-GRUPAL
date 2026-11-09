-- Pruebas de seguridad de votaciones.sql en un PostgreSQL local (ver supabase/pruebas/correr.sh).
-- Cada "ok" detiene todo si algo no se cumple.
\set ON_ERROR_STOP 1
\set QUIET 1
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- ---------- Datos de prueba ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@adepcr.org'),
  ('00000000-0000-0000-0000-00000000000b', 'inventario@adepcr.org');
select public.carnet_reemplazar_listas(
  '[{"cedula":"101110111","activo":true,"nombre":"ANA MORA","filial":"SAN JOSE"},
    {"cedula":"202220222","activo":true,"nombre":"LUIS SOTO","filial":"HEREDIA"},
    {"cedula":"303330333","activo":false,"nombre":"EVA ROJAS","filial":"CARTAGO"},
    {"cedula":"404440444","activo":true}]'::jsonb, '["SAN JOSE","HEREDIA"]'::jsonb);

select public.vota_huella_activacion('101110111', 'ABCD2345') as h1, public.vota_huella_activacion('303330333', 'ABCD2345') as h3 \gset

-- ---------- Sin sesión (clave pública) ----------
set role anon;
select pg_temp.ok((select (public.vota_publico() ->> 'instalado')::boolean) = false, 'sin administradores, la página ofrece instalar');
do $$ begin perform 1 from public.vota_cuentas; raise exception 'anon leyó vota_cuentas'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from public.carnet_afiliados; raise exception 'anon leyó la lista'; exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from public.vota_participacion; raise exception 'anon leyó participación'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.vota_padron(); raise exception 'anon llamó vota_padron'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.vota_afiliado('101110111'); raise exception 'anon llamó un ayudante interno'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.vota_nueva_sesion('101110111', 'clave'); raise exception 'anon creó una sesión'; exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'anon no puede leer tablas ni llamar funciones internas o de administrador');
reset role;

-- ---------- Cuenta del inventario (no administradora) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.ok((select count(*) from public.vota_polls) = 0, 'cuenta del inventario no ve consultas');
do $$ begin perform public.vota_padron(); raise exception 'no admin vio el padrón'; exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'cuenta del inventario no puede ver el padrón');
-- Instala: queda como primer administrador; un segundo intento falla
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok(public.vota_instalar('Admin Prueba') ->> 'ok' = 'true', 'primera instalación crea el administrador');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.ok(public.vota_instalar('Intruso') ? 'error', 'nadie más puede instalar después');
select pg_temp.ok(not public.vota_es_admin(), 'la cuenta del inventario sigue sin ser administradora');
do $$ begin insert into public.vota_admins (uid, nombre, correo) values ('00000000-0000-0000-0000-00000000000b', 'Yo', 'x');
  raise exception 'no admin se hizo admin'; exception when insufficient_privilege then null; end $$;
select pg_temp.ok(true, 'no puede agregarse como administrador');

-- ---------- Administrador ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok(jsonb_array_length(public.vota_padron()) = 4, 'administrador ve los 4 afiliados de la lista compartida');
select pg_temp.ok((select x ->> 'nombre' from jsonb_array_elements(public.vota_padron()) x where x ->> 'cedula' = '404440444') = 'Afiliado 404440444',
  'afiliado sin nombre se muestra con su cédula');
-- Códigos de activación (la página calcula la huella)
select public.vota_guardar_afiliados(jsonb_build_array(
  jsonb_build_object('cedula', '101110111', 'telefono', '8888-0000', 'hash', :'h1'),
  jsonb_build_object('cedula', '303330333', 'hash', :'h3')));
-- Consultas: una secreta y una pública, todavía sin publicar
insert into public.vota_polls (id, datos) values
  (1, '{"titulo":"Secreta","opciones":["Sí","No"],"publicada":false,"publica":false,"aperturaMs":0,"cierreMs":0}'),
  (2, '{"titulo":"Pública","opciones":["A","B","C"],"publicada":true,"publica":true,"aperturaMs":0,"cierreMs":0}'),
  (3, '{"titulo":"Cerrada","opciones":["X","Y"],"publicada":true,"publica":false,"aperturaMs":0,"cierreMs":1000}');
select pg_temp.ok((select count(*) from public.vota_conteos) = 3, 'cada consulta nace con su conteo');
select public.vota_guardar_config('ingreso', '{"activo":true,"codigo":"123456","aprobacion":false}'::jsonb
  || jsonb_build_object('venceMs', (extract(epoch from now()) * 1000)::bigint + 3600000));
reset role;

-- ---------- Afiliado: activación y clave ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.ok(public.vota_estado_cedula('101110111') = 'sin-activar', 'cédula sin activar');
select pg_temp.ok(public.vota_activar('101110111', 'ZZZZ9999', '111222') ? 'error', 'código de activación incorrecto no entra');
select pg_temp.ok(public.vota_activar('303330333', 'ABCD2345', '111222') ? 'error', 'afiliado inactivo en la lista no puede activar');
select public.vota_activar('101110111', 'ABCD2345', '111222') ->> 'token' as ana \gset
select pg_temp.ok(length(:'ana') = 64, 'código correcto activa la cuenta y da una sesión');
select pg_temp.ok(public.vota_activar('101110111', 'ABCD2345', '999999') ? 'error', 'el código de activación no se puede usar dos veces');
select pg_temp.ok(public.vota_estado_cedula('101110111') = 'activa', 'la cédula queda activa');
select pg_temp.ok(public.vota_login('101110111', '000000') ? 'error', 'clave incorrecta no entra');
select pg_temp.ok(public.vota_login('101110111', '111222') ? 'token', 'clave correcta entra');
select pg_temp.ok(public.vota_yo(:'ana') ->> 'nombre' = 'ANA MORA', 'la sesión dice quién es (nombre de la lista compartida)');
select pg_temp.ok(public.vota_yo('inventado') is null, 'una sesión inventada no vale');
-- Votar
select pg_temp.ok(public.vota_votar(:'ana', 1, 0, 'hoy', 'hoy') ? 'error', 'no se vota en una consulta sin publicar');
select pg_temp.ok(public.vota_votar(:'ana', 3, 0, 'hoy', 'hoy') ? 'error', 'no se vota en una consulta cerrada');
select pg_temp.ok(public.vota_votar(:'ana', 2, 7, 'hoy', 'hoy') ? 'error', 'no se vota por una opción que no existe');
select pg_temp.ok(public.vota_votar(:'ana', 2, 1, 'hoy 10:00', 'hoy') ? 'codigo', 'voto válido');
select pg_temp.ok(public.vota_votar(:'ana', 2, 0, 'hoy', 'hoy') ->> 'error' = 'Ya emitió su voto en esta consulta.', 'no se vota dos veces');
select pg_temp.ok(public.vota_datos(:'ana') -> 'conteos' -> '2' = '{"c0":0,"c1":1,"c2":0,"c3":0,"c4":0,"c5":0,"c6":0,"c7":0,"c8":0,"c9":0,"total":1}'::jsonb,
  'el conteo sumó exactamente un voto a la opción elegida');
select pg_temp.ok((public.vota_datos(:'ana') -> 'votos' -> 0 ->> 'nombre') = 'ANA MORA', 'voto público queda con el nombre');
select pg_temp.ok(jsonb_array_length(public.vota_datos(:'ana') -> 'polls') = 2, 'el afiliado solo ve las consultas publicadas');
select (public.vota_datos(:'ana') -> 'participacion' -> 0 ->> 'codigo') as codigo_ana \gset
select pg_temp.ok(public.vota_verificar(:'ana', :'codigo_ana') ->> 'titulo' = 'Pública', 'el comprobante se puede verificar');
select pg_temp.ok(public.vota_verificar(null, :'codigo_ana') is null, 'sin sesión no se verifica');
-- Bloqueo por intentos: 5 claves malas
select public.vota_login('101110111', '000001'), public.vota_login('101110111', '000002'), public.vota_login('101110111', '000003'),
       public.vota_login('101110111', '000004'), public.vota_login('101110111', '000005') \g /dev/null
select pg_temp.ok(public.vota_login('101110111', '111222') ->> 'error' like 'Demasiados intentos%', 'tras 5 claves malas la cédula queda frenada 15 minutos');
reset role;

-- ---------- Ingreso con el código general (un celular por cédula) ----------
set role anon;
select pg_temp.ok(public.vota_ingresar_codigo('202220222', '000000', 'Android') ? 'error', 'código general incorrecto no entra');
select pg_temp.ok(public.vota_ingresar_codigo('999999999', '123456', 'Android') ? 'error', 'cédula que no está en la lista no entra');
select public.vota_ingresar_codigo('202220222', '123456', 'Android · Chrome') ->> 'token' as luis \gset
select pg_temp.ok(length(:'luis') = 64, 'código general correcto amarra la cédula a este celular');
select pg_temp.ok((public.vota_ingresar_codigo('202220222', '123456', 'iPhone') ->> 'enUso')::boolean, 'otro celular con la misma cédula es rechazado');
select public.vota_avisar_intento('202220222');
select pg_temp.ok(public.vota_ingresar_codigo('101110111', '123456', 'iPhone') ? 'error', 'una cédula con clave no se amarra a otro celular');
-- Luis no puede ver la participación de Ana (voto secreto: solo la suya)
select pg_temp.ok(jsonb_array_length(public.vota_datos(:'luis') -> 'participacion') = 0, 'un afiliado no ve quién más votó');
select public.vota_salir(:'luis');
select pg_temp.ok(public.vota_yo(:'luis') is not null, 'cerrar sesión no borra la llave del celular amarrado');
reset role;

-- ---------- Aprobación de ingresos y administración ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.ok((select count(*) from public.vota_alertas) = 1, 'el administrador ve el aviso del intento');
select public.vota_guardar_config('ingreso', '{"aprobacion":true}');
select public.vota_guardar_afiliados('[{"cedula":"404440444","nombre":"NUEVO NOMBRE","provincia":"HEREDIA"}]');
-- Restaurar el voto de Ana: la consulta pública toma su opción sola
select pg_temp.ok(public.vota_restaurar(2, '101110111', null) ->> 'ok' = 'true', 'administrador restaura un voto');
select pg_temp.ok((select total from public.vota_conteos where poll_id = 2) = 0, 'el conteo vuelve a cero');
-- Bloquear a Luis para votar (no toca la lista compartida)
select public.vota_cambiar_afiliado('202220222', '{"activo":false}');
reset role;
select pg_temp.ok((select activo from public.carnet_afiliados where cedula = '202220222'), 'bloquear para votar no quita el carnet');

set role anon;
select pg_temp.ok(public.vota_yo(:'luis') is null, 'afiliado bloqueado pierde la sesión');
select pg_temp.ok(public.vota_datos(:'luis') ->> 'error' = 'desactivado', 'la página sabe que fue desactivado (no que la sesión es falsa)');
select pg_temp.ok(public.vota_datos('inventado') ->> 'error' = 'sesion', 'sesión inventada: error de sesión');
select public.vota_ingresar_codigo('404440444', '123456', 'Android') ->> 'token' as nuevo \gset
select pg_temp.ok(public.vota_datos(:'nuevo') ->> 'error' = 'pendiente', 'con aprobación encendida el ingreso queda pendiente');
select pg_temp.ok(public.vota_votar(:'nuevo', 2, 0, 'hoy', 'hoy') ? 'error', 'pendiente no puede votar');
select pg_temp.ok(public.vota_yo(:'nuevo') ->> 'nombre' = 'NUEVO NOMBRE', 'nombre agregado por el administrador');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.vota_cambiar_afiliado('404440444', '{"pendiente":false}');
select public.vota_liberar('101110111');
reset role;
set role anon;
select pg_temp.ok(public.vota_datos(:'nuevo') ? 'yo', 'aprobado: ya ve las consultas');
select pg_temp.ok(public.vota_yo(:'ana') is null, 'cédula liberada: la sesión anterior deja de valer');
select pg_temp.ok(public.vota_estado_cedula('101110111') = 'sin-activar', 'cédula liberada puede entrar de nuevo');
reset role;

-- ---------- Bitácora: nadie firma como otro ----------
set role anon;
select public.vota_log(:'nuevo', 'Prueba', 'detalle');
select public.vota_log('inventado', 'Falsa', 'no debe quedar');
reset role;
select pg_temp.ok((select por from public.vota_auditoria where accion = 'Prueba') = 'NUEVO NOMBRE', 'la bitácora queda con el nombre real');
select pg_temp.ok(not exists (select 1 from public.vota_auditoria where accion = 'Falsa'), 'sin sesión válida no se escribe en la bitácora');

-- ---------- Reemplazo mensual de la lista (carnet) ----------
select public.carnet_reemplazar_listas('[{"cedula":"404440444","activo":true},{"cedula":"505550555","activo":true,"nombre":"ROSA"}]'::jsonb, '["HEREDIA"]'::jsonb);
select pg_temp.ok((select nombre from public.carnet_afiliados where cedula = '404440444') = 'NUEVO NOMBRE', 'si el reporte no trae nombre, se conserva el anterior');
set role anon;
select pg_temp.ok(public.vota_yo(:'nuevo') is not null, 'sigue en la lista: su sesión sigue valiendo');
select pg_temp.ok((public.vota_datos(:'nuevo') ->> 'padron')::int = 2, 'el padrón para el % de participación sale de la lista compartida');
reset role;
select public.carnet_reemplazar_listas('[{"cedula":"505550555","activo":true}]'::jsonb, '["HEREDIA"]'::jsonb);
set role anon;
select pg_temp.ok(public.vota_yo(:'nuevo') is null, 'quien sale de la lista mensual ya no puede entrar a votar');
reset role;

\echo 'Todas las pruebas pasaron.'
