// Pruebas de las reglas de seguridad (firestore.rules) con el emulador de Firebase. Ver SEGURIDAD.md.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp, collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { readFileSync } from "fs";
import { createHash } from "crypto";

const env = await initializeTestEnvironment({ projectId: "demo-adep", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
let ok = 0, mal = 0;
async function prueba(nombre, fn) { try { await fn(); ok++; console.log("✔ " + nombre); } catch (e) { mal++; console.log("✘ " + nombre + " → " + (e.message || e).split("\n")[0]); } }
const db = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();
const anon = env.unauthenticatedContext().firestore();
const huella = (ced, cod) => createHash("sha256").update(ced + ":" + cod).digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
const vacio = { c0: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0, c7: 0, c8: 0, c9: 0, total: 0 };
const ahora = Date.now();

// ---------- Instalación ----------
await prueba("Sin conectar: puede ver si el sistema está instalado", () => assertSucceeds(getDoc(doc(anon, "config/instalado"))));
await prueba("Primer administrador se crea a sí mismo", async () => { const d = db("adm1"); const b = writeBatch(d); b.set(doc(d, "admins/adm1"), { nombre: "Admin", correo: "a@adep.cr", activo: true }); b.set(doc(d, "config/instalado"), { en: 1 }); await assertSucceeds(b.commit()); });
await prueba("Un segundo intento de 'primer administrador' es rechazado", async () => { const d = db("intruso"); const b = writeBatch(d); b.set(doc(d, "admins/intruso"), { nombre: "X", correo: "x@x", activo: true }); b.set(doc(d, "config/instalado"), { en: 2 }); await assertFails(b.commit()); });

const A = db("adm1");
// ---------- Datos creados por el administrador ----------
await prueba("Admin crea afiliado y código de activación", async () => { const b = writeBatch(A);
  b.set(doc(A, "afiliados/101110111"), { nombre: "María", cedula: "101110111", activo: true, uid: null, activado: false });
  b.set(doc(A, "activaciones/101110111"), { hash: huella("101110111", "K7P29QXM"), usada: false });
  b.set(doc(A, "afiliados/202220222"), { nombre: "José", cedula: "202220222", activo: true, uid: null, activado: false });
  b.set(doc(A, "activaciones/202220222"), { hash: huella("202220222", "ABCD2345"), usada: false });
  b.set(doc(A, "polls/1"), { titulo: "Secreta", opciones: ["Sí", "No", "Abstengo"], publicada: true, publica: false, aperturaMs: 0, cierreMs: 0 });
  b.set(doc(A, "conteos/1"), vacio);
  b.set(doc(A, "polls/2"), { titulo: "Pública", opciones: ["Ana", "Luis"], publicada: true, publica: true, aperturaMs: 0, cierreMs: 0 });
  b.set(doc(A, "conteos/2"), vacio);
  b.set(doc(A, "polls/3"), { titulo: "Cerrada", opciones: ["A", "B"], publicada: true, publica: false, aperturaMs: 0, cierreMs: ahora - 1000 });
  b.set(doc(A, "conteos/3"), vacio);
  b.set(doc(A, "polls/4"), { titulo: "Borrador", opciones: ["A", "B"], publicada: false, publica: false, aperturaMs: 0, cierreMs: 0 });
  b.set(doc(A, "conteos/4"), vacio);
  await assertSucceeds(b.commit()); });

// ---------- Sin conectar ----------
await prueba("Admin guarda el WhatsApp de ayuda", () => assertSucceeds(setDoc(doc(A, "config/publico"), { whatsappAyuda: "50622223333" })));
await prueba("Sin conectar: puede leer el WhatsApp de ayuda", () => assertSucceeds(getDoc(doc(anon, "config/publico"))));
await prueba("Sin conectar: NO puede leer la configuración general", () => assertFails(getDoc(doc(anon, "config/general"))));
await prueba("Sin conectar: NO puede leer afiliados", () => assertFails(getDoc(doc(anon, "afiliados/101110111"))));
await prueba("Sin conectar: NO puede leer votaciones", () => assertFails(getDoc(doc(anon, "polls/1"))));
await prueba("Sin conectar: NO puede leer códigos de activación", () => assertFails(getDoc(doc(anon, "activaciones/101110111"))));

// ---------- Activación ----------
function activar(uid, ced, codigo) {
  const d = db(uid, uid + "@afiliados.adepvota.cr"); const b = writeBatch(d);
  b.update(doc(d, "activaciones/" + ced), { usada: true, uid, codigo, usadaEn: serverTimestamp() });
  b.update(doc(d, "afiliados/" + ced), { uid, activado: true, authEmail: uid + "@afiliados.adepvota.cr", ultimoIngreso: "hoy" });
  b.set(doc(d, "cuentas/" + uid), { cedula: ced });
  b.set(doc(d, "acceso/" + ced), { email: uid + "@afiliados.adepvota.cr" });
  return b.commit();
}
await prueba("Activación con código INCORRECTO es rechazada", () => assertFails(activar("malo", "101110111", "AAAAAAAA")));
await prueba("Activación con código correcto funciona", () => assertSucceeds(activar("maria", "101110111", "K7P29QXM")));
await prueba("El mismo código NO sirve dos veces", () => assertFails(activar("otro", "101110111", "K7P29QXM")));
await prueba("José se activa", () => assertSucceeds(activar("jose", "202220222", "ABCD2345")));
await prueba("Sin conectar: puede saber el correo interno de una cédula (para ingresar)", () => assertSucceeds(getDoc(doc(anon, "acceso/101110111"))));

const M = db("maria", "maria@afiliados.adepvota.cr"), J = db("jose", "jose@afiliados.adepvota.cr");
// ---------- Lectura de afiliados ----------
await prueba("Afiliada lee su propio perfil", () => assertSucceeds(getDoc(doc(M, "afiliados/101110111"))));
await prueba("Afiliada NO lee el perfil de otro", () => assertFails(getDoc(doc(M, "afiliados/202220222"))));
await prueba("Afiliada NO puede listar afiliados", () => assertFails(getDocs(collection(M, "afiliados"))));
await prueba("Afiliada NO lee códigos de activación", () => assertFails(getDoc(doc(M, "activaciones/101110111"))));
await prueba("Afiliada NO lee la bitácora", () => assertFails(getDocs(collection(M, "auditoria"))));
await prueba("Afiliada NO puede hacerse administradora", () => assertFails(setDoc(doc(M, "admins/maria"), { nombre: "M", activo: true })));
await prueba("Afiliada NO puede desactivar a otro", () => assertFails(updateDoc(doc(M, "afiliados/202220222"), { activo: false })));
await prueba("Afiliada NO puede cambiar resultados", () => assertFails(updateDoc(doc(M, "conteos/1"), { c1: 100, total: 100 })));
await prueba("Afiliada NO puede cambiar el WhatsApp de ayuda", () => assertFails(setDoc(doc(M, "config/publico"), { whatsappAyuda: "1" })));
await prueba("Afiliada NO ve borradores", () => assertFails(getDoc(doc(M, "polls/4"))));
await prueba("Afiliada ve votaciones publicadas", () => assertSucceeds(getDoc(doc(M, "polls/1"))));

// ---------- Votar ----------
function votar(d, ced, poll, idxs, codigo, extra) {
  const b = writeBatch(d); const inc = { total: increment(1) }; idxs.forEach(i => inc["c" + i] = increment(1));
  b.update(doc(d, "conteos/" + poll), inc);
  b.set(doc(d, "participacion/" + poll + "_" + ced), { pollId: poll, cedula: ced, fecha: "hoy", codigo });
  b.set(doc(d, "codigos/" + codigo), { pollId: poll, fecha: "hoy" });
  if (extra) extra(b);
  return b.commit();
}
await prueba("Voto que suma a DOS opciones es rechazado", () => assertFails(votar(M, "101110111", "1", [0, 1], "ADEP-AAAA-0001")));
await prueba("Votar a nombre de OTRA cédula es rechazado", () => assertFails(votar(M, "202220222", "1", [0], "ADEP-AAAA-0002")));
await prueba("Sumar votos SIN registrar participación es rechazado", () => assertFails(updateDoc(doc(M, "conteos/1"), { c0: increment(1), total: increment(1) })));
await prueba("Voto secreto válido funciona", () => assertSucceeds(votar(M, "101110111", "1", [0], "ADEP-AAAA-0003")));
await prueba("Votar DOS veces es rechazado", () => assertFails(votar(M, "101110111", "1", [1], "ADEP-AAAA-0004")));
await prueba("Votar en consulta CERRADA es rechazado", () => assertFails(votar(M, "101110111", "3", [0], "ADEP-AAAA-0005")));
await prueba("Votar en BORRADOR es rechazado", () => assertFails(votar(M, "101110111", "4", [0], "ADEP-AAAA-0006")));
await prueba("El voto secreto NO guarda la opción junto a la cédula", async () => { const s = await getDoc(doc(A, "participacion/1_101110111")); if ("opcion" in s.data() || "idx" in s.data()) throw new Error("guarda la opción"); });
await prueba("Afiliada ve su propia participación", () => assertSucceeds(getDoc(doc(M, "participacion/1_101110111"))));
await prueba("Afiliado NO ve la participación de otra persona", () => assertFails(getDoc(doc(J, "participacion/1_101110111"))));
await prueba("Cualquier miembro verifica un comprobante por su código", () => assertSucceeds(getDoc(doc(J, "codigos/ADEP-AAAA-0003"))));
const voto = (d, ced, idx, opcion) => b => b.set(doc(d, "votos/2_" + ced), { pollId: "2", cedula: ced, nombre: "X", opcion, idx, codigo: "ADEP-PUB-" + ced, fecha: "hoy" });
await prueba("Voto público con opción que NO coincide es rechazado", () => assertFails(votar(J, "202220222", "2", [0], "ADEP-PUB-202220222", voto(J, "202220222", 0, "Luis"))));
const votoF = (d, ced, idx, opcion, filial) => b => b.set(doc(d, "votos/2_" + ced), { pollId: "2", cedula: ced, nombre: "X", filial, opcion, idx, codigo: "ADEP-PUB-" + ced, fecha: "hoy" });
await prueba("Voto público con filial FALSA es rechazado", () => assertFails(votar(J, "202220222", "2", [0], "ADEP-PUB-202220222", votoF(J, "202220222", 0, "Ana", "Limón"))));
await prueba("Voto público con su filial real funciona", () => assertSucceeds(votar(J, "202220222", "2", [0], "ADEP-PUB-202220222", votoF(J, "202220222", 0, "Ana", ""))));
const c = (await getDoc(doc(A, "conteos/1"))).data(); await prueba("Conteo final correcto (1 voto a la opción 1)", async () => { if (c.c0 !== 1 || c.total !== 1) throw new Error(JSON.stringify(c)); });

// ---------- Resultados parciales bloqueados ----------
await prueba("Afiliado NO lee el conteo de una votación ABIERTA", () => assertFails(getDoc(doc(M, "conteos/1"))));
await prueba("Afiliado NO lista los votos públicos de una votación ABIERTA", () => assertFails(getDocs(query(collection(M, "votos"), where("pollId", "==", "2")))));
await prueba("Afiliado NO lista todos los votos", () => assertFails(getDocs(collection(M, "votos"))));
await prueba("Afiliado lee SUS propios votos públicos", () => assertSucceeds(getDocs(query(collection(J, "votos"), where("cedula", "==", "202220222")))));
await prueba("Votación cerrada SIN marca de resultados: el afiliado todavía NO lee el conteo", () => assertFails(getDoc(doc(M, "conteos/3"))));
await prueba("Afiliado NO puede marcar resultados de una votación ABIERTA", () => assertFails(updateDoc(doc(M, "polls/1"), { resultados: true })));
await prueba("Afiliado NO puede cambiar otra cosa junto con la marca", () => assertFails(updateDoc(doc(M, "polls/3"), { resultados: true, titulo: "Hackeada" })));
await prueba("Afiliado marca los resultados de una votación que YA cerró", () => assertSucceeds(updateDoc(doc(M, "polls/3"), { resultados: true })));
await prueba("Afiliado lee el conteo de una votación CERRADA", () => assertSucceeds(getDoc(doc(M, "conteos/3"))));
await prueba("Admin lee el conteo de una votación abierta", () => assertSucceeds(getDoc(doc(A, "conteos/1"))));
await prueba("Admin cierra la votación pública", () => assertSucceeds(updateDoc(doc(A, "polls/2"), { cierreMs: ahora - 1000, resultados: true })));
await prueba("Afiliado lista los votos públicos de una votación CERRADA", () => assertSucceeds(getDocs(query(collection(M, "votos"), where("pollId", "==", "2")))));

// ---------- Bitácora ----------
await prueba("Afiliada registra en la bitácora con su cuenta", () => assertSucceeds(addDoc(collection(M, "auditoria"), { fecha: serverTimestamp(), accion: "Ingreso", detalle: "", por: "María", uid: "maria" })));
await prueba("NO puede registrar a nombre de otra cuenta", () => assertFails(addDoc(collection(M, "auditoria"), { fecha: serverTimestamp(), accion: "X", detalle: "", por: "Admin", uid: "adm1" })));
await prueba("NO puede inventar la fecha", () => assertFails(addDoc(collection(M, "auditoria"), { fecha: "2020-01-01", accion: "X", detalle: "", por: "María", uid: "maria" })));
await prueba("Admin lee y borra la bitácora", async () => { const s = await assertSucceeds(getDocs(collection(A, "auditoria"))); await assertSucceeds(deleteDoc(s.docs[0].ref)); });

// ---------- Renovar código / desactivar ----------
await prueba("Admin renueva el código de María (su cuenta anterior queda sin acceso)", async () => { const b = writeBatch(A);
  b.set(doc(A, "activaciones/101110111"), { hash: huella("101110111", "NUEVO234"), usada: false }); b.update(doc(A, "afiliados/101110111"), { uid: null, activado: false }); b.delete(doc(A, "acceso/101110111")); await assertSucceeds(b.commit()); });
await prueba("La cuenta anterior de María ya NO puede leer votaciones", () => assertFails(getDoc(doc(M, "polls/1"))));
await prueba("Admin desactiva a José", () => assertSucceeds(updateDoc(doc(A, "afiliados/202220222"), { activo: false })));
await prueba("José desactivado ya NO puede leer votaciones", () => assertFails(getDoc(doc(J, "polls/1"))));
await prueba("Admin puede restaurar (borrar) una participación", () => assertSucceeds(deleteDoc(doc(A, "participacion/1_101110111"))));

// ---------- Ingreso con código general (una cédula, un celular) ----------
await prueba("Admin crea afiliados nuevos y el código general", async () => { const b = writeBatch(A);
  b.set(doc(A, "afiliados/303330333"), { nombre: "Ana", cedula: "303330333", activo: true, uid: null, activado: false });
  b.set(doc(A, "afiliados/404440444"), { nombre: "Luis", cedula: "404440444", activo: true, uid: null, activado: false });
  b.set(doc(A, "config/ingreso"), { codigo: "482913", activo: true, venceMs: ahora + 3600e3, aprobacion: false });
  await assertSucceeds(b.commit()); });
function ingresar(uid, ced, codigo, pendiente = false) {
  const email = uid + "@afiliados.adepvota.cr", d = db(uid, email), b = writeBatch(d);
  b.set(doc(d, "ingresos/" + ced), { uid, codigo, fecha: serverTimestamp() });
  b.update(doc(d, "afiliados/" + ced), { uid, activado: true, authEmail: email, ultimoIngreso: "hoy", pendiente, dispositivo: "Android · Chrome" });
  b.set(doc(d, "cuentas/" + uid), { cedula: ced });
  b.set(doc(d, "acceso/" + ced), { email, tipo: "dispositivo" });
  return b.commit();
}
await prueba("Afiliado NO puede leer el código general", () => assertFails(getDoc(doc(M, "config/ingreso"))));
await prueba("Una cuenta nueva NO puede leer el código general", () => assertFails(getDoc(doc(db("curioso"), "config/ingreso"))));
await prueba("Una cuenta nueva NO puede listar la configuración", () => assertFails(getDocs(collection(db("curioso"), "config"))));
await prueba("Ingreso con código general INCORRECTO es rechazado", () => assertFails(ingresar("ana_mal", "303330333", "AAAAAA")));
await prueba("Ingreso con código general correcto funciona", () => assertSucceeds(ingresar("ana_cel", "303330333", "482913")));
const AN = db("ana_cel", "ana_cel@afiliados.adepvota.cr");
await prueba("Ana (con código general) ve votaciones", () => assertSucceeds(getDoc(doc(AN, "polls/1"))));
await prueba("OTRO celular con la cédula de Ana es rechazado", () => assertFails(ingresar("impostor", "303330333", "482913")));
await prueba("Con el código NO se puede tomar una cédula activada con clave", () => assertFails(ingresar("impostor2", "202220222", "482913")));
await prueba("Sin conectar: se puede avisar de un intento bloqueado", () => assertSucceeds(addDoc(collection(anon, "alertas"), { cedula: "303330333", fecha: serverTimestamp() })));
await prueba("NO se puede inventar un aviso de una cédula que no está en ningún celular", () => assertFails(addDoc(collection(anon, "alertas"), { cedula: "999999999", fecha: serverTimestamp() })));
await prueba("El aviso NO acepta datos extra", () => assertFails(addDoc(collection(anon, "alertas"), { cedula: "303330333", fecha: serverTimestamp(), x: 1 })));
await prueba("Afiliada NO lee los avisos", () => assertFails(getDocs(collection(M, "alertas"))));
await prueba("Admin lee los avisos", () => assertSucceeds(getDocs(collection(A, "alertas"))));
await prueba("Admin libera la cédula de Ana", async () => { const b = writeBatch(A);
  b.update(doc(A, "afiliados/303330333"), { uid: null, activado: false, pendiente: false, dispositivo: "" });
  b.delete(doc(A, "cuentas/ana_cel")); b.delete(doc(A, "ingresos/303330333")); b.delete(doc(A, "acceso/303330333"));
  await assertSucceeds(b.commit()); });
await prueba("El celular anterior de Ana ya NO ve votaciones", () => assertFails(getDoc(doc(AN, "polls/1"))));
await prueba("Ana entra desde un celular nuevo", () => assertSucceeds(ingresar("ana_nuevo", "303330333", "482913")));
await prueba("Admin enciende la aprobación manual", () => assertSucceeds(updateDoc(doc(A, "config/ingreso"), { aprobacion: true })));
await prueba("Con aprobación manual, entrar ya aprobado es rechazado", () => assertFails(ingresar("luis_cel", "404440444", "482913", false)));
await prueba("Con aprobación manual, entra como pendiente", () => assertSucceeds(ingresar("luis_cel", "404440444", "482913", true)));
const LU = db("luis_cel", "luis_cel@afiliados.adepvota.cr");
await prueba("Pendiente: puede ver su propio perfil (para saber cuándo lo aprueban)", () => assertSucceeds(getDoc(doc(LU, "afiliados/404440444"))));
await prueba("Pendiente: NO ve votaciones", () => assertFails(getDoc(doc(LU, "polls/1"))));
await prueba("Pendiente: NO puede aprobarse a sí mismo", () => assertFails(updateDoc(doc(LU, "afiliados/404440444"), { pendiente: false })));
await prueba("Admin aprueba a Luis", () => assertSucceeds(updateDoc(doc(A, "afiliados/404440444"), { pendiente: false })));
await prueba("Luis aprobado ve votaciones", () => assertSucceeds(getDoc(doc(LU, "polls/1"))));
await prueba("Admin apaga el código", () => assertSucceeds(updateDoc(doc(A, "config/ingreso"), { activo: false, aprobacion: false })));
await prueba("Código apagado: nadie nuevo entra", async () => { await assertSucceeds(updateDoc(doc(A, "afiliados/303330333"), { uid: null })); await assertSucceeds(deleteDoc(doc(A, "ingresos/303330333")));
  await assertFails(ingresar("ana_otro", "303330333", "482913")); });
await prueba("Código vencido: nadie nuevo entra", async () => { await assertSucceeds(updateDoc(doc(A, "config/ingreso"), { activo: true, venceMs: ahora - 1000 }));
  await assertFails(ingresar("ana_otro2", "303330333", "482913")); });

console.log(`\n${ok} pasaron, ${mal} fallaron`);
await env.cleanup(); process.exit(mal ? 1 : 0);
