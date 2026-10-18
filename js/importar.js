/* importar.js · ADEP Vota · IMPORTAR AFILIADOS Y RENOVAR CLAVES EN BLOQUE (solo administrador)
   1) Importar afiliados desde Excel (.xlsx) o CSV con VISTA PREVIA: nada se crea hasta confirmar.
      - Los que ya existen NO dan error: se pueden dejar igual, actualizar, o darles clave nueva.
   2) Claves nuevas en bloque (todas las filiales o una sola) para renovarlas cuando haga falta.
   3) Al terminar: descarga Excel o imprime la hoja de claves (las claves se muestran UNA sola vez).
   Para quitarlo: borrar la línea  await cargar("js/importar.js");  de index.html */
(function () {
    "use strict";
    if (typeof DB === "undefined" || typeof user === "undefined" || !user || user.rol !== "Administrador") return;
    const host = document.getElementById("af-buscar");
    if (!host) return;

    const q = id => document.getElementById(id);
    const E = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const hoy = () => new Date().toISOString().slice(0, 10);
    const btnP = "bg-adep-green hover:bg-adep-greenDark text-white font-bold px-4 py-3 rounded-xl text-sm";
    const btnS = "bg-adep-greenLight text-adep-green hover:bg-emerald-100 font-bold px-4 py-3 rounded-xl text-sm border border-emerald-200";
    const btnG = "bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-4 py-3 rounded-xl text-sm";

    /* ---------- Caja en la pestaña Afiliados ---------- */
    host.insertAdjacentHTML("beforebegin", `
        <div class="bg-white p-5 rounded-2xl border-2 border-gray-200 shadow-sm space-y-3">
            <h3 class="font-bold text-base text-gray-900"><i class="fa-solid fa-file-import text-adep-green mr-1"></i> Cargar afiliados y renovar claves en bloque</h3>
            <p class="text-sm text-gray-500">Importe el padrón desde un archivo de Excel o genere claves temporales para muchos afiliados a la vez. Las claves se muestran una sola vez.</p>
            <div class="flex flex-wrap gap-2">
                <button type="button" id="xi-imp" class="${btnP}"><i class="fa-solid fa-file-import mr-1"></i> Importar afiliados (Excel)</button>
                <button type="button" id="xi-bulk" class="${btnS}"><i class="fa-solid fa-key mr-1"></i> Claves nuevas en bloque</button>
                <button type="button" id="xi-tpl" class="${btnG}"><i class="fa-solid fa-file-excel mr-1"></i> Descargar plantilla de Excel</button>
            </div>
        </div>`);

    /* ---------- Utilidades ---------- */
    function parseCSV(text) {
        text = text.replace(/^\ufeff/, "");
        const first = text.split(/\r?\n/, 1)[0] || "";
        const cnt = d => first.split(d).length - 1;
        const delim = [";", ",", "\t"].sort((a, b) => cnt(b) - cnt(a))[0];
        const rows = []; let row = [], cur = "", inq = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inq) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
            else if (c === '"') inq = true;
            else if (c === delim) { row.push(cur); cur = ""; }
            else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
            else cur += c;
        }
        if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
        return rows.filter(r => r.some(c => String(c).trim() !== ""));
    }
    // Excel (.xlsx / .xls): primera hoja, todo como texto para no perder ceros en la cédula
    async function leerExcel(f) {
        if (typeof XLSX === "undefined") throw new Error("SheetJS no cargó");
        const libro = XLSX.read(await f.arrayBuffer(), { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: "" })
            .map(r => r.map(c => String(c)))
            .filter(r => r.some(c => c.trim() !== ""));
    }
    // Reconoce Excel por su contenido (.xlsx empieza con "PK", .xls con D0 CF), no solo por el nombre
    async function esExcel(f) {
        const c = new Uint8Array(await f.slice(0, 2).arrayBuffer());
        return (c[0] === 0x50 && c[1] === 0x4b) || (c[0] === 0xd0 && c[1] === 0xcf);
    }
    async function leerArchivo(f) {
        const buf = await f.arrayBuffer();
        try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
        catch { return new TextDecoder("windows-1252").decode(buf); } // CSV de Excel en Windows
    }
    async function clavesNuevas(keys) {
        const out = {};
        for (const k of keys) { const pass = DB.genPin(); out[k] = { pass, passHash: await DB.hash(k, pass) }; }
        return out;
    }

    /* ---------- Ventana ---------- */
    let lote = null, descargado = false;
    function cerrar(forzar) {
        const m = q("xi-modal"); if (!m) return;
        if (lote && !descargado && !forzar && !confirm("Estas claves NO se pueden volver a ver. ¿Ya las descargó o imprimió?")) return;
        lote = null; descargado = false; m.remove();
    }
    function abrir(titulo, cuerpo, ancho) {
        const v = q("xi-modal"); if (v) v.remove();
        const m = document.createElement("div");
        m.id = "xi-modal";
        m.className = "fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3";
        m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
        m.innerHTML = `<div class="bg-white rounded-3xl ${ancho || "max-w-lg"} w-full overflow-hidden shadow-2xl flex flex-col" style="max-height:94vh">
            <div class="bg-adep-green text-white p-4 text-center"><h3 class="text-xl font-black font-heading">${E(titulo)}</h3></div>
            <div id="xi-body" class="p-5 space-y-4 overflow-y-auto">${cuerpo}</div></div>`;
        document.body.appendChild(m);
        return m;
    }
    document.addEventListener("keydown", e => { if (e.key === "Escape" && q("xi-modal") && !lote) cerrar(); });

    /* ---------- Plantilla ---------- */
    q("xi-tpl").addEventListener("click", () => {
        bajarExcel("Plantilla_afiliados_ADEP.xlsx", "Afiliados", [["Nombre", "Cédula", "Filial", "Teléfono"], ["María Fernández Rojas", "102340567", "Heredia", "8888-1234"], ["José Mora Vargas", "203450678", "Alajuela", ""]]);
    });

    /* ---------- 1) Importar ---------- */
    q("xi-imp").addEventListener("click", () => {
        const m = abrir("Importar afiliados", `
            <ol class="list-decimal pl-5 space-y-1 text-base text-gray-700">
                <li>Use la <strong>plantilla de Excel</strong>, con las columnas <strong>Nombre, Cédula, Filial</strong> y <strong>Teléfono</strong> (opcional, para enviar la clave por WhatsApp).</li>
                <li>Guarde el archivo como siempre (.xlsx). También se aceptan archivos CSV.</li>
                <li>Elija el archivo aquí. <strong>Todavía no se crea nada</strong>: primero verá una vista previa.</li>
            </ol>
            <p class="text-sm text-gray-500">Filiales válidas: ${FILIALES.join(", ")}. Tip: si Excel muestra la cédula como 1,02E+08, formatee esa columna como Texto antes de guardar.</p>
            <input id="xi-file" type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" aria-label="Archivo de Excel o CSV" class="w-full border-2 border-gray-300 rounded-xl p-3 text-base">
            <div class="grid gap-2"><button type="button" id="xi-c" class="${btnG}">Cancelar</button></div>`);
        q("xi-c").onclick = () => cerrar(true);
        q("xi-file").addEventListener("change", async e => {
            const f = e.target.files[0]; if (!f) return;
            try {
                const rows = await esExcel(f) ? await leerExcel(f) : parseCSV(await leerArchivo(f));
                if (!rows.length) return showToast("El archivo está vacío.");
                const r = analizar(rows);
                if (r.error) return showToast(r.error);
                vistaPrevia(r.filas);
            } catch (err) { console.error(err); showToast("No se pudo leer el archivo."); }
        });
    });

    function analizar(rows) {
        let ini = 0, iN = 0, iC = 1, iF = 2, iT = 3;
        const h = rows[0].map(norm);
        if (h.some(c => /ced|ident|nombre/.test(c))) {
            ini = 1; iN = h.findIndex(c => /nombre/.test(c)); iC = h.findIndex(c => /ced|ident/.test(c)); iF = h.findIndex(c => /filial|provincia/.test(c)); iT = h.findIndex(c => /tel|celular|whatsapp|movil/.test(c));
            if (iN < 0 || iC < 0) return { error: "No encontré las columnas «Nombre» y «Cédula» en la primera fila." };
        }
        const users = DB._get("users", {}), vistos = new Set(), filas = [];
        for (let i = ini; i < rows.length; i++) {
            const r = rows[i];
            const f = { n: i + 1, nombre: String(r[iN] || "").trim().replace(/\s+/g, " "), rawC: String(r[iC] || "").trim(), filial: "", cedula: "", estado: "nuevo", msg: "" };
            const rawF = iF >= 0 ? String(r[iF] || "").trim() : "";
            const rawT = iT >= 0 ? String(r[iT] || "").trim() : "";
            f.telefono = telefonoWA(rawT);
            const avisoTel = rawT && !f.telefono ? "Teléfono no válido (no se guardará)." : "";
            const limpio = f.rawC.replace(/[\s.\-]/g, "");
            if (!f.nombre) { f.estado = "error"; f.msg = "Falta el nombre."; }
            else if (!/^\d+$/.test(limpio)) { f.estado = "error"; f.msg = /e\+?\d/i.test(limpio) ? "Excel cambió la cédula a notación científica. Formatee la columna como Texto." : "La cédula solo debe tener números."; }
            else if (limpio.length < 9 || limpio.length > 12) { f.estado = "error"; f.msg = "La cédula debe tener entre 9 y 12 números."; }
            else {
                f.cedula = limpio;
                const key = DB._norm(limpio);
                if (vistos.has(key)) { f.estado = "error"; f.msg = "Cédula repetida en el archivo."; }
                else {
                    vistos.add(key);
                    if (rawF) {
                        const fil = FILIALES.find(x => norm(x) === norm(rawF));
                        if (fil) f.filial = fil; else { f.estado = "error"; f.msg = "Filial no válida: «" + rawF + "»."; }
                    }
                    if (f.estado !== "error" && users[key]) {
                        if (users[key].rol !== "Afiliado") { f.estado = "error"; f.msg = "Esa cédula pertenece a otra cuenta."; }
                        else { f.estado = "existe"; f.actual = users[key].nombre; f.msg = users[key].nombre !== f.nombre ? "Nombre actual: " + users[key].nombre : ""; }
                    }
                    if (f.estado !== "error" && avisoTel) f.msg = (f.msg ? f.msg + " " : "") + avisoTel;
                }
            }
            filas.push(f);
        }
        if (!filas.length) return { error: "No encontré filas con datos." };
        return { filas };
    }

    function vistaPrevia(filas) {
        const nu = filas.filter(f => f.estado === "nuevo").length, ex = filas.filter(f => f.estado === "existe").length, er = filas.filter(f => f.estado === "error").length;
        const col = { nuevo: ["#e8f5ee", "#04492a", "Nuevo"], existe: ["#fffbeb", "#78350f", "Ya existe"], error: ["#fdf0f0", "#9b1c18", "Error"] };
        const mostrar = filas.slice(0, 300);
        const m = abrir("Vista previa de la importación", `
            <div class="grid grid-cols-3 gap-2 text-center font-bold">
                <div class="rounded-xl p-2" style="background:#e8f5ee;color:#04492a"><div class="text-2xl font-black">${nu}</div>nuevos</div>
                <div class="rounded-xl p-2" style="background:#fffbeb;color:#78350f"><div class="text-2xl font-black">${ex}</div>ya existen</div>
                <div class="rounded-xl p-2" style="background:#fdf0f0;color:#9b1c18"><div class="text-2xl font-black">${er}</div>con error</div>
            </div>
            ${er ? '<p class="text-sm font-bold" style="color:#9b1c18">Las filas con error NO se importan. Corríjalas en el archivo y vuelva a cargarlo si las necesita.</p>' : ""}
            ${ex ? `<div class="rounded-xl p-3 space-y-2" style="background:#fffbeb;border:2px solid #fcd34d">
                <p class="font-bold text-sm" style="color:#78350f">Para los ${ex} que ya existen (no se duplican):</p>
                <label class="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" id="xi-nueva" class="w-5 h-5 mt-0.5 accent-adep-green"> Darles una clave nueva (la clave actual dejará de funcionar)</label>
                <label class="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" id="xi-act" class="w-5 h-5 mt-0.5 accent-adep-green"> Actualizar su nombre, filial y teléfono con los del archivo</label>
                <p class="text-xs text-gray-600">Si no marca nada, se dejan tal como están.</p></div>` : ""}
            <div class="border border-gray-200 rounded-xl overflow-auto" style="max-height:38vh">
                <table class="w-full text-sm"><thead class="bg-slate-100 sticky top-0"><tr><th class="p-2 text-left">Línea</th><th class="p-2 text-left">Nombre</th><th class="p-2 text-left">Cédula</th><th class="p-2 text-left">Filial</th><th class="p-2 text-left">Teléfono</th><th class="p-2 text-left">Estado</th></tr></thead><tbody>
                ${mostrar.map(f => { const c = col[f.estado]; return `<tr class="border-t border-gray-100"><td class="p-2">${f.n}</td><td class="p-2">${E(f.nombre)}</td><td class="p-2 font-mono">${E(f.cedula || f.rawC)}</td><td class="p-2">${E(f.filial)}</td><td class="p-2 font-mono">${E(telefonoTxt(f.telefono))}</td><td class="p-2"><span class="font-bold px-2 py-0.5 rounded-full" style="background:${c[0]};color:${c[1]}">${c[2]}</span>${f.msg ? `<div class="text-xs text-gray-600 mt-1">${E(f.msg)}</div>` : ""}</td></tr>`; }).join("")}
                </tbody></table></div>
            ${filas.length > 300 ? `<p class="text-xs text-gray-500">Se muestran las primeras 300 filas de ${filas.length}; se procesan todas.</p>` : ""}
            <div class="grid gap-2">
                <button type="button" id="xi-ok" class="${btnP} py-4 text-base"></button>
                <button type="button" id="xi-c2" class="${btnG}">Cancelar</button>
            </div>`, "max-w-3xl");
        const ok = q("xi-ok"), nuevaC = q("xi-nueva"), actC = q("xi-act");
        const refrescar = () => {
            const n = nu + (nuevaC && nuevaC.checked ? ex : 0), a = actC && actC.checked ? ex : 0;
            ok.textContent = `Confirmar: crear ${nu} cuenta(s)` + (nuevaC && nuevaC.checked ? ` y renovar ${ex} clave(s)` : "");
            ok.disabled = !(n > 0 || a > 0); ok.style.opacity = ok.disabled ? ".45" : "1";
        };
        [nuevaC, actC].forEach(c => c && c.addEventListener("change", refrescar));
        refrescar();
        q("xi-c2").onclick = () => cerrar(true);
        ok.onclick = async () => {
            ok.disabled = true; ok.textContent = "Procesando…";
            try { await ejecutar(filas, { nueva: !!(nuevaC && nuevaC.checked), actualizar: !!(actC && actC.checked) }); }
            catch (err) { console.error(err); showToast("Ocurrió un error al importar. Revise e intente de nuevo."); cerrar(true); }
        };
    }

    async function ejecutar(filas, o) {
        const nuevos = filas.filter(f => f.estado === "nuevo"), exist = filas.filter(f => f.estado === "existe");
        const keysN = nuevos.map(f => DB._norm(f.cedula)), keysR = o.nueva ? exist.map(f => DB._norm(f.cedula)) : [];
        const cl = await clavesNuevas([...keysN, ...keysR]);
        const users = DB._get("users", {}), ahora = new Date().toISOString(), L = [];
        let cre = 0, ren = 0, act = 0;
        nuevos.forEach(f => {
            const k = DB._norm(f.cedula); if (users[k]) return;
            users[k] = { nombre: f.nombre, cedula: k, correo: "", telefono: f.telefono, passHash: cl[k].passHash, claveTemporal: true, rol: "Afiliado", provincia: f.filial, activo: true, creada: ahora };
            L.push({ nombre: f.nombre, cedula: k, filial: f.filial, telefono: f.telefono, clave: cl[k].pass, nota: "Nuevo" }); cre++;
        });
        exist.forEach(f => {
            const k = DB._norm(f.cedula), u = users[k]; if (!u || u.rol !== "Afiliado") return;
            if (o.actualizar) { u.nombre = f.nombre; if (f.filial) u.provincia = f.filial; if (f.telefono) u.telefono = f.telefono; act++; }
            if (o.nueva) { u.passHash = cl[k].passHash; u.claveTemporal = true; delete u.pass; L.push({ nombre: u.nombre, cedula: k, filial: u.provincia || "", telefono: u.telefono || "", clave: cl[k].pass, nota: "Clave nueva" }); ren++; }
        });
        if (ren) { const it = DB._get("intentos", {}); keysR.forEach(k => delete it[k]); DB._set("intentos", it); }
        DB._set("users", users);
        DB.log("Importación de afiliados", `${cre} nuevo(s), ${ren} clave(s) renovada(s), ${act} actualizado(s)`);
        renderAll();
        resultado(`Importación terminada: ${cre} cuenta(s) creada(s)` + (ren ? `, ${ren} clave(s) renovada(s)` : "") + (act ? `, ${act} actualizada(s)` : "") + ".", L, "Claves de la importación");
    }

    /* ---------- 2) Claves nuevas en bloque ---------- */
    q("xi-bulk").addEventListener("click", () => {
        const opts = ['<option value="todas">Todas las filiales</option>', ...FILIALES.map(f => `<option>${E(f)}</option>`), '<option value="__sin">Sin filial</option>'].join("");
        abrir("Claves nuevas en bloque", `
            <p class="text-base text-gray-700">Genera una clave temporal de 6 números para cada afiliado elegido. <strong>Las claves actuales dejan de funcionar</strong> en cuanto confirme. Al ingresar, cada afiliado deberá crear su propia clave.</p>
            <div><label for="xb-fil" class="block text-sm font-bold text-gray-700 mb-1">¿A quiénes?</label>
                <select id="xb-fil" class="w-full border-2 border-gray-300 rounded-xl p-3 text-base font-semibold bg-white">${opts}</select></div>
            <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" id="xb-act" checked class="w-5 h-5 accent-adep-green"> Solo cuentas activas</label>
            <p id="xb-n" class="text-base font-bold text-adep-green"></p>
            <div class="grid gap-2">
                <button type="button" id="xb-ok" class="${btnP} py-4 text-base">Generar claves nuevas</button>
                <button type="button" id="xb-c" class="${btnG}">Cancelar</button>
            </div>`);
        const lista = () => DB.afiliados().filter(a => {
            const f = q("xb-fil").value;
            return (!q("xb-act").checked || a.activo !== false) && (f === "todas" || (f === "__sin" ? !a.provincia : a.provincia === f));
        });
        const cuenta = () => { const n = lista().length; q("xb-n").textContent = `${n} afiliado(s) recibirán clave nueva.`; q("xb-ok").disabled = !n; q("xb-ok").style.opacity = n ? "1" : ".45"; };
        q("xb-fil").onchange = cuenta; q("xb-act").onchange = cuenta; cuenta();
        q("xb-c").onclick = () => cerrar(true);
        q("xb-ok").onclick = async () => {
            const sel = lista(); if (!sel.length) return;
            if (!confirm(`Se generarán claves nuevas para ${sel.length} afiliado(s). Las claves actuales dejarán de funcionar. ¿Continuar?`)) return;
            q("xb-ok").disabled = true; q("xb-ok").textContent = "Procesando…";
            try {
                const keys = sel.map(a => a.cedula), cl = await clavesNuevas(keys);
                const users = DB._get("users", {}), it = DB._get("intentos", {}), L = [];
                keys.forEach(k => {
                    const u = users[k]; if (!u || u.rol !== "Afiliado") return;
                    u.passHash = cl[k].passHash; u.claveTemporal = true; delete u.pass; delete it[k];
                    L.push({ nombre: u.nombre, cedula: k, filial: u.provincia || "", telefono: u.telefono || "", clave: cl[k].pass, nota: "Clave nueva" });
                });
                DB._set("users", users); DB._set("intentos", it);
                DB.log("Claves renovadas en bloque", `${L.length} afiliado(s) · ${q("xb-fil").value === "todas" ? "todas las filiales" : q("xb-fil").value}`);
                renderAll();
                resultado(`Listo: ${L.length} clave(s) nueva(s).`, L, "Claves nuevas");
            } catch (err) { console.error(err); showToast("Ocurrió un error. Intente de nuevo."); cerrar(true); }
        };
    });

    /* ---------- Resultado: claves (se ven una sola vez) ---------- */
    function resultado(msg, L, titulo) {
        L.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        lote = L; descargado = false;
        if (!L.length) { lote = null; abrir("Resultado", `<p class="text-base font-bold text-gray-800">${E(msg)}</p><p class="text-sm text-gray-600">No se generaron claves nuevas.</p><button type="button" id="xi-fin" class="${btnP} w-full">Cerrar</button>`); q("xi-fin").onclick = () => cerrar(true); return; }
        abrir(titulo, `
            <p class="text-base font-bold text-adep-green"><i class="fa-solid fa-circle-check mr-1"></i>${E(msg)}</p>
            <p class="text-sm font-bold rounded-xl p-3" style="background:#fffbeb;border:2px solid #fcd34d;color:#78350f"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Descargue o imprima ahora: estas claves <u>no se vuelven a mostrar</u>. Entregue cada una solo a su dueño y borre el archivo después. Son temporales: cada afiliado creará su propia clave al ingresar.</p>
            <div class="grid sm:grid-cols-2 gap-2">
                <button type="button" id="xr-csv" class="${btnP}"><i class="fa-solid fa-file-excel mr-1"></i> Descargar Excel</button>
                <button type="button" id="xr-print" class="${btnS}"><i class="fa-solid fa-print mr-1"></i> Imprimir hoja de claves</button>
            </div>
            <div class="border border-gray-200 rounded-xl overflow-auto" style="max-height:34vh">
                <table class="w-full text-sm"><thead class="bg-slate-100 sticky top-0"><tr><th class="p-2 text-left">Nombre</th><th class="p-2 text-left">Cédula</th><th class="p-2 text-left">Clave</th><th class="p-2 text-left">WhatsApp</th></tr></thead><tbody>
                ${L.slice(0, 100).map(x => `<tr class="border-t border-gray-100"><td class="p-2">${E(x.nombre)}</td><td class="p-2 font-mono">${E(x.cedula)}</td><td class="p-2 font-mono font-black tracking-widest">${E(x.clave)}</td><td class="p-2">${x.telefono ? botonWhatsApp(x, x.clave).replace("wa-btn", "wa-btn wa-mini").replace("Enviar por WhatsApp", "Enviar") : '<span class="text-gray-500">Sin teléfono</span>'}</td></tr>`).join("")}
                </tbody></table></div>
            ${L.length > 100 ? `<p class="text-xs text-gray-500">Se muestran 100 de ${L.length}; el Excel y la hoja impresa incluyen todas.</p>` : ""}
            ${L.some(x => x.telefono) ? '<p class="text-sm text-gray-600"><i class="fa-brands fa-whatsapp text-adep-green mr-1"></i>«Enviar» abre WhatsApp con el mensaje listo para cada afiliado. Después de enviarlos, borre los mensajes de su chat.</p>' : ""}
            <button type="button" id="xr-fin" class="${btnG} w-full">Cerrar</button>`, "max-w-2xl");
        q("xr-csv").onclick = () => {
            if (!bajarExcel(`Claves_ADEP_${hoy()}.xlsx`, "Claves", [["Nombre", "Cédula", "Filial", "Teléfono", "Clave temporal", "Detalle"], ...L.map(x => [x.nombre, x.cedula, x.filial, telefonoTxt(x.telefono), x.clave, x.nota])])) return;
            descargado = true; DB.log("Claves descargadas (Excel)", `${L.length} afiliado(s)`);
        };
        q("xr-print").onclick = () => {
            const w = window.open("", "_blank");
            if (!w) return showToast("El navegador bloqueó la ventana. Permita las ventanas emergentes.");
            w.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>${E(titulo)}</title>
                <style>body{font-family:Arial,sans-serif;padding:18px}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:16px}th,td{border:1px solid #444;padding:9px;text-align:left}.c{font:bold 24px monospace;letter-spacing:.25em}tr{page-break-inside:avoid}</style>
                <h1>ADEP Vota · ${E(titulo)} · ${hoy()}</h1><p>Entregue cada clave solo a su dueño y destruya esta hoja después.</p>
                <table><tr><th>Nombre</th><th>Cédula</th><th>Filial</th><th>Clave temporal</th></tr>
                ${L.map(x => `<tr><td>${E(x.nombre)}</td><td>${E(x.cedula)}</td><td>${E(x.filial)}</td><td class="c">${E(x.clave)}</td></tr>`).join("")}</table>
                <script>window.onload=function(){window.print()}<\/script></html>`);
            w.document.close();
            descargado = true; DB.log("Hoja de claves impresa", `${L.length} afiliado(s)`);
        };
        q("xr-fin").onclick = () => cerrar(false);
    }
})();