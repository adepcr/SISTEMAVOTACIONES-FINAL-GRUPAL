/* extras.js · ADEP Vota
   - Panel "Resumen" del administrador (tarjetas con datos reales)
   - Participación por filial (provincia)
   - Resultados con gráfico de dona, ganador destacado y aviso de empate (SVG, sin librerías)
   - Exportar a Excel (resultados y bitácora) + filtros de bitácora por fecha y acción + borrar bitácora
   - Acta oficial en PDF (con logo, resultados, participación y firmas)
   No modifica app.js ni db.js. Para quitarlo: borrar la línea  await cargar("js/extras.js");  de index.html */
(function () {
    "use strict";
    if (typeof DB === "undefined" || typeof user === "undefined" || !user) return;

    const q = id => document.getElementById(id);
    const E = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmtF = iso => new Date(iso).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" });
    const PAL = ["#008744", "#e52521", "#d4af37", "#2563eb", "#7c3aed", "#0891b2", "#ea580c", "#64748b"];
    const ESTADOS = { borrador: "Borrador", programada: "Programada", abierta: "Abierta", cerrada: "Cerrada" };
    const admin = user.rol === "Administrador";

    const st = document.createElement("style");
    st.textContent = `
  .xt-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem}
  .xt-card{background:#fff;border:1px solid #d5e2da;border-left:8px solid #008744;border-radius:1.25rem;padding:1.1rem 1.25rem;box-shadow:0 1px 2px rgba(4,73,42,.08),0 14px 32px -16px rgba(4,73,42,.35)}
  .xt-card.rojo{border-left-color:#e52521}.xt-card.oro{border-left-color:#d4af37}
  .xt-card i{display:block;color:#008744;font-size:1.4rem;margin-bottom:.4rem}
  .xt-card .n{font-family:Outfit,sans-serif;font-weight:900;font-size:2.5rem;line-height:1;color:#04492a}
  .xt-card .l{font-weight:700;color:#4a5a53;margin-top:.4rem}
  .xt-box{background:#fff;border:1px solid #d5e2da;border-radius:1.25rem;padding:1.25rem;box-shadow:0 1px 2px rgba(4,73,42,.08),0 14px 32px -16px rgba(4,73,42,.35)}
  .xt-banner{display:flex;align-items:center;gap:.6rem;border:2px solid;border-radius:1rem;padding:.75rem 1rem;font-weight:800}
  .xt-leg{display:grid;gap:.5rem;flex:1;min-width:0;width:100%}
  .xt-leg div{display:flex;align-items:center;gap:.6rem;font-weight:600;color:#1c2b25}
  .xt-leg b.sw{width:1rem;height:1rem;border-radius:.3rem;flex-shrink:0}
  .xt-leg span.t{flex:1;min-width:0;overflow-wrap:anywhere}
  .xt-leg .w{font-weight:900;color:#04492a}
  .xt-filtros{background:#fff;border:1px solid #d5e2da;border-radius:1.25rem;padding:1.25rem;display:grid;gap:1rem;box-shadow:0 1px 2px rgba(4,73,42,.08),0 14px 32px -16px rgba(4,73,42,.35)}
  .xt-filtros-campos{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
  .xt-lab{display:block;font-weight:800;color:#04492a;margin-bottom:.35rem}
  .xt-filtros-acc{display:flex;flex-wrap:wrap;gap:.75rem}
  .xt-filtros-acc button{flex:1 1 12rem;min-height:52px}
  .xt-log{list-style:none;margin:0;padding:0;display:grid;gap:.75rem}
  .xt-log li{background:#fff;border:1px solid #d5e2da;border-left:6px solid #008744;border-radius:1rem;padding:.9rem 1.1rem}
  .xt-log li.borrada{border-left-color:#e52521;background:#fdf6f6}
  .xt-log-top{display:flex;justify-content:space-between;align-items:baseline;gap:.25rem 1rem;flex-wrap:wrap}
  .xt-log-top strong{color:#1c2b25;font-size:1.05rem}
  .xt-log-top time{color:#4a5a53;font-size:.95rem;font-weight:600}
  .xt-log-det{color:#33433c;margin-top:.25rem;overflow-wrap:anywhere}
  .xt-log-por{color:#006b35;font-weight:700;font-size:.95rem;margin-top:.35rem}
  .xt-log-por i{font-size:.8rem;margin-right:.25rem}`;
    document.head.appendChild(st);

    const sello = () => new Date().toISOString().slice(0, 10);

    /* ---------- Gráfico de dona + ganador / empate ---------- */
    function chartHtml(p, votes) {
        const total = votes.length;
        const datos = p.opciones.map((o, i) => {
            const n = votes.filter(v => v.opcion === o).length;
            return { o, n, pct: total ? Math.round(n * 1000 / total) / 10 : 0, c: PAL[i % PAL.length] };
        });
        const max = Math.max(0, ...datos.map(d => d.n));
        const lideres = max > 0 ? datos.filter(d => d.n === max) : [];
        const cerrada = DB.estado(p) === "cerrada";
        let b;
        if (!total) b = ["background:#f1f5f9;color:#334155;border-color:#cbd5e1", "fa-hourglass-start", "Todavía no hay votos."];
        else if (lideres.length > 1) b = ["background:#fffbeb;color:#92400e;border-color:#fcd34d", "fa-scale-balanced", `Empate entre: ${lideres.map(d => d.o).join(", ")} (${max} votos cada una)`];
        else b = ["background:#e8f5ee;color:#006b35;border-color:#a7dcbf", "fa-trophy", `${cerrada ? "Opción ganadora" : "Va ganando"}: ${lideres[0].o} (${max} ${max === 1 ? "voto" : "votos"})`];

        const R = 52, C = 2 * Math.PI * R; let acc = 0;
        const arcos = datos.filter(d => d.n > 0).map(d => {
            const len = C * d.n / total;
            const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${d.c}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
            acc += len; return s;
        }).join("");
        const svg = `<svg viewBox="0 0 140 140" class="shrink-0" style="width:11rem;height:11rem" role="img" aria-label="Gráfico de resultados: ${total} votos">
            <circle cx="70" cy="70" r="${R}" fill="none" stroke="#e3ece7" stroke-width="22"/>${arcos}
            <text x="70" y="70" text-anchor="middle" font-size="28" font-weight="900" fill="#04492a" font-family="Outfit,sans-serif">${total}</text>
            <text x="70" y="88" text-anchor="middle" font-size="11" font-weight="700" fill="#4a5a53">${total === 1 ? "voto" : "votos"}</text></svg>`;
        const esLider = d => lideres.length === 1 && lideres[0] === d;
        const leyenda = datos.map(d => `<div><b class="sw" style="background:${d.c}"></b><span class="t ${esLider(d) ? "w" : ""}">${esLider(d) ? '<i class="fa-solid fa-trophy" style="color:#d4af37"></i> ' : ""}${E(d.o)}</span><span class="${esLider(d) ? "w" : ""}">${d.n} · ${d.pct}%</span></div>`).join("");
        return `<div class="xt-banner" style="${b[0]}"><i class="fa-solid ${b[1]}"></i><span>${E(b[2])}</span></div>
            <div class="flex flex-col sm:flex-row items-center gap-5 mt-4">${svg}<div class="xt-leg">${leyenda}</div></div>`;
    }

    function decorarResultados() {
        const cont = q("results-list"); if (!cont) return;
        const polls = DB.polls().filter(p => admin || p.publicada);
        const cards = [...cont.children];
        if (!polls.length || cards.length !== polls.length) return;
        polls.forEach((p, i) => {
            const card = cards[i];
            if (card.querySelector(".xt-chart")) return;
            const votes = DB.votes().filter(v => v.pollId === p.id);
            const box = document.createElement("div");
            box.className = "xt-chart";
            box.innerHTML = chartHtml(p, votes);
            if (card.children[1]) card.insertBefore(box, card.children[1]);
            if (admin) {
                const zona = card.children[0] && card.children[0].children[1];
                if (zona) zona.insertAdjacentHTML("beforeend", `<button type="button" data-xt-acta="${p.id}" class="bg-adep-green text-white text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm"><i class="fa-solid fa-stamp"></i> Acta</button>`);
            }
        });
    }

    const _renderResults = window.renderResults;
    window.renderResults = function () { _renderResults(); decorarResultados(); };

    if (!admin) { window.renderResults(); return; }

    /* ================= SOLO ADMINISTRADOR ================= */
    let filialSel = "todas";

    function crearUI() {
        const main = document.querySelector("main");
        const nav = document.querySelector('nav[aria-label="Secciones"]');
        const tab = document.createElement("button");
        tab.id = "tab-resumen";
        tab.className = "nav-tab flex-1 py-3 px-3 text-center text-xs sm:text-sm font-semibold text-gray-600 hover:text-adep-green whitespace-nowrap flex items-center justify-center gap-2";
        tab.innerHTML = '<i class="fa-solid fa-gauge-high text-base text-adep-green"></i><span>Resumen</span>';
        tab.addEventListener("click", () => switchTab("resumen"));
        nav.prepend(tab);

        const sec = document.createElement("section");
        sec.id = "sec-resumen"; sec.className = "hidden space-y-6";
        sec.innerHTML = `
            <div class="border-b border-gray-200 pb-3">
                <h2 class="text-lg sm:text-xl font-bold text-gray-900 font-heading">Resumen general</h2>
                <p class="text-sm text-gray-500">Datos reales de la asociación en este momento.</p>
            </div>
            <div id="xt-cards" class="xt-cards"></div>
            <div class="xt-box space-y-4">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <h3 class="font-extrabold text-lg text-gray-900"><i class="fa-solid fa-location-dot text-adep-green mr-1"></i> Participación por filial</h3>
                    <select id="xt-f-poll" aria-label="Consulta a analizar" class="border-2 border-gray-300 rounded-xl p-2.5 font-semibold bg-white max-w-full"></select>
                </div>
                <div id="xt-filial" class="space-y-4"></div>
            </div>`;
        main.prepend(sec);
        q("xt-f-poll").addEventListener("change", e => { filialSel = e.target.value; renderFilial(); });

        // Resultados: botón de exportar a Excel junto a "Actualizar"
        const head = q("sec-resultados").firstElementChild;
        const refresh = head && head.querySelector("button");
        if (refresh) {
            const wrap = document.createElement("div");
            wrap.className = "flex gap-2 flex-wrap";
            refresh.replaceWith(wrap);
            wrap.append(refresh);
            wrap.insertAdjacentHTML("beforeend", '<button type="button" id="xt-res-csv" class="bg-adep-greenLight text-adep-green hover:bg-emerald-100 font-bold text-sm px-4 py-2 rounded-xl border border-emerald-200 transition flex items-center gap-1.5"><i class="fa-solid fa-file-excel"></i> Exportar a Excel</button>');
        }

        // Bitácora: filtros con calendario + exportar + borrar
        q("audit-list").insertAdjacentHTML("beforebegin", `
            <div class="xt-filtros">
                <div class="xt-filtros-campos">
                    <div><label for="xt-a-desde" class="xt-lab">Desde</label><input id="xt-a-desde" type="date"></div>
                    <div><label for="xt-a-hasta" class="xt-lab">Hasta</label><input id="xt-a-hasta" type="date"></div>
                    <div><label for="xt-a-acc" class="xt-lab">Acción</label><select id="xt-a-acc" class="w-full bg-white font-semibold"><option value="">Todas</option></select></div>
                </div>
                <div class="xt-filtros-acc">
                    <button type="button" id="xt-a-quitar" class="hidden bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl px-4"><i class="fa-solid fa-filter-circle-xmark mr-1"></i>Quitar filtros</button>
                    <button type="button" id="xt-a-csv" class="bg-adep-green text-white font-bold rounded-xl px-4"><i class="fa-solid fa-file-excel mr-1"></i>Descargar Excel</button>
                    <button type="button" id="xt-a-borrar" class="bg-adep-redLight text-adep-red border border-red-200 font-bold rounded-xl px-4"><i class="fa-solid fa-trash-can mr-1"></i>Borrar bitácora</button>
                </div>
            </div>
            <p id="xt-a-count" class="text-sm text-gray-500"></p>`);
        const conActividad = d => { const k = d.toDateString(); return DB.auditoria().some(a => new Date(a.fecha).toDateString() === k); };
        const cal = [["xt-a-desde", "Mostrar desde el día"], ["xt-a-hasta", "Mostrar hasta el día"]].map(([id, t]) =>
            window.ADEPCalendario ? window.ADEPCalendario.adjuntar(q(id), t, { soloFecha: true, vacio: "Cualquier día", marcar: conActividad }) : null);
        ["xt-a-desde", "xt-a-hasta", "xt-a-acc"].forEach(id => q(id).addEventListener("change", () => window.renderAudit()));
        q("xt-a-quitar").addEventListener("click", () => {
            q("xt-a-desde").value = ""; q("xt-a-hasta").value = ""; q("xt-a-acc").value = "";
            cal.forEach(c => c && c.refrescar());
            window.renderAudit();
        });
        q("xt-a-csv").addEventListener("click", exportarBitacora);
        q("xt-a-borrar").addEventListener("click", async () => {
            const n = DB.auditoria().length;
            if (!n) return showToast("La bitácora ya está vacía.");
            if (!confirm(`¿Borrar los ${n} registro(s) de la bitácora?\n\nEsto no se puede deshacer. Quedará anotado que usted (${user.nombre}) la borró.`)) return;
            try { await DB.limpiarAuditoria(); }
            catch (e) { console.error(e); return showToast("No se pudo borrar la bitácora. Intente de nuevo."); }
            q("xt-a-quitar").click();
            showToast("Bitácora borrada. Quedó registrado quién la borró.", "success");
        });
        const rc = q("xt-res-csv"); if (rc) rc.addEventListener("click", exportarResultados);
    }

    /* ---------- Resumen ---------- */
    function renderResumen() {
        const polls = DB.polls(), padron = DB.padron();
        const abiertas = polls.filter(p => DB.estado(p) === "abierta").length;
        const medibles = polls.filter(p => p.publicada && DB.estado(p) !== "programada");
        const prom = medibles.length && padron
            ? Math.round(medibles.reduce((s, p) => s + Math.min(100, DB.votes().filter(v => v.pollId === p.id).length * 100 / padron), 0) / medibles.length) + "%"
            : "—";
        const hoy = new Date().toLocaleDateString("es-CR");
        const hoyN = DB.voters().filter(r => String(r.fecha).startsWith(hoy)).length
            + DB.votes().filter(v => v.cedula && String(v.fecha).startsWith(hoy)).length;
        const card = (ic, n, l, cls) => `<div class="xt-card ${cls || ""}"><i class="fa-solid ${ic}"></i><div class="n">${n}</div><div class="l">${l}</div></div>`;
        q("xt-cards").innerHTML =
            card("fa-users", padron, "Afiliados activos") +
            card("fa-square-poll-vertical", abiertas, abiertas === 1 ? "Votación abierta" : "Votaciones abiertas", "rojo") +
            card("fa-percent", prom, "Participación promedio", "oro") +
            card("fa-calendar-day", hoyN, hoyN === 1 ? "Voto de hoy" : "Votos de hoy");
        renderFilial();
    }

    function renderFilial() {
        const sel = q("xt-f-poll"), cont = q("xt-filial");
        const vis = DB.polls().filter(p => p.publicada && DB.estado(p) !== "programada");
        if (filialSel !== "todas" && !vis.some(p => String(p.id) === filialSel)) filialSel = "todas";
        sel.innerHTML = '<option value="todas">Todas las consultas (promedio)</option>' +
            vis.map(p => `<option value="${p.id}">${E((p.titulo || "").slice(0, 80))}</option>`).join("");
        sel.value = filialSel;
        if (!vis.length) { cont.innerHTML = '<p class="text-gray-500">Aún no hay consultas abiertas o cerradas para analizar.</p>'; return; }

        const ps = filialSel === "todas" ? vis : vis.filter(p => String(p.id) === filialSel);
        const afs = DB.afiliados().filter(a => a.activo !== false);
        const nombres = [...FILIALES];
        if (afs.some(a => !a.provincia)) nombres.push("");
        const voto = new Map(ps.map(p => [p.id, new Set(quienVoto(p.id).votaron.map(a => a.cedula))]));
        const filas = nombres.map(f => {
            const m = afs.filter(a => (a.provincia || "") === f);
            if (!m.length) return null;
            let votos = 0;
            ps.forEach(p => m.forEach(a => { if (voto.get(p.id).has(a.cedula)) votos++; }));
            const posibles = m.length * ps.length;
            return { f: f || "Sin filial", n: m.length, votos, posibles, pct: Math.min(100, Math.round(votos * 100 / posibles)) };
        }).filter(Boolean).sort((a, b) => b.pct - a.pct);
        if (!filas.length) { cont.innerHTML = '<p class="text-gray-500">Aún no hay afiliados registrados con filial.</p>'; return; }

        const uno = ps.length === 1;
        cont.innerHTML = filas.map(r => `<div>
            <div class="flex justify-between gap-2 font-semibold text-gray-800 flex-wrap"><span>${E(r.f)} <span class="text-gray-500 font-normal">· ${r.n} afiliado${r.n === 1 ? "" : "s"}</span></span>
            <span>${uno ? `${r.votos} de ${r.posibles}` : `${r.votos} votos de ${r.posibles} posibles`} (${r.pct}%)</span></div>
            <div class="h-4 bg-slate-100 rounded-full overflow-hidden mt-1"><div class="bar-fill h-full bg-adep-green rounded-full" style="width:${r.pct}%"></div></div></div>`).join("")
            + `<p class="text-sm text-gray-500">Mayor participación: <strong>${E(filas[0].f)}</strong> (${filas[0].pct}%).${uno ? "" : " Se promedian todas las consultas abiertas y cerradas."}</p>`;
    }

    /* ---------- Exportar resultados ---------- */
    function exportarResultados() {
        const padron = DB.padron();
        const filas = [["Consulta", "Categoría", "Modalidad", "Estado", "Opción", "Votos", "% de votos", "Total de votos", "Afiliados activos", "% participación"]];
        DB.polls().forEach(p => {
            const votes = DB.votes().filter(v => v.pollId === p.id), total = votes.length;
            p.opciones.forEach(o => {
                const n = votes.filter(v => v.opcion === o).length;
                filas.push([p.titulo, p.categoria, p.publica ? "Pública" : "Secreta", ESTADOS[DB.estado(p)], o, n, total ? n / total : 0, total, padron, padron ? Math.min(1, total / padron) : 0]);
            });
        });
        if (filas.length === 1) return showToast("No hay resultados para exportar.");
        if (!bajarExcel(`Resultados_ADEP_${sello()}.xlsx`, "Resultados", filas, { porcentaje: [6, 9] })) return;
        DB.log("Resultados exportados a Excel");
        showToast("Archivo de Excel descargado.", "success");
    }

    /* ---------- Bitácora con filtros ---------- */
    function auditFiltrada() {
        const d = q("xt-a-desde").value, h = q("xt-a-hasta").value, ac = q("xt-a-acc").value;
        const ini = d ? new Date(d + "T00:00:00").getTime() : -Infinity;
        const fin = h ? new Date(h + "T23:59:59.999").getTime() : Infinity;
        return DB.auditoria().filter(a => { const t = new Date(a.fecha).getTime(); return t >= ini && t <= fin && (!ac || a.accion === ac); });
    }
    window.renderAudit = function () {
        const todas = DB.auditoria();
        const sel = q("xt-a-acc"), actual = sel.value;
        const acc = [...new Set(todas.map(a => a.accion))].sort((a, b) => a.localeCompare(b, "es"));
        sel.innerHTML = '<option value="">Todas</option>' + acc.map(a => `<option>${E(a)}</option>`).join("");
        sel.value = acc.includes(actual) ? actual : "";
        const l = auditFiltrada();
        const filtrando = !!(q("xt-a-desde").value || q("xt-a-hasta").value || q("xt-a-acc").value);
        q("xt-a-quitar").classList.toggle("hidden", !filtrando);
        q("xt-a-count").textContent = filtrando
            ? `Mostrando ${Math.min(l.length, 150)} de ${l.length} registro(s) que coinciden · ${todas.length} en total.`
            : `${todas.length} registro(s) en total${todas.length > 150 ? " · se muestran los 150 más recientes" : ""}.`;
        q("audit-list").innerHTML = l.length ? `<ol class="xt-log">${l.slice(0, 150).map(a => `
            <li class="${a.accion === "Bitácora borrada" ? "borrada" : ""}">
                <div class="xt-log-top"><strong>${E(a.accion)}</strong><time datetime="${E(a.fecha)}">${fmtF(a.fecha)}</time></div>
                ${a.detalle ? `<p class="xt-log-det">${E(a.detalle)}</p>` : ""}
                <p class="xt-log-por"><i class="fa-solid fa-user"></i> ${E(a.por)}</p>
            </li>`).join("")}</ol>` : `<p class="text-base text-gray-500 text-center py-8">${todas.length ? "No hay registros con esos filtros." : "La bitácora está vacía."}</p>`;
    };
    function exportarBitacora() {
        const l = auditFiltrada();
        if (!l.length) return showToast("No hay registros para exportar.");
        const filas = [["Fecha", "Hora", "Acción", "Detalle", "Realizado por"], ...l.map(a => {
            const d = new Date(a.fecha);
            return [d.toLocaleDateString("es-CR"), d.toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit" }), a.accion, a.detalle || "", a.por];
        })];
        if (!bajarExcel(`Bitacora_ADEP_${sello()}.xlsx`, "Bitácora", filas)) return;
        DB.log("Bitácora exportada a Excel", `${l.length} registro(s)`);
        showToast("Archivo de Excel descargado.", "success");
    }

    /* ---------- Acta oficial en PDF ---------- */
    let logoActa = null; // imagen del logo en formato dataURL (se carga una vez)
    async function cargarLogo() {
        if (logoActa) return logoActa;
        try {
            const r = await fetch("img/logo-adep.png");
            if (!r.ok) return null;
            const b = await r.blob();
            logoActa = await new Promise((ok, fail) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = fail; f.readAsDataURL(b); });
        } catch { logoActa = null; }
        return logoActa;
    }
    async function acta(pollId) {
        const p = DB.polls().find(x => x.id === pollId);
        if (!p) return showToast("Consulta no encontrada.");
        const logo = await cargarLogo();
        const { jsPDF } = window.jspdf, doc = new jsPDF();
        const votes = DB.votes().filter(v => v.pollId === p.id), total = votes.length, padron = DB.padron();
        const marco = () => {
            doc.setDrawColor(0, 135, 68); doc.setLineWidth(1.2); doc.rect(8, 8, 194, 281);
            doc.setDrawColor(229, 37, 33); doc.setLineWidth(0.3); doc.rect(10, 10, 190, 277);
        };
        marco();
        // Logo ADEP (si no se puede cargar la imagen, se dibuja un sello)
        if (logo) doc.addImage(logo, "PNG", 89, 15, 32, 32);
        else {
            doc.setDrawColor(0, 135, 68); doc.setLineWidth(1.4); doc.circle(105, 32, 15);
            doc.setDrawColor(229, 37, 33); doc.setLineWidth(0.8); doc.circle(105, 32, 12.3);
            doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 135, 68);
            doc.text("ADEP", 105, 34, { align: "center" });
        }
        doc.setFont("helvetica", "bold"); doc.setTextColor(0, 135, 68);
        doc.setFontSize(12); doc.text("ASOCIACIÓN DE EDUCADORES PENSIONADOS", 105, 56, { align: "center" });
        doc.setFontSize(17); doc.setTextColor(4, 73, 42); doc.text("ACTA OFICIAL DE RESULTADOS", 105, 67, { align: "center" });
        doc.setDrawColor(229, 37, 33); doc.setLineWidth(0.8); doc.line(40, 71, 170, 71);

        doc.setTextColor(0, 0, 0); doc.setFontSize(10.5);
        let y = 82;
        const campo = (k, v) => {
            doc.setFont("helvetica", "bold"); doc.text(k + ":", 20, y);
            doc.setFont("helvetica", "normal");
            const t = doc.splitTextToSize(String(v), 128); doc.text(t, 62, y); y += t.length * 5.5 + 2;
        };
        campo("Consulta", p.sinPregunta ? p.categoria : p.titulo);
        campo("Categoría", p.categoria);
        campo("Modalidad", p.publica ? "Voto público (con nombre)" : "Voto secreto");
        campo("Estado", ESTADOS[DB.estado(p)]);
        const hor = [p.apertura ? "Apertura: " + fmtF(p.apertura) : "", p.cierre ? "Cierre: " + fmtF(p.cierre) : ""].filter(Boolean).join("  |  ");
        if (hor) campo("Horario", hor);
        campo("Fecha de emisión", new Date().toLocaleString("es-CR"));
        y += 4;

        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(0, 107, 53);
        doc.text("Resultados", 20, y); y += 7;
        doc.setTextColor(0, 0, 0);
        const max = Math.max(0, ...p.opciones.map(o => votes.filter(v => v.opcion === o).length));
        p.opciones.forEach(o => {
            if (y > 235) { doc.addPage(); marco(); y = 24; }
            const n = votes.filter(v => v.opcion === o).length, pct = total ? Math.round(n * 100 / total) : 0;
            const lider = max > 0 && n === max;
            doc.setFont("helvetica", lider ? "bold" : "normal"); doc.setFontSize(10.5);
            const t = doc.splitTextToSize(o, 105); doc.text(t, 20, y);
            doc.text(`${n} voto(s) - ${pct}%`, 190, y, { align: "right" });
            y += t.length * 5 + 1;
            doc.setFillColor(227, 236, 231); doc.rect(20, y, 170, 4, "F");
            if (pct > 0) { doc.setFillColor(0, 135, 68); doc.rect(20, y, 170 * pct / 100, 4, "F"); }
            y += 10;
        });
        if (y > 225) { doc.addPage(); marco(); y = 24; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(11);
        doc.text(`Total de votos emitidos: ${total}`, 20, y); y += 6;
        doc.text(`Participación: ${total} de ${padron} afiliados activos (${padron ? Math.min(100, Math.round(total * 100 / padron)) : 0}%)`, 20, y); y += 7;
        const lid = p.opciones.filter(o => max > 0 && votes.filter(v => v.opcion === o).length === max);
        doc.setTextColor(0, 107, 53);
        const res = !total ? "Sin votos registrados." : lid.length > 1 ? `Resultado: EMPATE entre ${lid.join(", ")}.` : `Opción con más votos: ${lid[0]}.`;
        doc.text(doc.splitTextToSize(res, 170), 20, y); y += 8;
        const vr = window.XR && window.XR.veredicto(p);
        if (vr) {
            if (y > 205) { doc.addPage(); marco(); y = 24; }
            doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
            vr.L.forEach(l => { const t = doc.splitTextToSize(l, 170); doc.text(t, 20, y); y += t.length * 5 + 1; });
            doc.setFont("helvetica", "bold");
            if (vr.tono === "mal") doc.setTextColor(229, 37, 33); else doc.setTextColor(0, 107, 53);
            const tv = doc.splitTextToSize("Veredicto: " + vr.t, 170); doc.text(tv, 20, y); y += tv.length * 5 + 6;
        }
        y += 4;
        doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        const nota = p.publica ? "Esta consulta fue de voto público." : "Esta consulta fue de voto secreto: el sistema no guarda qué eligió cada afiliado.";
        doc.text(doc.splitTextToSize(nota + " Los resultados corresponden al momento de emisión de esta acta.", 170), 20, y);

        // Firmas
        if (y > 225) { doc.addPage(); marco(); }
        const yf = 262;
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4); doc.setTextColor(0, 0, 0); doc.setFontSize(9.5);
        [["Presidente(a)", 40], ["Secretario(a)", 105], ["Fiscal", 170]].forEach(([r, x]) => {
            doc.line(x - 25, yf, x + 25, yf); doc.text(r, x, yf + 5, { align: "center" });
        });
        doc.setFontSize(8); doc.setTextColor(110, 110, 110);
        doc.text(`Documento generado por ${user.nombre} desde ADEP Vota`, 105, 281, { align: "center" });

        DB.log("Acta PDF generada", p.titulo);
        doc.save(`Acta_${(p.titulo || "consulta").replace(/[^\wÁÉÍÓÚáéíóúñÑ]+/g, "_").slice(0, 25)}_${sello()}.pdf`);
    }

    window.generarActa = acta; // también la usa "Eliminar consulta" en app.js
    document.addEventListener("click", e => {
        const b = e.target.closest("[data-xt-acta]");
        if (b) acta(+b.dataset.xtActa);
    });

    /* ---------- Conexión con app.js ---------- */
    crearUI();
    const _renderAll = window.renderAll;
    window.renderAll = function () { _renderAll(); renderResumen(); };
    switchTab("resumen"); // primera pantalla del administrador
    setInterval(() => { const s = q("sec-resumen"); if (s && !s.classList.contains("hidden")) renderResumen(); }, 30000);
})();