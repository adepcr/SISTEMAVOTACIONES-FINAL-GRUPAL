# Seguridad de ADEP Vota

Los datos están en **Supabase**, en el mismo proyecto de ADEP que el inventario y el carnet (`inventario-archivo`).
Todo lo de este sistema está definido en **`supabase/votaciones.sql`** (tablas `vota_*` y sus funciones).

## Qué protege el sistema

| Riesgo | Cómo se evita |
|---|---|
| Descargar la base de datos completa | Con la clave pública nadie puede leer las tablas. Los afiliados solo usan funciones (`vota_*`) que revisan su sesión y devuelven únicamente lo que les corresponde. |
| Que un afiliado vea el inventario | Los afiliados **no tienen cuenta de Supabase**: entran con su cédula y una sesión propia de este sistema. Las cuentas de Supabase son solo para el personal (inventario y administradores de ADEP Vota). |
| Robar o adivinar claves | La clave de 6 números se guarda cifrada (bcrypt), nunca tal cual. Tras 5 claves malas la cédula queda frenada 15 minutos, y cada dirección IP tiene un límite de intentos fallidos. |
| Votar dos veces, en nombre de otro o fuera de horario | El voto lo registra la función `vota_votar`, en un solo paso: revisa la sesión, que la consulta esté abierta con la hora del servidor y que la cédula no haya votado (la base de datos no acepta un segundo registro). |
| Alterar resultados | Nadie puede escribir en los conteos directamente. Solo `vota_votar` suma exactamente 1, y solo un administrador puede restaurar un voto mientras la consulta está abierta. |
| Saber qué votó cada persona | En voto secreto la elección se guarda **solo como un conteo** (`vota_conteos`), sin cédula ni nombre. La participación (`vota_participacion`) dice quién votó, nunca qué eligió. El comprobante del voto secreto solo guarda el día, no la hora. |
| Hacerse administrador | Solo un administrador activo puede dar permiso a otro. El primero se crea una sola vez, en la instalación. |
| Borrar huellas | La bitácora solo la leen y borran los administradores; cada registro guarda el nombre real de quien lo hizo y la hora del servidor. |

### Cómo ingresan los afiliados
1. La lista de afiliados es **propia de ADEP Vota** (`vota_afiliados`): cambiarla no toca la lista del carnet. Hoy son los representantes de la
   Junta Directiva Central; se cargan con un SQL aparte (con datos personales: no se sube a GitHub) o desde **Afiliados → Importar**.
2. Hay dos formas de entrar:
   - **Código de activación** (8 caracteres, por ejemplo `K7P2-9QXM`): el administrador lo genera en **Afiliados → Nuevo código** y se muestra **una sola vez**. El afiliado escribe su cédula, el código, y **crea su propia clave de 6 números**. Después entra siempre con cédula y clave.
   - **Código general de ingreso** (6 números, vence solo): la cédula queda amarrada al primer celular que lo use (una cédula, un celular). Si cambia de celular, el administrador pulsa **«Liberar cédula»**.
   - **«Guardar la sesión en este dispositivo»**: si el afiliado la marca, la próxima vez entra directo. Si no, la sesión dura solo
     mientras la página esté abierta y al volver debe escribir de nuevo el código (o su clave). El celular sigue reconocido por una
     «llave» guardada en él, así que nadie más puede usar esa cédula desde otro celular.
3. ¿Olvidó la clave? El administrador pulsa **«Nuevo código»**: la cuenta anterior deja de funcionar.

De la base de datos no se puede sacar el código de activación: solo se guarda su huella (SHA-256).

Quien sale de la lista (o el administrador desactiva) pierde la sesión en ese momento. Desactivar solo impide votar;
**Eliminar** lo quita de la lista de ADEP Vota (nunca de la del carnet).

---

## Instalar o actualizar la base de datos (una sola vez, y cada vez que cambie `supabase/votaciones.sql`)

1. https://supabase.com/dashboard → proyecto **inventario-archivo** → **SQL Editor**.
2. Pegue **todo** el archivo `supabase/votaciones.sql` y toque **Run**. Se puede correr varias veces sin perder datos.
3. **Authentication → URL Configuration → Redirect URLs**: agregue `https://adepcr.github.io/SISTEMAVOTACIONES-FINAL-GRUPAL/**`
   (y en **Site URL**, `https://adepcr.github.io/SISTEMAVOTACIONES-FINAL-GRUPAL/`)
   (para que el enlace de «Olvidé mi contraseña» de los administradores vuelva a esta página y no al inventario).

### Primer administrador
- Abra la página → pestaña **Administrador** → aparece **Configuración inicial**.
- Escriba su nombre y entre con su **cuenta de Supabase de ADEP** (la misma del inventario). Esto solo funciona una vez.
- Otra forma: en el SQL Editor, corra las líneas del final de `supabase/votaciones.sql` (sección 9) con el correo de la persona.

### Más administradores
En ADEP Vota → **Administradores**: nombre, correo y una contraseña (mínimo 8 caracteres) → **Crear administrador**.
La cuenta queda creada y confirmada en ese momento (función `vota_crear_admin`; solo la puede usar un administrador activo).
Si el correo ya tiene cuenta (por ejemplo, del inventario), solo se le da el permiso y sigue entrando con su contraseña de siempre.

Tener cuenta de Supabase **no** da permiso en ADEP Vota: hay que agregarla aquí. Y al revés: un administrador de ADEP Vota
puede consultar el inventario como «lector», porque es la misma cuenta del personal de ADEP.

---

## Límites del plan gratuito de Supabase

- 500 MB de base de datos para los tres sistemas (inventario, carnet y votaciones). ADEP Vota usa muy poco (no guarda fotos).
- El proyecto se **pausa** si pasa 7 días sin uso. El carnet y el inventario ya lo mantienen despierto con una consulta diaria. Si aun así se pausa: Supabase → **Restore project** (no se pierde nada).
- **No hay respaldos automáticos**: descargue el respaldo completo (**Respaldo** en el sistema) cada semana y después de cada votación.
- La página revisa si hay cambios cada 3 segundos (el administrador, cada 5): todo aparece solo, sin recargar.

---

## Para técnicos: probar la seguridad

Las pruebas están en `supabase/pruebas/pruebas.sql` (votar dos veces, cédula de otro, consulta cerrada o sin publicar, opción inexistente,
sesión inventada, clave por fuerza bruta, segundo celular, leer tablas sin permiso, hacerse administrador, firmar la bitácora como otro,
lista mensual, pedir ayuda o cambios de datos sin sesión, aprobar pedidos sin ser administrador, crear administradores sin serlo,
afiliados sin filial en la lista, etc.: 96 comprobaciones). Corren en un PostgreSQL local que imita lo mínimo de Supabase (`supabase/pruebas/supabase-simulado.sql`), **nunca en Supabase**:

```bash
PGHOST=localhost PGUSER=postgres sh supabase/pruebas/correr.sh
```

Necesita PostgreSQL 15 o más nuevo.
