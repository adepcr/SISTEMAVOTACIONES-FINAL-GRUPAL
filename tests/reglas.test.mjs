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
await prueba("Voto público válido funciona", () => assertSucceeds(votar(J, "202220222", "2", [0], "ADEP-PUB-202220222", voto(J, "202220222", 0, "Ana"))));
const c = (await getDoc(doc(A, "conteos/1"))).data(); await prueba("Conteo final correcto (1 voto a la opción 1)", async () => { if (c.c0 !== 1 || c.total !== 1) throw new Error(JSON.stringify(c)); });

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

console.log(`\n${ok} pasaron, ${mal} fallaron`);
await env.cleanup(); process.exit(mal ? 1 : 0);
