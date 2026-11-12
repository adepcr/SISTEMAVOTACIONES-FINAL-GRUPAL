/* solicitudes.js · ADEP Vota · SOLICITUDES DE AYUDA Y DE CORRECCIÓN DE DATOS
   (idea tomada del proyecto de Rashid, adaptada a las reglas de seguridad de ADEP Vota)

   AFILIADO
   - En cada consulta: «¿Necesita ayuda? Avisar a ADEP» → «Me equivoqué de opción», «No alcancé a votar»
     o «Tengo otro problema». La solicitud NO dice qué votó. Puede cancelarla.
   - En «Votaciones»: «¿Sus datos están mal? Pedir corrección» (nombre, filial, teléfono).
     Solo el administrador puede cambiar los datos de verdad.

   ADMINISTRADOR
   - Pestaña Gestionar: lista en vivo de solicitudes de ayuda con acciones directas
     (Restaurar voto · +5 minutos · Reabrir 5 minutos · WhatsApp · Marcar atendida). Número rojo en la pestaña.
   - Pestaña Gestionar: botones «+5 min» en consultas abiertas con cierre y «Reabrir 5 min» en cerradas.
   - Pestaña Afiliados: solicitudes de corrección de datos con «Aprobar» o «Rechazar» (se ve qué cambia).
   - Pestaña Resultados: «Ocultar cifras» (para proyectar en pantalla sin influir mientras se vota).

   Para quitarlo: borrar la línea  await cargar("js/solicitudes.js");  de index.html */
