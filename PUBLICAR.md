# Publicar ADEP Vota (página + app de Android)

Cada vez que se sube un cambio a `main`, GitHub:
1. Arma la app de Android (APK).
2. Publica la página en **https://adep-vota.web.app**.

El plan gratuito de Firebase **no permite poner el APK dentro de la página**. Para compartir la app:
1. Descargue el APK: **Actions → Publicar app y página → la última ejecución → Artifacts → ADEP-Vota-android** (viene en un .zip).
2. Súbalo a **Google Drive** → clic derecho → **Compartir** → «Cualquier persona con el enlace» → **Copiar enlace**.
3. En la página, como administrador: **Afiliados → Enlace de descarga de la app** → pegue el enlace → **Guardar**.
   Aparecerá el botón «Descargar la app para Android» en la pantalla de ingreso.

Para el paso 2, GitHub necesita permiso para publicar en Firebase. Se configura **una sola vez**:

## 1. Activar Hosting en Firebase
1. https://console.firebase.google.com → proyecto **ADEP Vota**.
2. Menú izquierdo: **Hosting y sin servidores → Hosting** → **Comenzar**.
3. Puede saltar todos los pasos que muestra (Siguiente → Siguiente → Continuar a la consola).

## 2. Crear la llave para GitHub
1. En Firebase: ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. Botón **Generar nueva clave privada** → **Generar clave**. Se descarga un archivo `.json`.
   ⚠️ Esa llave es secreta: no la suba a GitHub como archivo ni la comparta.

## 3. Darle permiso para publicar la página
1. Abra https://console.cloud.google.com/iam-admin/iam?project=adep-vota
2. Busque la cuenta que empieza con **firebase-adminsdk-** y pulse el lápiz ✏️ (Editar).
3. **Agregar otro rol** → escriba **Firebase Hosting** → elija **Administrador de Firebase Hosting** → **Guardar**.

## 4. Guardar la llave en GitHub
1. https://github.com/12027-0289/sistema-votaciones/settings/secrets/actions
2. **New repository secret**.
3. Name: `FIREBASE_SERVICE_ACCOUNT`
4. Secret: abra el archivo `.json` del paso 2 con el Bloc de notas, copie **todo** y péguelo.
5. **Add secret**. Después puede borrar el archivo `.json` de su computadora.

## 5. Publicar
1. https://github.com/12027-0289/sistema-votaciones/actions → **Publicar app y página** → **Run workflow** → **Run workflow**.
2. En unos 5 minutos la página queda en **https://adep-vota.web.app**.

Desde entonces se publica sola con cada cambio en `main`.

## Notas
- En iPhone no se instala el APK: en Safari se usa **Compartir → Agregar a pantalla de inicio**.
- Las reglas de seguridad (`firestore.rules`) se siguen publicando a mano en la consola de Firebase cuando cambian.
