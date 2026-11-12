# ADEP Vota — Sistema de votación (proyecto final grupal)

Sistema de votación oficial de ADEP (web, Android e iOS), con base de datos en **Supabase**
(la misma lista de afiliados del carnet).

- **Página:** https://adep-vota.web.app
- **Repositorio:** https://github.com/adepcr/SISTEMAVOTACIONES-FINAL-GRUPAL
- Cómo se publica: [PUBLICAR.md](PUBLICAR.md) · App móvil: [APP-MOVIL.md](APP-MOVIL.md) · Seguridad: [SEGURIDAD.md](SEGURIDAD.md)
- Base de datos: [supabase/votaciones.sql](supabase/votaciones.sql) (pegar completo en Supabase → SQL Editor → Run; se puede correr de nuevo sin perder datos)

## De dónde sale cada parte

Este proyecto reúne lo mejor de los tres sistemas de votación del grupo:

| Proyecto | Qué aporta |
|---|---|
| **sistema-votaciones-Abigail-Avendano** (base) | Supabase con la lista compartida del carnet, voto secreto (solo conteo, sin cédula), códigos de activación y código general de ingreso, una cédula por celular, comprobantes verificables, minuta PDF, Excel, bitácora, modo práctica, accesibilidad (lectura en voz alta, letra grande), asistente Robi, app Android/iOS e instalable. |
| **votaciones-josue** | **Reloj del servidor** (`DB.ahora()`, función `vota_hora`): un celular con la hora mal puesta no ve «cerrada» una votación abierta. **Aviso de conexión** perdida/recuperada (`js/aviso-conexion.js`). **Confirmación del voto a prueba de toques accidentales**: «Sí, enviar» se activa tras 0,7 s, el foco empieza en «No, quiero cambiarlo», tocar fuera equivale a regresar y la ventana se cierra sola si la votación termina. **Cédula con formato** `1-1111-1111`. |
| **proyecto-votaciones-Rashid** | **Pedidos de ayuda** durante la votación («me equivoqué de opción», «no alcancé a votar», «otro problema»), que el administrador atiende al momento: restaurar voto, +5 minutos, reabrir 5 minutos, WhatsApp, marcar atendido. **Pedidos de corrección de datos** (nombre, filial, teléfono) con aprobación. **Ocultar cifras** en Resultados para proyectar sin influir (`js/solicitudes.js`). |

Las funciones nuevas usan las tablas `vota_ayuda` y `vota_solicitudes` y las funciones `vota_hora`, `vota_pedir_ayuda`,
`vota_cancelar_ayuda`, `vota_pedir_cambio`, `vota_cancelar_cambio`, `vota_atender_ayuda` y `vota_resolver_cambio`.
**Después de actualizar, corra de nuevo `supabase/votaciones.sql` en Supabase.**
