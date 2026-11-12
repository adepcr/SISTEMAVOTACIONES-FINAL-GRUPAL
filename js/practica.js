/* practica.js · ADEP Vota · MODO PRÁCTICA
   Tarjeta de ejemplo al inicio de "Votaciones" para que el afiliado aprenda a votar sin miedo.
   - No guarda nada: no toca votos, padrón, resultados, comprobantes ni bitácora.
   - No necesita campos nuevos en las consultas.
   - El administrador puede mostrarla u ocultarla (Gestionar → interruptor).
   Para quitarlo: borrar la línea  await cargar("js/practica.js");  de index.html */
(function () {
    "use strict";
    if (typeof DB === "undefined" || typeof user === "undefined" || !user) return;

    const q = id => document.getElementById(id);
    const E = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const admin = user.rol === "Administrador";
    const PREGUNTA = "¿Qué le gustaría almorzar hoy?";
    const OPCIONES = ["Arroz con pollo", "Gallo pinto con huevo", "Ensalada fresca"];
    const activa = () => DB._get("practica_activa", true) !== false;

    /* ================= ADMINISTRADOR: interruptor ================= */
    if (admin) {
        const lista = q("manage-list");
        if (lista) {
            lista.insertAdjacentHTML("beforebegin", `
                <label class="flex items-start gap-3 bg-white border-2 border-gray-200 rounded-2xl p-4 font-semibold text-gray-800 cursor-pointer">
                    <input type="checkbox" id="xt-pr-on" class="w-6 h-6 accent-adep-green mt-0.5">
                    <span>Mostrar «Práctica: aprenda a votar» a los afiliados
                        <span class="block text-sm font-normal text-gray-500">Es una votación de ejemplo que no se guarda ni cuenta votos. Aparece al inicio de «Votaciones» de cada afiliado.</span></span>
                </label>`);
            const chk = q("xt-pr-on");
            chk.addEventListener("change", () => {
                DB._set("practica_activa", chk.checked);
                DB.log(chk.checked ? "Modo práctica activado" : "Modo práctica desactivado");
                showToast(chk.checked ? "La práctica ya se muestra a los afiliados." : "La práctica quedó oculta para los afiliados.", "success");
            });
            const _all = window.renderAll;
            window.renderAll = function () { _all(); chk.checked = activa(); };
            chk.checked = activa();
        }
        return;
    }

    /* ================= AFILIADO: tarjeta de práctica ================= */
    let sel = -1, hecho = false, ultimo = "";
    const box = document.createElement("div");
    box.id = "xt-practica";
    q("polls-list").before(box);

    function render() {
        // Si hay votaciones de verdad, la práctica va al final; si no, arriba
        const lista = q("polls-list");
        if (DB.polls().some(p => DB.visible(p))) { if (lista.nextElementSibling !== box) lista.after(box); }
        else if (lista.previousElementSibling !== box) lista.before(box);
        let html = "";
        if (activa()) {
            const opts = OPCIONES.map((o, i) => `
                <div data-opt="${i}" role="radio" aria-checked="${sel === i}" tabindex="0" class="option-card${sel === i ? " selected" : ""} rounded-xl p-4 flex items-center gap-4 cursor-pointer">
                    <input type="radio" tabindex="-1" class="w-6 h-6 accent-adep-green pointer-events-none" ${sel === i ? "checked" : ""}>
                    <span class="text-base sm:text-lg font-semibold text-gray-800">${E(o)}</span>
                </div>`).join("");
            const accion = hecho
                ? `<div class="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <span class="text-base font-bold text-adep-green"><i class="fa-solid fa-circle-check mr-1"></i>¡Muy bien! Ya practicó. Esta práctica no se contó.</span>
                        <button type="button" data-xp="reset" class="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 px-6 rounded-2xl">Practicar de nuevo</button>
                   </div>`
                : `<button type="button" data-xp="enviar" class="w-full sm:w-auto bg-adep-green hover:bg-adep-greenDark text-white font-extrabold py-4 px-7 rounded-2xl text-lg flex items-center justify-center gap-2 shadow-md"><i class="fa-solid fa-paper-plane"></i> Revisar y enviar voto (práctica)</button>`;
            html = `
            <div id="poll-card-practica" class="bg-white rounded-2xl shadow-sm border-2 border-amber-300 overflow-hidden my-5" style="border-top-color:#f59e0b">
                <div class="p-4 flex justify-between items-center gap-2" style="background:#fef3c7;color:#78350f">
                    <span class="text-sm font-bold"><i class="fa-solid fa-graduation-cap mr-1"></i> Práctica · Aprenda a votar</span>
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full" style="background:#78350f;color:#fff">No cuenta</span>
                </div>
                <div class="p-4 sm:p-6 space-y-4">
                    <p class="text-base font-bold rounded-xl p-3" style="background:#fffbeb;border:2px solid #fcd34d;color:#78350f">Esta es una votación de ejemplo, solo para practicar. Puede equivocarse sin problema: <u>su respuesta no se guarda ni se cuenta</u>.</p>
                    <div class="flex flex-col sm:flex-row items-start justify-between gap-3">
                        <h3 class="text-lg sm:text-xl font-extrabold text-gray-900">${E(PREGUNTA)}</h3>
                        <button type="button" data-xp="oir" aria-label="Escuchar la pregunta en voz alta" class="shrink-0 bg-adep-greenLight text-adep-green border-2 border-emerald-200 font-bold text-sm px-3 py-2 rounded-xl flex items-center gap-2"><i class="fa-solid fa-volume-high"></i><span>Escuchar</span></button>
                    </div>
                    <p class="text-base text-gray-600"><strong>Paso 1:</strong> toque la respuesta que prefiere. <strong>Paso 2:</strong> pulse el botón verde. <strong>Paso 3:</strong> confirme.</p>
                    <div class="space-y-3" id="options-group-practica" role="radiogroup" aria-label="Opciones de práctica">${opts}</div>
                    <div class="pt-3 border-t border-gray-100 flex justify-end">${accion}</div>
                </div>
            </div>`;
        }
        if (html === ultimo) return;
        ultimo = html;
        box.innerHTML = html;
    }

    /* ---------- Ventanas ---------- */
    function cerrar() { const m = q("xt-pm"); if (m) m.remove(); }
    function modal(inner) {
        cerrar();
        const m = document.createElement("div");
        m.id = "xt-pm";
        m.className = "fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-4";
        m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
        m.innerHTML = `<div class="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl max-h-full overflow-y-auto">${inner}</div>`;
        document.body.appendChild(m);
        const f = m.querySelector("[data-xpm-focus]"); if (f) f.focus({ preventScroll: true });
    }
    function confirmar() {
        modal(`
            <div class="text-white p-5 text-center" style="background:#d97706"><h3 class="text-2xl font-black font-heading">Revise su voto (práctica)</h3></div>
            <div class="p-6 space-y-4 text-center">
                <p class="text-base text-gray-600">${E(PREGUNTA)}</p>
                <p class="text-sm font-bold text-gray-500 uppercase">Usted eligió:</p>
                <p class="text-2xl font-black text-adep-green bg-adep-greenLight border-2 border-emerald-200 rounded-2xl p-4">${E(OPCIONES[sel])}</p>
                <p class="text-xl font-extrabold text-gray-900">¿Es correcto?</p>
                <div class="grid gap-3">
                    <button type="button" data-xpm="si" data-xpm-focus class="w-full bg-adep-green hover:bg-adep-greenDark text-white font-extrabold py-4 rounded-2xl text-xl shadow-md">Sí, enviar mi voto</button>
                    <button type="button" data-xpm="no" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-4 rounded-2xl text-lg">No, quiero cambiarlo</button>
                </div>
            </div>`);
    }
    function exito() {
        modal(`
            <div class="bg-gradient-to-b from-adep-green to-emerald-800 p-6 text-white text-center">
                <div class="w-16 h-16 bg-white text-adep-green rounded-full flex items-center justify-center mx-auto text-3xl font-black shadow-lg mb-2"><i class="fa-solid fa-check"></i></div>
                <h3 class="text-xl font-black font-heading">¡Muy bien! Así se vota</h3>
            </div>
            <div class="p-6 space-y-4 text-center">
                <p class="text-base text-gray-700">Esto fue <strong>solo una práctica</strong>: su voto no se guardó ni se contó.</p>
                <p class="text-base text-gray-700">En una votación de verdad recibirá un <strong>comprobante con un código</strong> para guardar.</p>
                <div class="grid gap-3">
                    <button type="button" data-xpm="cerrar" data-xpm-focus class="w-full bg-adep-green hover:bg-adep-greenDark text-white font-extrabold py-4 rounded-2xl text-lg">Entendido</button>
                    <button type="button" data-xpm="otra" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-2xl">Practicar de nuevo</button>
                </div>
            </div>`);
    }

    /* ---------- Eventos ---------- */
    box.addEventListener("click", e => {
        const card = e.target.closest(".option-card");
        if (card) { sel = +card.dataset.opt; hecho = false; return render(); }
        const b = e.target.closest("[data-xp]"); if (!b) return;
        const a = b.dataset.xp;
        if (a === "enviar") {
            if (sel < 0) return showToast("Seleccione una respuesta antes de enviar su voto.");
            confirmar();
        }
        if (a === "reset") { sel = -1; hecho = false; render(); }
        if (a === "oir") {
            const t = `${PREGUNTA} Las opciones son: ${OPCIONES.map((o, i) => `Opción ${i + 1}: ${o}`).join(". ")}.`;
            if (typeof leer !== "function" || !leer(t)) showToast("Este navegador no puede leer en voz alta.");
        }
    });
    box.addEventListener("keydown", e => {
        if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("option-card")) { e.preventDefault(); e.target.click(); }
    });
    document.addEventListener("click", e => {
        const b = e.target.closest("[data-xpm]"); if (!b) return;
        const a = b.dataset.xpm;
        if (a === "no" || a === "cerrar") cerrar();
        if (a === "si") { hecho = true; ultimo = ""; render(); exito(); }
        if (a === "otra") { cerrar(); sel = -1; hecho = false; render(); const c = q("poll-card-practica"); if (c) c.scrollIntoView({ block: "center" }); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });

    /* ---------- Conexión con app.js ---------- */
    const _rp = window.renderPolls;
    window.renderPolls = function () { _rp(); render(); };
    render();
})();