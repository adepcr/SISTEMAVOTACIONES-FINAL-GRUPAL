/* reglas.js · ADEP Vota · REGLAS PARA QUE LA VOTACIÓN VALGA (versión sencilla)
   Una sola lista con opciones en lenguaje común:
   - Nada especial (gana la opción con más votos)
   - Que voten al menos la mitad de los afiliados
   - Que la ganadora tenga más de la mitad de los votos
   - Las dos cosas anteriores
   - Que la ganadora tenga dos tercios de los votos
   - Otra (escribir los porcentajes)
   Muestra "Votación válida / No vale / En curso" en Resultados y las reglas en Votaciones y Gestionar.
   Para quitarlo: borrar la línea  await cargar("js/reglas.js");  de index.html */
(function () {
    "use strict";
    if (typeof DB === "undefined" || typeof user === "undefined" || !user) return;

    const q = id => document.getElementById(id);
    const E = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const admin = user.rol === "Administrador";
    const f1 = n => (Math.round(n * 10) / 10).toString().replace(".", ",");
    const COL = {
        ok: ["#e8f5ee", "#a7dcbf", "#04492a", "fa-circle-check"],
        mal: ["#fdf0f0", "#f5b5b3", "#9b1c18", "fa-circle-xmark"],
        curso: ["#fffbeb", "#fcd34d", "#78350f", "fa-hourglass-half"]
    };

    /* ---------- Lógica (los datos guardados no cambian: quorum, mayoria, mayoriaBase) ---------- */
    function regla(p) {
        let m = +p.mayoria || 0;
        if (Math.abs(m - 66.67) < 0.01) m = 200 / 3;
        return { q: +p.quorum || 0, m, base: p.mayoriaBase === "padron" ? "padron" : "emitidos" };
    }
    const votosTxt = (m, base) => {
        const de = base === "padron" ? "de todos los afiliados activos" : "de los votos";
        if (m === 50) return base === "padron" ? "más de la mitad de todos los afiliados activos" : "más de la mitad de los votos";
        if (Math.abs(m - 200 / 3) < 0.01) return `dos tercios (2 de cada 3) ${de}`;
        return `al menos ${f1(m)}% ${de}`;
    };
    const afiTxt = qn => (qn === 50 ? "la mitad de los afiliados" : `el ${f1(qn)}% de los afiliados`);
    function describir(p) {
        const r = regla(p), a = [];
        if (r.q) a.push(`deben votar al menos ${afiTxt(r.q)}`);
        if (r.m) a.push(`la opción ganadora necesita ${votosTxt(r.m, r.base)}`);
        return a.length ? "Para que valga: " + a.join(" y ") + "." : "";
    }
    function evaluar(p) {
        const r = regla(p);
        if (!r.q && !r.m) return null;
        const votes = DB.votes().filter(v => v.pollId === p.id), total = votes.length, padron = DB.padron();
        const ev = { fin: DB.estado(p) === "cerrada", total, padron, part: padron ? total * 100 / padron : 0, quorumOk: true, mayOk: true, ganador: null, pct: 0, empate: false };
        if (r.q) ev.quorumOk = padron > 0 && total * 100 >= r.q * padron;
        if (r.m) {
            const cont = p.opciones.map(o => ({ o, n: votes.filter(v => v.opcion === o).length }));
            const max = Math.max(0, ...cont.map(c => c.n));
            const lid = max > 0 ? cont.filter(c => c.n === max) : [];
            const base = r.base === "padron" ? padron : total;
            ev.empate = lid.length > 1;
            if (lid.length === 1 && base > 0) {
                ev.ganador = lid[0];
                ev.pct = lid[0].n * 100 / base;
                ev.mayOk = r.m === 50 ? lid[0].n * 2 > base : lid[0].n * 100 >= r.m * base - 1e-9;
            } else ev.mayOk = false;
        }
        ev.valida = ev.quorumOk && ev.mayOk;
        return ev;
    }
    function veredicto(p) {
        const ev = evaluar(p); if (!ev) return null;
        const r = regla(p), L = [];
        if (r.q) L.push(`Han votado ${ev.total} de ${ev.padron} afiliados (${Math.round(ev.part)}%). Se necesita ${afiTxt(r.q)}.`);
        if (r.m) {
            if (ev.empate) L.push("Hay empate en el primer lugar.");
            else if (ev.ganador) L.push(`«${ev.ganador.o}» lleva ${f1(ev.pct)}%. Necesita ${votosTxt(r.m, r.base)}.`);
            else L.push("Todavía no hay votos para calcular quién gana.");
        }
        let tono, t;
        if (ev.fin) {
            if (!ev.quorumOk) { tono = "mal"; t = "La votación no vale: votaron muy pocos afiliados."; }
            else if (r.m && !ev.mayOk) { tono = "mal"; t = ev.empate ? "Sin decisión: hay empate." : "Sin decisión: ninguna opción alcanzó los votos necesarios."; }
            else { tono = "ok"; t = r.m && ev.ganador ? `Votación válida. Ganó: «${ev.ganador.o}».` : "Votación válida: votó suficiente gente."; }
        } else {
            tono = "curso";
            t = ev.valida ? "En curso: hasta ahora se cumple lo necesario." : "En curso: todavía no se cumple lo necesario.";
        }
        return { t, tono, L, ev };
    }
    window.XR = { describir, evaluar, veredicto }; // lo usa el acta PDF

    /* ---------- Formulario sencillo (crear y editar) ---------- */
    const inp = "w-full border-2 border-gray-200 rounded-xl p-3 text-sm font-semibold focus:border-adep-green focus:outline-none bg-white";
    const lab = "block text-sm font-bold text-gray-700 mb-1";
    const PRESET = { ninguna: [0, 0], mitad: [50, 0], ganar: [0, 50], ambas: [50, 50], dos: [0, 66.67] };
    function ayuda(v) {
        const mitad = Math.ceil(DB.padron() / 2);
        const ej = `Ejemplo: hoy hay ${DB.padron()} afiliados activos, así que tendrían que votar al menos ${mitad}.`;
        return {
            ninguna: "La votación vale siempre. Gana la opción con más votos.",
            mitad: "La votación solo vale si vota al menos la mitad de los afiliados. Gana la opción con más votos. " + ej,
            ganar: "Una opción gana solo si tiene más de la mitad de los votos. Si ninguna lo logra, no hay decisión.",
            ambas: "Debe votar al menos la mitad de los afiliados y la ganadora debe tener más de la mitad de los votos. " + ej,
            dos: "Una opción gana solo si tiene al menos 2 de cada 3 votos.",
            otra: "Escriba los porcentajes que quiere usar. Deje en blanco el que no necesite."
        }[v];
    }
    function reglasHtml(pfx) {
        return `<div class="rounded-xl p-4 space-y-3" style="background:#f6fcf8;border:2px solid #b4dac4">
            <p class="font-extrabold text-base text-gray-900"><i class="fa-solid fa-scale-balanced text-adep-green mr-1"></i> ¿Qué se necesita para que la votación valga? (opcional)</p>
            <select id="${pfx}-r" data-xr-r="${pfx}" aria-label="Reglas de la votación" class="${inp}">
                <option value="ninguna">Nada especial: gana la opción con más votos</option>
                <option value="mitad">Que voten al menos la mitad de los afiliados</option>
                <option value="ganar">Que la ganadora tenga más de la mitad de los votos</option>
                <option value="ambas">Las dos cosas anteriores</option>
                <option value="dos">Que la ganadora tenga dos tercios de los votos</option>
                <option value="otra">Otra (escribir los porcentajes)</option>
            </select>
            <p id="${pfx}-ayuda" class="text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl p-3"></p>
            <div id="${pfx}-ow" class="hidden grid gap-3">
                <div><label for="${pfx}-q" class="${lab}">Mínimo de afiliados que deben votar (%)</label>
                    <input id="${pfx}-q" type="number" min="1" max="100" inputmode="numeric" placeholder="Ejemplo: 40" class="${inp}"></div>
                <div><label for="${pfx}-m" class="${lab}">Porcentaje de votos que necesita la ganadora (%)</label>
                    <input id="${pfx}-m" type="number" min="51" max="100" step="0.1" inputmode="decimal" placeholder="Ejemplo: 75" class="${inp}"></div>
            </div>
        </div>`;
    }
    function sync(pfx) {
        const s = q(pfx + "-r"); if (!s) return;
        q(pfx + "-ow").classList.toggle("hidden", s.value !== "otra");
        q(pfx + "-ayuda").textContent = ayuda(s.value);
    }
    function leer(pfx, base) {
        const v = q(pfx + "-r").value;
        if (PRESET[v]) return { quorum: PRESET[v][0], mayoria: PRESET[v][1], mayoriaBase: "emitidos" };
        const qv = q(pfx + "-q").value.trim(), mv = q(pfx + "-m").value.trim();
        const qn = qv === "" ? 0 : Number(qv), mn = mv === "" ? 0 : Number(mv);
        if (isNaN(qn) || qn < 0 || qn > 100) return { error: "El porcentaje de afiliados debe estar entre 1 y 100." };
        if (mv !== "" && (isNaN(mn) || mn <= 50 || mn > 100)) return { error: "Los votos que necesita la ganadora deben ser entre 51 y 100." };
        return { quorum: qn, mayoria: mn, mayoriaBase: base || "emitidos" };
    }
    function poner(pfx, p) {
        const r = regla(p), m = +p.mayoria || 0;
        let v = "otra";
        if (r.base === "emitidos" || !r.m) {
            const hallado = Object.entries(PRESET).find(([, [pq, pm]]) => pq === r.q && Math.abs(pm - m) < 0.01);
            if (hallado) v = hallado[0];
        }
        q(pfx + "-r").value = v;
        if (v === "otra") { q(pfx + "-q").value = r.q || ""; q(pfx + "-m").value = m || ""; }
        sync(pfx);
    }
    document.addEventListener("change", e => { const s = e.target.closest("[data-xr-r]"); if (s) sync(s.dataset.xrR); });

    /* ---------- Decoraciones ---------- */
    function decorarResultados() {
        const cont = q("results-list"); if (!cont) return;
        const polls = DB.polls().filter(p => admin || p.publicada);
        const cards = [...cont.children];
        if (!polls.length || cards.length !== polls.length) return;
        polls.forEach((p, i) => {
            const v = veredicto(p), card = cards[i];
            if (!v || card.querySelector(".xr-res")) return;
            const c = COL[v.tono], el = document.createElement("div");
            el.className = "xr-res rounded-xl p-4 space-y-1";
            el.style.cssText = `background:${c[0]};border:2px solid ${c[1]};color:${c[2]}`;
            el.innerHTML = `<p class="font-extrabold text-base"><i class="fa-solid ${c[3]} mr-1"></i>${E(v.t)}</p>${v.L.map(l => `<p class="text-sm font-semibold">${E(l)}</p>`).join("")}`;
            card.insertBefore(el, card.children[1] || null);
        });
    }
    function decorarPolls() {
        DB.polls().filter(p => p.publicada).forEach(p => {
            const d = describir(p), g = q("options-group-" + p.id);
            if (!d || !g || (g.previousElementSibling && g.previousElementSibling.classList.contains("xr-info"))) return;
            g.insertAdjacentHTML("beforebegin", `<p class="xr-info text-sm font-semibold rounded-xl p-3" style="background:#f6fcf8;border:2px solid #b4dac4;color:#04492a"><i class="fa-solid fa-scale-balanced mr-1"></i>${E(d)}</p>`);
        });
    }
    function decorarManage() {
        const cont = q("manage-list"); if (!cont) return;
        const polls = DB.polls(), cards = [...cont.children];
        if (!polls.length || cards.length !== polls.length) return;
        polls.forEach((p, i) => {
            const card = cards[i]; if (card.querySelector(".xr-m")) return;
            const fila = card.querySelector(".flex-wrap"); if (!fila) return;
            const d = describir(p);
            fila.insertAdjacentHTML("beforebegin", `<p class="xr-m text-sm text-gray-600"><i class="fa-solid fa-scale-balanced text-adep-green mr-1"></i>${d ? E(d) : "Sin reglas especiales: gana la opción con más votos."}</p>`);
            fila.insertAdjacentHTML("beforeend", `<button type="button" data-xr-edit="${p.id}" class="px-3 py-2 rounded-xl bg-slate-100 text-gray-700"><i class="fa-solid fa-scale-balanced mr-1"></i>Reglas</button>`);
        });
    }

    const _rr = window.renderResults;
    if (_rr) window.renderResults = function () { _rr(); decorarResultados(); };
    const _rp = window.renderPolls;
    window.renderPolls = function () { _rp(); decorarPolls(); };

    if (!admin) { window.renderPolls(); window.renderResults && window.renderResults(); return; }

    /* ================= ADMINISTRADOR ================= */
    const form = q("form-new-poll");
    const boton = form && form.querySelector('button[type="submit"]');
    if (boton) {
        boton.insertAdjacentHTML("beforebegin", reglasHtml("xr"));
        sync("xr");
        form.addEventListener("reset", () => setTimeout(() => sync("xr"), 0));
    }
    document.addEventListener("submit", e => {
        if (e.target !== form) return;
        const r = leer("xr");
        if (r.error) { e.preventDefault(); e.stopImmediatePropagation(); showToast(r.error); }
    }, true);
    const _add = DB.addPoll.bind(DB);
    DB.addPoll = function (p) {
        const r = q("xr-r") ? leer("xr") : {};
        return _add(r.error || r.quorum === undefined ? p : { ...p, quorum: r.quorum, mayoria: r.mayoria, mayoriaBase: r.mayoriaBase });
    };

    function cerrar() { const m = q("xr-modal"); if (m) m.remove(); }
    document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
    document.addEventListener("click", e => {
        const ed = e.target.closest("[data-xr-edit]");
        if (ed) {
            const id = +ed.dataset.xrEdit, p = DB.polls().find(x => x.id === id); if (!p) return;
            if (DB.votes().some(v => v.pollId === id)) return showToast("No se pueden cambiar las reglas: la consulta ya tiene votos.");
            cerrar();
            const m = document.createElement("div");
            m.id = "xr-modal"; m.dataset.poll = id;
            m.className = "fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4";
            m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
            m.innerHTML = `<div class="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl max-h-full overflow-y-auto">
                <div class="bg-adep-green text-white p-5 text-center"><h3 class="text-xl font-black font-heading">Reglas de la votación</h3></div>
                <div class="p-5 space-y-4"><p class="font-bold text-gray-900 text-center">${E(p.titulo)}</p>${reglasHtml("xe")}
                    <div class="grid gap-3">
                        <button type="button" data-xr-act="guardar" class="w-full bg-adep-green hover:bg-adep-greenDark text-white font-bold py-3 rounded-xl">Guardar</button>
                        <button type="button" data-xr-act="cancelar" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl">Cancelar</button>
                    </div></div></div>`;
            document.body.appendChild(m);
            poner("xe", p);
            return;
        }
        const a = e.target.closest("[data-xr-act]"); if (!a) return;
        if (a.dataset.xrAct === "cancelar") return cerrar();
        const m = q("xr-modal"), id = +m.dataset.poll, p = DB.polls().find(x => x.id === id);
        const r = leer("xe", p && p.mayoriaBase);
        if (r.error) return showToast(r.error);
        if (!p || DB.votes().some(v => v.pollId === id)) { cerrar(); return showToast("No se pueden cambiar las reglas: la consulta ya tiene votos."); }
        DB.updatePoll(id, r, `Reglas de la votación actualizadas: ${p.titulo}`);
        cerrar();
        showToast("Reglas guardadas.", "success");
        renderAll();
    });

    const _rm = window.renderManage;
    window.renderManage = function () { _rm(); decorarManage(); };
    window.renderAll();
})();