# Publicar ADEP Vota (página + app)

Cada vez que se sube un cambio a `main`, GitHub publica la página en **https://adep-vota.web.app** (en unos 5 minutos).
No hay que hacer nada más.

> 📦 Desde noviembre de 2026 el repositorio oficial es **https://github.com/adepcr/SISTEMAVOTACIONES-FINAL-GRUPAL** (organización de ADEP): reúne los proyectos de Abigail, Josué y Rashid.
> Para que publique solo, hay que guardar en este repositorio la llave `FIREBASE_SERVICE_ACCOUNT` (pasos 2 y 4).

## Cómo reciben la app los afiliados
En la pantalla de ingreso (y dentro del sistema) aparece el botón **«Instalar la app en este celular»** (`js/instalar.js`).
Con un toque, el ícono de ADEP Vota queda en la pantalla de inicio, sin descargar archivos ni dar permisos de «origen desconocido».
- En iPhone el botón explica cómo hacerlo desde Safari: **Compartir → Agregar a pantalla de inicio**.
- Esa app **es la misma página publicada**: cada cambio que se sube a `main` les llega solo, sin reinstalar nada.
  Si un celular todavía muestra la versión anterior, basta con cerrar la app por completo y volver a abrirla.

## Archivo APK (opcional)
GitHub también arma un APK de Android en cada cambio: **Actions → Publicar app y página → la última ejecución → Artifacts → ADEP-Vota-android** (viene en un .zip).
No hace falta usarlo. Ese APK lleva la página guardada por dentro, así que **no se actualiza solo**: hay que volver a descargarlo con cada cambio.
Además, cada uno sale firmado con una llave distinta, por eso para instalar uno nuevo hay que desinstalar antes el anterior.
Si aun así se quiere ofrecer, un administrador pega su enlace en **Afiliados → Enlace del archivo APK** y aparece como opción secundaria en la pantalla de ingreso.

## Configuración inicial (ya está hecha)
Para publicar la página, GitHub necesita permiso en Firebase. Esto se configuró **una sola vez**; se deja aquí por si hubiera que repetirlo.

### 1. Activar Hosting en Firebase
1. https://console.firebase.google.com → proyecto **ADEP Vota**.
2. Menú izquierdo: **Hosting y sin servidores → Hosting** → **Comenzar**.
3. Puede saltar todos los pasos que muestra (Siguiente → Siguiente → Continuar a la consola).

### 2. Crear la llave para GitHub
1. En Firebase: ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. Botón **Generar nueva clave privada** → **Generar clave**. Se descarga un archivo `.json`.
   ⚠️ Esa llave es secreta: no la suba a GitHub como archivo ni la comparta.

### 3. Darle permiso para publicar la página
1. Abra https://console.cloud.google.com/iam-admin/iam?project=adep-vota
2. Busque la cuenta que empieza con **firebase-adminsdk-** y pulse el lápiz ✏️ (Editar).
3. **Agregar otro rol** → escriba **Firebase Hosting** → elija **Administrador de Firebase Hosting** → **Guardar**.

### 4. Guardar la llave en GitHub
1. https://github.com/adepcr/SISTEMAVOTACIONES-FINAL-GRUPAL/settings/secrets/actions
2. **New repository secret**.
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Secret: abra el archivo `.json` del paso 2 con el Bloc de notas, copie **todo** y péguelo.
5. **Add secret**. Después puede borrar el archivo `.json` de su computadora.

### 5. Publicar
1. https://github.com/adepcr/SISTEMAVOTACIONES-FINAL-GRUPAL/actions → **Publicar app y página** → **Run workflow** → **Run workflow**.
2. En unos 5 minutos la página queda en **https://adep-vota.web.app**.

Desde entonces se publica sola con cada cambio en `main`.

## Notas
- En iPhone no se instala el APK: se usa el botón «Instalar la app en este celular» (Safari → **Compartir → Agregar a pantalla de inicio**).
- Firebase ya **solo publica la página** (Hosting). Los datos están en **Supabase** (proyecto `inventario-archivo` de ADEP).
  Cuando cambia `supabase/votaciones.sql`, se pega a mano en Supabase → **SQL Editor** → **Run** (ver `SEGURIDAD.md`).
