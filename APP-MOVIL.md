# ADEP Vota como app (Android, iPhone y PWA)

La página web sigue funcionando igual. Además, ahora se puede usar como app de tres formas:

## 1. PWA (Android e iPhone, sin tiendas)
Abra el link web en el celular:
- **Android (Chrome):** menú ⋮ → **Instalar app** / **Agregar a pantalla de inicio**.
- **iPhone (Safari):** botón **Compartir** → **Agregar a pantalla de inicio**.

## 2. App de Android (.apk)
**Sin instalar nada:** cada vez que se sube un cambio a GitHub, se construye el APK solo.
Entre a la pestaña **Actions** del repositorio → la última ejecución de "App Android" → descargue **ADEP-Vota-android** en "Artifacts".
Dentro del .zip está `app-debug.apk`; páselo al celular e instálelo (permita "instalar apps de origen desconocido").

**Con Android Studio** (para publicar en Google Play):
```bash
npm install
npm run android
```
En Android Studio: **Build → Generate Signed App Bundle / APK**.

## 3. App de iPhone
Necesita una **Mac con Xcode** (y una cuenta de Apple Developer para publicar en la App Store):
```bash
npm install
npm run ios
```

## Cada vez que cambie la página
Edite los archivos como siempre (`index.html`, `login.html`, `css/`, `js/`, `img/`) y luego ejecute
`npm run sync` para pasar los cambios a la app.
Si agrega un archivo o carpeta nueva en la raíz, agréguelo también a la lista en `scripts/copiar-web.js`.

## Notas
- En la app, los PDF y CSV no se "descargan": se abre el menú **Compartir** para guardarlos o enviarlos (`js/app-movil.js`).
- El ícono está en `assets/icon.png` (1024×1024) e `img/icons/`. Para usar el logo oficial, reemplace esas imágenes y ejecute
  `npx @capacitor/assets generate --android --ios`.
