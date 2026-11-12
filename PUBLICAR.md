# Publicar ADEP Vota (página + app)

- **Datos y cuentas:** Supabase (proyecto `inventario-archivo` de ADEP). Ver [SEGURIDAD.md](SEGURIDAD.md).
- **Página:** Vercel, conectado a este repositorio. Cada cambio que se sube a `main` se publica solo en
  **https://sistemavotaciones-final-grupal.vercel.app** (en 1 o 2 minutos).

No se usa Firebase para nada.

## Conectar Vercel (una sola vez)
1. Entre a https://vercel.com y toque **Sign Up / Log In → Continue with GitHub**.
2. **Add New… → Project** → busque **SISTEMAVOTACIONES-FINAL-GRUPAL** → **Import**.
   (Si no aparece: **Adjust GitHub App Permissions** y dele acceso a ese repositorio de la organización `adepcr`.)
3. No cambie nada: el archivo `vercel.json` ya dice cómo armar la página
   (copia `index.html`, `login.html`, `css`, `js`, `img`… a la carpeta `www` y publica esa carpeta).
4. Toque **Deploy**. Al terminar, Vercel muestra la dirección de la página.

> Si la dirección que le dio Vercel **no** es `https://sistemavotaciones-final-grupal.vercel.app`,
> cámbiela en `js/db.js` (`URL_PUBLICADA`), en el README y en Supabase (paso siguiente).

## Avisarle a Supabase la dirección de la página (una sola vez)
Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://sistemavotaciones-final-grupal.vercel.app`
- **Redirect URLs:** agregue `https://sistemavotaciones-final-grupal.vercel.app/**`

Así el enlace de «Olvidé mi contraseña» de los administradores vuelve a esta página.

## Cuando cambia la base de datos
Si cambia `supabase/votaciones.sql`, péguelo completo en Supabase → **SQL Editor** → **Run**
(se puede correr varias veces sin perder datos). Vercel no toca la base de datos.

## Cómo reciben la app los afiliados
En la pantalla de ingreso (y dentro del sistema) aparece el botón **«Instalar la app en este celular»** (`js/instalar.js`).
Con un toque, el ícono de ADEP Vota queda en la pantalla de inicio, sin descargar archivos ni dar permisos de «origen desconocido».
- En iPhone el botón explica cómo hacerlo desde Safari: **Compartir → Agregar a pantalla de inicio**.
- Esa app **es la misma página publicada**: cada cambio que se sube a `main` les llega solo, sin reinstalar nada.
  Si un celular todavía muestra la versión anterior, basta con cerrar la app por completo y volver a abrirla.

## Archivo APK (opcional)
GitHub arma un APK de Android en cada cambio: **Actions → Armar app Android → la última ejecución → Artifacts → ADEP-Vota-android** (viene en un .zip).
No hace falta usarlo. Ese APK lleva la página guardada por dentro, así que **no se actualiza solo**: hay que volver a descargarlo con cada cambio.
Además, cada uno sale firmado con una llave distinta, por eso para instalar uno nuevo hay que desinstalar antes el anterior.
Si aun así se quiere ofrecer, un administrador pega su enlace en **Afiliados → Enlace del archivo APK** y aparece como opción secundaria en la pantalla de ingreso.

## Probar en la computadora (sin publicar)
```bash
python -m http.server 8000
```
y abra http://localhost:8000/login.html (usa el Supabase real de ADEP).
