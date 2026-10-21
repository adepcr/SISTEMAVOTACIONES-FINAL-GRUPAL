# ADEP Vota como app (Android, iPhone y PWA)

La página web sigue funcionando igual. Además, ahora se puede usar como app de tres formas:

## 1. PWA (Android e iPhone, sin tiendas) — la forma principal
En la pantalla de ingreso aparece el botón **«Instalar la app en este celular»** (`js/instalar.js`): un toque y queda en la pantalla de inicio.
Como es la misma página publicada, cada cambio les llega solo a los afiliados, sin reinstalar nada.
Si el botón no aparece:
- **Android (Chrome):** menú ⋮ → **Instalar app** / **Agregar a pantalla de inicio**.
- **iPhone (Safari):** botón **Compartir** → **Agregar a pantalla de inicio**.

## 2. App de Android (.apk, opcional)
**Sin instalar nada:** cada vez que se sube un cambio a GitHub, se construye el APK solo.
Entre a la pestaña **Actions** del repositorio → la última ejecución de "Publicar app y página" → descargue **ADEP-Vota-android** en "Artifacts".
Dentro del .zip está `app-debug.apk`; páselo al celular e instálelo (permita "instalar apps de origen desconocido").
⚠️ El APK no se actualiza solo (lleva la página por dentro) y cada uno sale con una firma distinta: para instalar uno nuevo hay que desinstalar el anterior.

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
- En la app, el acta, los comprobantes y los archivos de Excel no se "descargan": se abre el menú **Compartir** para guardarlos o enviarlos (`js/app-movil.js`).
- «Escuchar» y el robot Robi usan la voz del teléfono (complemento `@capacitor-community/text-to-speech`).
- El ícono usa el logo oficial de ADEP (`img/logo-adep.png`). Si cambia el logo, regenere los íconos con
  `npx @capacitor/assets generate --android --ios` (usa los archivos de `assets/`).
