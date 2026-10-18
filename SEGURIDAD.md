# Seguridad de ADEP Vota

## Qué protege el sistema

| Riesgo | Cómo se evita |
|---|---|
| Descargar la base de datos completa | Cada persona solo puede leer lo que le corresponde (reglas de `firestore.rules`). Sin iniciar sesión no se puede leer nada. |
| Robar o adivinar claves | Las contraseñas las guarda **Firebase Authentication**, nunca la base de datos. Firebase bloquea temporalmente a quien prueba muchas claves. |
| Votar dos veces, en nombre de otro o fuera de horario | Las reglas solo aceptan **un voto por afiliado**, de su propia cuenta y con la consulta abierta. |
| Alterar resultados | Un afiliado solo puede sumar **exactamente 1 voto a una opción**, y solo junto con su registro de participación. |
| Saber qué votó cada persona | En voto secreto, la elección se guarda **solo como un conteo** (`conteos`), sin cédula ni nombre. La participación (`participacion`) dice quién votó, nunca qué eligió. |
| Hacerse administrador | Solo un administrador puede crear otro. El primero se crea una sola vez, en la instalación. |
| Borrar huellas | La bitácora solo la leen y borran los administradores; cada registro guarda quién lo hizo y la hora del servidor (no se puede falsificar). |

### Cómo ingresan los afiliados
1. El administrador registra al afiliado (o lo importa desde Excel). El sistema genera un **código de activación** de 8 caracteres, por ejemplo `K7P2-9QXM`. Se muestra **una sola vez**.
2. Se entrega en persona o por WhatsApp.
3. El afiliado toca **«Es mi primera vez»**, escribe su cédula y el código, y **crea su propia clave de 6 números**. El código sirve una sola vez.
4. Después ingresa siempre con cédula y clave.
5. ¿Olvidó la clave? El administrador pulsa **«Nuevo código»**: la cuenta anterior deja de funcionar y el afiliado repite el paso 3.

De la base de datos no se puede sacar el código: solo se guarda su huella (SHA-256), y las reglas comprueban que el afiliado escribió el código correcto.

---

## Pasos para activarlo (una sola vez, en la consola de Firebase)

Entre a **https://console.firebase.google.com** → proyecto **proyectoabi-563e6**.

### 1. Activar el inicio de sesión
1. Menú izquierdo: **Compilación → Authentication** → botón **Comenzar** (si aparece).
2. Pestaña **Método de inicio de sesión** (*Sign-in method*).
3. Elija **Correo electrónico/contraseña**, active el **primer** interruptor y pulse **Guardar**.

### 2. Publicar las reglas de seguridad
1. Menú izquierdo: **Compilación → Firestore Database** → pestaña **Reglas**.
2. Borre todo lo que haya y pegue el contenido completo del archivo **`firestore.rules`** de este proyecto.
3. Pulse **Publicar**.

### 3. Borrar los datos de prueba del sistema anterior
1. En **Firestore Database → Datos**, busque la colección **`adep`**.
2. Menú ⋮ de la colección → **Eliminar colección**.
   (Con las reglas nuevas ya nadie puede leerla, pero contenía las claves del sistema anterior.)

### 4. Publicar el sitio y crear el primer administrador
1. Publique la versión nueva del sitio (como lo hace siempre).
2. Abra la página → pestaña **Administrador** → aparecerá **Configuración inicial**.
3. Escriba su nombre, correo y una contraseña de al menos 8 caracteres. Este formulario **solo funciona una vez**.
4. Desde **Administradores** puede crear más cuentas. Si alguien olvida su contraseña, use **«Olvidé mi contraseña»** en el ingreso o **«Enviar correo de contraseña»** en la lista.

### 5. Recomendado
- **Authentication → Plantillas → Restablecimiento de contraseña**: cambie el idioma a **español**.
- **Authentication → Configuración → Dominios autorizados**: agregue el dominio donde publica el sitio, si no está.

---

## Límites del plan gratuito (Spark)

- **Cuota diaria gratis** de Firestore: 50.000 lecturas y 20.000 escrituras por día. Alcanza de sobra para una asociación; si se supera, el sistema se detiene hasta el día siguiente (no cobra).
- **Voto secreto:** nadie puede ver qué votó cada persona, ni siquiera un administrador desde el sistema. Sin funciones en el servidor (plan Blaze), un técnico que vigilara la base de datos **en el mismo segundo** en que alguien vota podría intentar relacionar la hora del voto con el conteo. Para eliminar incluso eso, se puede pasar al plan Blaze y mover el voto a una función del servidor.
- La clave del afiliado es de 6 números (pensada para personas mayores). Firebase limita los intentos fallidos, pero conviene recordar a los afiliados que no usen claves fáciles.

---

## Para técnicos: probar las reglas

Las pruebas están en `tests/reglas.test.mjs` (45 casos: votar dos veces, sumar a dos opciones, códigos falsos, leer datos ajenos, etc.). Necesitan Node.js y Java:

```bash
cd tests
npm install
npx firebase emulators:exec --only firestore --project demo-adep "node reglas.test.mjs"
```

Para publicar las reglas desde la terminal en vez de la consola:

```bash
npx firebase deploy --only firestore:rules --project proyectoabi-563e6
```