(function () {
    "use strict";
    if (typeof DB === "undefined" || typeof user === "undefined" || !user) return;
    const admin = user.rol === "Administrador";
    const q = id => document.getElementById(id);
    const E = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const hora = iso => iso ? new Date(iso).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" }) : "";
    const MOTIVOS = {
        equivocado: ["fa-rotate-left", "Me equivoqué de opción al votar"],
        tiempo: ["fa-hourglass-end", "No alcancé a votar a tiempo"],
        problema: ["fa-circle-question", "Tengo otro problema para votar"]
    };
    const btnP = "bg-adep-green hover:bg-adep-greenDark text-white font-bold px-4 py-3 rounded-xl text-sm";
    const btnS = "bg-adep-greenLight text-adep-green hover:bg-emerald-100 font-bold px-3 py-2 rounded-xl text-sm border border-emerald-200";
    const btnG = "bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-3 py-2 rounded-xl text-sm";
    const btnA = "bg-amber-100 text-amber-800 border border-amber-200 font-bold px-3 py-2 rounded-xl text-sm";

    DB.escucharSolicitudes();

    /* ---------- Ventana genérica ---------- */
    let cerrarVentana = null;
    function ventana(titulo, cuerpo, alAbrir) {
        if (cerrarVentana) cerrarVentana();
        const ov = document.createElement("div");
        ov.className = "fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4";
        ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "xs-tit");
        ov.innerHTML = `<div class="bg-white rounded-3xl max-w-md w-full max-h-[95vh] overflow-y-auto shadow-2xl">
            <div class="bg-adep-green text-white p-5"><h3 id="xs-tit" class="text-xl font-black font-heading">${titulo}</h3></div>
            <div class="p-5 space-y-4">${cuerpo}</div></div>`;
        document.body.appendChild(ov);
        const esc = e => { if (e.key === "Escape") cerrar(); };
        function cerrar() { ov.remove(); document.removeEventListener("keydown", esc); cerrarVentana = null; }
        cerrarVentana = cerrar;
        ov.addEventListener("click", e => { if (e.target === ov || e.target.closest("[data-xs-cerrar]")) cerrar(); });
        document.addEventListener("keydown", esc);
        alAbrir && alAbrir(ov, cerrar);
        return cerrar;
    }

    /* ======================= AFILIADO ======================= */
    if (!admin) {
        // ---- Ayuda en cada consulta ----
        function decorarPolls() {
            DB.polls().filter(p => DB.visible(p)).forEach(p => {
                const card = q("poll-card-" + p.id);
                if (!card || card.querySelector(".xs-ayuda")) return;
                const est = DB.estado(p), voto = DB.hasVoted(p.id, user.cedula);
                // Abierta: siempre. Cerrada: solo si no votó (no alcanzó). Programada: no.
                if (!(est === "abierta" || (est === "cerrada" && !voto))) return;
                const sol = DB.miAyuda(p.id);
                const box = document.createElement("div");
                box.className = "xs-ayuda px-4 sm:px-6 pb-4";
                box.innerHTML = sol
                    ? `<div class="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 border-2" style="background:#fffbeb;border-color:#fcd34d">
                        <span class="text-sm font-bold text-amber-900"><i class="fa-solid fa-life-ring mr-1"></i>Su pedido de ayuda fue enviado (${E(MOTIVOS[sol.motivo] ? MOTIVOS[sol.motivo][1].toLowerCase() : "ayuda")}). Un administrador lo atenderá.</span>
                        <button type="button" data-xs-cancelar="${p.id}" class="${btnG}">Cancelar pedido</button></div>`
                    : `<button type="button" data-xs-pedir="${p.id}" class="w-full text-left text-sm font-bold text-gray-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-3">
                        <i class="fa-solid fa-life-ring text-adep-green mr-1"></i> ¿Necesita ayuda con esta consulta? <span class="underline text-adep-green">Avisar a ADEP</span></button>`;
                card.appendChild(box);
            });
        }
        function pedir(pid) {
            const p = DB.polls().find(x => x.id === pid); if (!p) return;
            const voto = DB.hasVoted(pid, user.cedula), est = DB.estado(p);
            const opciones = Object.entries(MOTIVOS).filter(([k]) => k === "equivocado" ? voto && est === "abierta" : k === "tiempo" ? !voto && est === "cerrada" : true);
            ventana("Pedir ayuda a ADEP", `
                <p class="text-base text-gray-700">Consulta: <strong>${E(p.sinPregunta ? "(sin pregunta)" : p.titulo)}</strong></p>
                <p class="text-sm text-gray-600">Elija qué le pasó. Un administrador lo verá de inmediato. <strong>No se envía lo que usted votó.</strong></p>
                <div class="space-y-2" role="radiogroup" aria-label="Motivo">
                    ${opciones.map(([k, [ic, t]], i) => `<label class="flex items-center gap-3 border-2 border-gray-200 rounded-xl p-3 cursor-pointer has-[:checked]:border-adep-green has-[:checked]:bg-adep-greenLight">
                        <input type="radio" name="xs-motivo" value="${k}" ${i === 0 ? "checked" : ""} class="w-5 h-5 accent-adep-green">
                        <span class="font-bold text-gray-800"><i class="fa-solid ${ic} text-adep-green mr-1"></i>${t}</span></label>`).join("")}
                </div>
                <label class="block"><span class="text-sm font-bold text-gray-700">Comentario (opcional)</span>
                    <textarea id="xs-nota" maxlength="200" rows="2" class="mt-1 w-full border-2 border-gray-200 rounded-xl p-3" placeholder="Ej: toqué la opción equivocada"></textarea></label>
                <div class="grid gap-2">
                    <button type="button" id="xs-enviar" class="${btnP} py-4 text-lg"><i class="fa-solid fa-paper-plane mr-1"></i> Enviar pedido</button>
                    <button type="button" data-xs-cerrar class="${btnG} py-4 text-base">Regresar</button>
                </div>`, (ov, cerrar) => {
                ov.querySelector("[data-xs-cerrar]").focus();
                q("xs-enviar").onclick = async () => {
                    const b = q("xs-enviar"); b.disabled = true;
                    const motivo = (ov.querySelector('input[name="xs-motivo"]:checked') || {}).value || "problema";
                    const r = await DB.pedirAyuda(pid, motivo, q("xs-nota").value);
                    if (r.error) { b.disabled = false; return showToast(r.error); }
                    cerrar(); showToast("Pedido enviado. Un administrador lo atenderá pronto.", "success");
                };
            });
        }
        q("polls-list").addEventListener("click", async e => {
            const a = e.target.closest("[data-xs-pedir]");
            if (a) return pedir(+a.dataset.xsPedir);
            const c = e.target.closest("[data-xs-cancelar]");
            if (c && confirm("¿Cancelar su pedido de ayuda?")) { if (await DB.cancelarAyuda(+c.dataset.xsCancelar)) showToast("Pedido cancelado.", "success"); }
        });

        // ---- Corrección de datos ----
        const sec = q("sec-votacion");
        const caja = document.createElement("div");
        caja.id = "xs-datos";
        sec.appendChild(caja);
        function pintarDatos() {
            const s = DB.solicitudes()[0];
            caja.innerHTML = s
                ? `<div class="bg-white rounded-2xl border-2 border-amber-200 p-4 flex flex-wrap items-center justify-between gap-3">
                    <p class="text-sm font-semibold text-gray-700"><i class="fa-solid fa-user-pen text-amber-600 mr-1"></i>Su pedido de corrección de datos está en revisión (${E(s.nombre)}${s.provincia ? " · " + E(s.provincia) : ""}).</p>
                    <button type="button" id="xs-datos-cancelar" class="${btnG}">Cancelar pedido</button></div>`
                : `<button type="button" id="xs-datos-abrir" class="w-full text-left bg-white rounded-2xl border-2 border-dashed border-gray-300 hover:border-adep-green p-4 text-sm font-bold text-gray-700">
                    <i class="fa-solid fa-user-pen text-adep-green mr-1"></i> ¿Su nombre, filial o teléfono están mal? <span class="underline text-adep-green">Pedir corrección a ADEP</span></button>`;
        }
        caja.addEventListener("click", async e => {
            if (e.target.closest("#xs-datos-cancelar")) { if (confirm("¿Cancelar su pedido de corrección?") && await DB.cancelarCambioDatos()) showToast("Pedido cancelado.", "success"); return; }
            if (!e.target.closest("#xs-datos-abrir")) return;
            ventana("Corregir mis datos", `
                <p class="text-sm text-gray-600">Escriba sus datos correctos. ADEP los revisará antes de cambiarlos.</p>
                <label class="block"><span class="text-sm font-bold text-gray-700">Nombre completo</span>
                    <input id="xs-d-nombre" maxlength="120" class="mt-1 w-full border-2 border-gray-200 rounded-xl p-3 text-base" value="${E(user.nombre)}"></label>
                <label class="block"><span class="text-sm font-bold text-gray-700">Filial</span>
                    <select id="xs-d-filial" class="mt-1 w-full border-2 border-gray-200 rounded-xl p-3 text-base bg-white"><option value="">(Sin filial)</option>${opcionesFilial(user.provincia || "")}</select></label>
                <label class="block"><span class="text-sm font-bold text-gray-700">Teléfono (WhatsApp)</span>
                    <input id="xs-d-tel" inputmode="numeric" maxlength="15" class="mt-1 w-full border-2 border-gray-200 rounded-xl p-3 text-base" value="${E(user.telefono || "")}" placeholder="Ej: 88887777"></label>
                <label class="block"><span class="text-sm font-bold text-gray-700">Comentario (opcional)</span>
                    <textarea id="xs-d-nota" maxlength="200" rows="2" class="mt-1 w-full border-2 border-gray-200 rounded-xl p-3"></textarea></label>
                <div class="grid gap-2">
                    <button type="button" id="xs-d-enviar" class="${btnP} py-4 text-lg"><i class="fa-solid fa-paper-plane mr-1"></i> Enviar a ADEP</button>
                    <button type="button" data-xs-cerrar class="${btnG} py-4 text-base">Regresar</button>
                </div>`, (ov, cerrar) => {
                q("xs-d-nombre").focus();
                q("xs-d-enviar").onclick = async () => {
                    const nombre = q("xs-d-nombre").value.trim();
                    if (!nombre) return showToast("Escriba su nombre completo.");
                    const r = await DB.pedirCambioDatos({ nombre, provincia: q("xs-d-filial").value, telefono: q("xs-d-tel").value, nota: q("xs-d-nota").value });
                    if (r.error) return showToast(r.error);
                    cerrar(); showToast("Pedido enviado. ADEP revisará sus datos.", "success");
                };
            });
        });

        const _rp = window.renderPolls;
        window.renderPolls = function () { _rp(); decorarPolls(); };
        const _ra = window.renderAll;
        window.renderAll = function () { _ra(); pintarDatos(); };
        window.renderAll();
        return;
    }

    /* ======================= ADMINISTRADOR ======================= */
    const tituloPoll = id => { const p = DB.polls().find(x => x.id === id); return p ? (p.sinPregunta ? `Consulta #${id}` : p.titulo) : "Consulta eliminada"; };
    const MIN5 = 5 * 60 * 1000;
    function extender(p, reabrir) {
        const base = reabrir ? DB.ahora() : Math.max(DB.ahora(), new Date(p.cierre).getTime());
        const nuevo = new Date(base + MIN5).toISOString();
        if (!confirm(reabrir
            ? `¿Reabrir «${tituloPoll(p.id)}» por 5 minutos para TODOS los representantes que no han votado?`
            : `¿Dar 5 minutos más a «${tituloPoll(p.id)}»?`)) return;
        DB.updatePoll(p.id, { cierre: nuevo }, `${reabrir ? "Consulta reabierta 5 minutos" : "Cierre extendido 5 minutos"}: ${p.titulo}`);
        showToast(reabrir ? "Consulta reabierta por 5 minutos." : "Se agregaron 5 minutos.", "success");
    }

    // ---- Panel de solicitudes de ayuda (pestaña Gestionar) ----
    const panel = document.createElement("div");
    panel.id = "xs-panel";
    const ml = q("manage-list");
    ml.parentElement.insertBefore(panel, ml);
    function pintarPanel() {
        const lista = DB.ayudas().slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
        if (!lista.length) { panel.innerHTML = ""; return; }
        panel.innerHTML = `<div class="bg-white rounded-2xl border-2 p-4 space-y-3" style="border-color:#f59e0b">
            <h3 class="font-extrabold text-base text-gray-900"><i class="fa-solid fa-life-ring text-amber-600 mr-1"></i> Pedidos de ayuda de representantes (${lista.length})</h3>
            <ul class="space-y-3">${lista.map(a => {
                const p = DB.polls().find(x => x.id === a.pollId), est = p ? DB.estado(p) : "";
                const af = DB.afiliados().find(x => x.cedula === a.cedula) || {};
                const voto = p && DB.hasVoted(p.id, a.cedula);
                const wa = typeof telefonoWA === "function" ? telefonoWA(af.telefono) : "";
                const [ic, motivo] = MOTIVOS[a.motivo] || MOTIVOS.problema;
                return `<li class="border border-gray-200 rounded-xl p-3 space-y-2">
                    <div class="flex flex-wrap justify-between gap-2"><strong class="text-gray-900">${E(a.nombre)}</strong><span class="text-xs text-gray-500">${E(hora(a.fecha))}</span></div>
                    <p class="text-sm text-gray-700"><i class="fa-solid ${ic} text-amber-600 mr-1"></i><strong>${motivo}</strong> · ${E(tituloPoll(a.pollId))}${est ? ` <span class="text-xs font-bold text-gray-500">(${est}${voto ? ", ya votó" : ", no ha votado"})</span>` : ""}</p>
                    <p class="text-xs text-gray-500">Cédula ${E(a.cedula)}${af.provincia ? " · Filial " + E(af.provincia) : ""}</p>
                    ${a.nota ? `<p class="text-sm bg-slate-50 border border-slate-200 rounded-lg p-2">«${E(a.nota)}»</p>` : ""}
                    <div class="flex flex-wrap gap-2">
                        ${p && est === "abierta" && voto ? `<button type="button" data-xs-rest="${a.pollId}" data-ced="${E(a.cedula)}" class="${btnS}"><i class="fa-solid fa-rotate-left mr-1"></i>Restaurar voto</button>` : ""}
                        ${p && est === "abierta" && p.cierre ? `<button type="button" data-xs-mas="${a.pollId}" class="${btnA}"><i class="fa-solid fa-plus mr-1"></i>5 minutos</button>` : ""}
                        ${p && est === "cerrada" ? `<button type="button" data-xs-reabrir="${a.pollId}" class="${btnA}"><i class="fa-solid fa-lock-open mr-1"></i>Reabrir 5 minutos</button>` : ""}
                        ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="${btnS}"><i class="fa-brands fa-whatsapp mr-1"></i>WhatsApp</a>` : ""}
                        <button type="button" data-xs-listo="${a.pollId}" data-ced="${E(a.cedula)}" class="${btnG}"><i class="fa-solid fa-check mr-1"></i>Marcar atendido</button>
                    </div></li>`;
            }).join("")}</ul></div>`;
    }
    panel.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        const p = id => DB.polls().find(x => x.id === +id);
        if (b.dataset.xsRest) return startRestore(+b.dataset.xsRest, b.dataset.ced);
        if (b.dataset.xsMas && p(b.dataset.xsMas)) return extender(p(b.dataset.xsMas), false);
        if (b.dataset.xsReabrir && p(b.dataset.xsReabrir)) return extender(p(b.dataset.xsReabrir), true);
        if (b.dataset.xsListo) DB.cancelarAyuda(+b.dataset.xsListo, b.dataset.ced).then(ok => ok && showToast("Pedido marcado como atendido.", "success"));
    });

    // Número rojo en la pestaña Gestionar + aviso cuando llega un pedido nuevo
    const tab = q("tab-gestionar");
    const num = document.createElement("span");
    num.className = "hidden bg-adep-red text-white text-[10px] font-extrabold px-1.5 rounded-full";
    tab && tab.appendChild(num);
    const vistos = new Set();
    let primera = true;
    function avisar() {
        const n = DB.ayudas().length;
        num.textContent = n; num.classList.toggle("hidden", !n);
        if (!DB.ayudaCargada) return;
        // Los pedidos que ya estaban al abrir la página no se anuncian (se ven en el panel)
        if (primera) { primera = false; DB.ayudas().forEach(a => vistos.add(a.id)); return; }
        DB.ayudas().filter(a => !vistos.has(a.id)).forEach(a => {
            vistos.add(a.id);
            showToast(`${a.nombre} pide ayuda: ${(MOTIVOS[a.motivo] || MOTIVOS.problema)[1].toLowerCase()}. Vea la pestaña Gestionar.`, "success");
        });
    }

    // ---- +5 min / Reabrir en cada consulta de Gestionar ----
    function decorarManage() {
        ml.querySelectorAll('[data-act="pub"][data-id]').forEach(b => {
            const p = DB.polls().find(x => x.id === +b.dataset.id);
            if (!p || !p.publicada || b.parentElement.querySelector("[data-xs-m]")) return;
            const est = DB.estado(p);
            if (est === "abierta" && p.cierre) b.insertAdjacentHTML("afterend", `<button type="button" data-xs-m="mas" data-xs-id="${p.id}" class="px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200"><i class="fa-solid fa-plus mr-1"></i>5 min</button>`);
            if (est === "cerrada") b.insertAdjacentHTML("afterend", `<button type="button" data-xs-m="reabrir" data-xs-id="${p.id}" class="px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200"><i class="fa-solid fa-lock-open mr-1"></i>Reabrir 5 min</button>`);
        });
    }
    ml.addEventListener("click", e => {
        const b = e.target.closest("[data-xs-m]"); if (!b) return;
        const p = DB.polls().find(x => x.id === +b.dataset.xsId);
        if (p) extender(p, b.dataset.xsM === "reabrir");
    });

    // ---- Solicitudes de corrección de datos (pestaña Afiliados) ----
    const secAf = q("sec-afiliados");
    const cajaDatos = document.createElement("div");
    cajaDatos.id = "xs-datos-admin";
    secAf.insertBefore(cajaDatos, secAf.firstElementChild.nextElementSibling);
    function pintarDatosAdmin() {
        const lista = DB.solicitudes();
        if (!lista.length) { cajaDatos.innerHTML = ""; return; }
        const fila = (t, antes, despues) => (antes || "") === (despues || "") ? ""
            : `<p class="text-sm"><span class="font-bold text-gray-600">${t}:</span> <span class="line-through text-gray-400">${E(antes || "—")}</span> → <strong class="text-adep-green">${E(despues || "—")}</strong></p>`;
        cajaDatos.innerHTML = `<div class="bg-white rounded-2xl border-2 p-4 space-y-3" style="border-color:#f59e0b">
            <h3 class="font-extrabold text-base text-gray-900"><i class="fa-solid fa-user-pen text-amber-600 mr-1"></i> Pedidos de corrección de datos (${lista.length})</h3>
            <ul class="space-y-3">${lista.map(s => {
                const a = DB.afiliados().find(x => x.cedula === s.cedula);
                if (!a) return `<li class="border border-gray-200 rounded-xl p-3 text-sm">Cédula ${E(s.cedula)} ya no está en el padrón. <button type="button" data-xs-no="${E(s.cedula)}" class="${btnG}">Descartar</button></li>`;
                const cambios = fila("Nombre", a.nombre, s.nombre) + fila("Filial", a.provincia, s.provincia) + fila("Teléfono", a.telefono, s.telefono);
                return `<li class="border border-gray-200 rounded-xl p-3 space-y-2">
                    <div class="flex flex-wrap justify-between gap-2"><strong>${E(a.nombre)}</strong><span class="text-xs text-gray-500">Cédula ${E(s.cedula)} · ${E(hora(s.fecha))}</span></div>
                    ${cambios || '<p class="text-sm text-gray-500">No pide cambios (los datos son iguales).</p>'}
                    ${s.nota ? `<p class="text-sm bg-slate-50 border border-slate-200 rounded-lg p-2">«${E(s.nota)}»</p>` : ""}
                    <div class="flex flex-wrap gap-2">
                        <button type="button" data-xs-si="${E(s.cedula)}" class="${btnS}"><i class="fa-solid fa-check mr-1"></i>Aprobar y cambiar</button>
                        <button type="button" data-xs-no="${E(s.cedula)}" class="${btnG}"><i class="fa-solid fa-xmark mr-1"></i>Rechazar</button>
                    </div></li>`;
            }).join("")}</ul></div>`;
    }
    cajaDatos.addEventListener("click", async e => {
        const si = e.target.closest("[data-xs-si]"), no = e.target.closest("[data-xs-no]");
        if (si) { const r = await DB.aprobarCambioDatos(si.dataset.xsSi); if (r.error) showToast(r.error); else showToast("Datos actualizados.", "success"); }
        if (no && confirm("¿Rechazar este pedido? Los datos no cambiarán.")) { if (await DB.rechazarCambioDatos(no.dataset.xsNo)) showToast("Pedido rechazado.", "success"); }
    });

    // ---- Ocultar cifras en Resultados (para proyectar en pantalla) ----
    const rl = q("results-list");
    let ocultas = false;
    try { ocultas = localStorage.getItem("adep_ocultar_cifras") === "1"; } catch { }
    const st = document.createElement("style");
    st.textContent = `.xs-ocultas #results-list>div{position:relative}
      .xs-ocultas #results-list>div>*:not(:first-child){filter:blur(10px);pointer-events:none;user-select:none}
      .xs-ocultas #results-list>div::after{content:"Cifras ocultas";position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);background:#04492a;color:#fff;font-weight:800;padding:.5rem 1rem;border-radius:999px}`;
    document.head.appendChild(st);
    const barra = document.createElement("div");
    barra.className = "flex justify-end";
    barra.innerHTML = `<button type="button" id="xs-ocultar" class="${btnS}" aria-pressed="false"></button>`;
    rl.parentElement.insertBefore(barra, rl);
    function pintarOcultar() {
        const sec = q("sec-resultados");
        sec.classList.toggle("xs-ocultas", ocultas);
        const b = q("xs-ocultar");
        b.setAttribute("aria-pressed", String(ocultas));
        b.innerHTML = ocultas ? '<i class="fa-solid fa-eye mr-1"></i> Mostrar cifras' : '<i class="fa-solid fa-eye-slash mr-1"></i> Ocultar cifras (para proyectar en pantalla)';
    }
    q("xs-ocultar").addEventListener("click", () => {
        ocultas = !ocultas;
        try { localStorage.setItem("adep_ocultar_cifras", ocultas ? "1" : "0"); } catch { }
        pintarOcultar();
    });
    pintarOcultar();

    const _rm = window.renderManage;
    window.renderManage = function () { _rm(); decorarManage(); };
    const _ra = window.renderAll;
    window.renderAll = function () { _ra(); pintarPanel(); pintarDatosAdmin(); avisar(); };
    window.renderAll();
})();
