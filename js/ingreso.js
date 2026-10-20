/* ingreso.js · ADEP Vota · CÓDIGO DE INGRESO GENERAL (solo administrador)
   - El administrador genera un código de 6 números, el mismo para todos, que vence solo.
   - El afiliado entra con su cédula + ese código; su cédula queda amarrada a ese celular (una cédula, un celular).
   - Si otra persona intenta entrar con una cédula que ya está en otro celular, se bloquea y aparece aquí como aviso.
   - Opcional: aprobar a mano cada ingreso nuevo.
   Para quitarlo: borrar la línea  await cargar("js/ingreso.js");  de index.html */
(function () {
    "use strict";
    if (typeof DB === "undefined" || typeof user === "undefined" || !user || user.rol !== "Administrador") return;
    const host = document.getElementById("af-buscar");
    if (!host) return;

    const q = id => document.getElementById(id);
    const E = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fecha = iso => iso ? new Date(iso).toLocaleString("es-CR", { dateStyle: "medium", timeStyle: "short" }) : "";
    const btnP = "bg-adep-green hover:bg-adep-greenDark text-white font-bold px-4 py-3 rounded-xl text-sm";
    const btnS = "bg-adep-greenLight text-adep-green hover:bg-emerald-100 font-bold px-4 py-3 rounded-xl text-sm border border-emerald-200";
    const btnG = "bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold px-4 py-3 rounded-xl text-sm";
    const btnR = "bg-adep-redLight text-adep-red border border-red-200 font-bold px-3 py-2 rounded-xl text-sm";
    const DURACIONES = [["2", "2 horas"], ["4", "4 horas"], ["8", "8 horas"], ["24", "1 día"], ["72", "3 días"], ["168", "1 semana"]];

    // La caja va primero en la pestaña Afiliados, debajo del título
    const caja = document.createElement("div");
    caja.id = "xg";
    caja.className = "bg-white p-5 rounded-2xl border-2 border-adep-green shadow-sm space-y-4";
    const titulo = host.parentElement.firstElementChild;
    host.parentElement.insertBefore(caja, titulo.nextElementSibling);

    const vigente = g => g && g.activo && g.venceMs > Date.now();

    let mostrado = null;   // si lo dibujado fue un código vigente (para redibujar al vencer)
    function pintar() {
        const g = DB.ingreso(), ok = vigente(g), dur = q("xg-dur") ? q("xg-dur").value : "8";
        mostrado = ok;
        const pend = DB.afiliados().filter(a => a.pendiente && a.uid);
        const alertas = DB.alertas();
        const nombre = ced => { const a = DB.afiliados().find(x => x.cedula === ced); return a ? a.nombre : "Cédula no registrada"; };
        caja.innerHTML = `
            <h3 class="font-bold text-base text-gray-900"><i class="fa-solid fa-key text-adep-green mr-1"></i> Código de ingreso para afiliados</h3>
            <p class="text-sm text-gray-500">Son 6 números, el mismo para todos. El afiliado escribe su cédula y este código, y su cédula queda amarrada a su celular: nadie más puede entrar con ella desde otro aparato.</p>
            ${ok ? `
                <div class="rounded-2xl p-4 text-center" style="background:#e8f5ee;border:2px solid #a7dcbf">
                    <p class="text-sm font-bold text-gray-600">Código vigente</p>
                    <p class="font-mono font-black text-4xl tracking-[.3em] text-adep-green my-1">${E(g.codigo)}</p>
                    <p class="text-sm text-gray-600">Vence: <strong>${E(fecha(new Date(g.venceMs).toISOString()))}</strong></p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" id="xg-copiar-cod" class="${btnS}"><i class="fa-regular fa-copy mr-1"></i> Copiar código</button>
                    <a id="xg-wa" target="_blank" rel="noopener" class="${btnS}"><i class="fa-brands fa-whatsapp mr-1"></i> Compartir por WhatsApp</a>
                    <button type="button" id="xg-apagar" class="${btnG}"><i class="fa-solid fa-power-off mr-1"></i> Apagar código</button>
                </div>` : `
                <p class="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3"><i class="fa-solid fa-circle-info mr-1"></i>${g && g.codigo ? "El código anterior ya venció o está apagado." : "Todavía no hay código."} Los afiliados nuevos no pueden entrar hasta que genere uno. Quienes ya entraron siguen entrando normal.</p>`}
            <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
                <label for="xg-dur" class="text-sm font-bold text-gray-700">Válido por:</label>
                <select id="xg-dur" class="border-2 border-gray-200 rounded-xl p-3 text-sm font-semibold bg-white">
                    ${DURACIONES.map(([v, t]) => `<option value="${v}" ${v === dur ? "selected" : ""}>${t}</option>`).join("")}
                </select>
                <button type="button" id="xg-generar" class="${btnP}"><i class="fa-solid fa-rotate mr-1"></i> ${ok ? "Cambiar por un código nuevo" : "Generar código"}</button>
            </div>
            <label class="flex items-start gap-3 text-sm font-semibold text-gray-700 cursor-pointer">
                <input type="checkbox" id="xg-aprob" class="w-5 h-5 mt-0.5 accent-adep-green" ${g && g.aprobacion ? "checked" : ""}>
                <span>Aprobar a mano cada ingreso nuevo <span class="block font-normal text-gray-500">Más control: cada afiliado que entra por primera vez espera hasta que un administrador lo apruebe aquí.</span></span>
            </label>
            ${pend.length ? `
                <div class="space-y-2">
                    <p class="text-sm font-bold text-amber-800"><i class="fa-solid fa-hourglass-half mr-1"></i> Esperando aprobación (${pend.length})</p>
                    ${pend.map(a => `
                    <div class="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="min-w-0"><p class="font-bold text-gray-900 truncate">${E(a.nombre)}</p>
                            <p class="text-sm text-gray-600">Cédula ${E(a.cedula)}${a.dispositivo ? " · " + E(a.dispositivo) : ""}${a.ultimoIngreso ? " · " + E(fecha(a.ultimoIngreso)) : ""}</p></div>
                        <div class="flex gap-2 shrink-0">
                            <button type="button" data-xg="aprobar" data-id="${E(a.cedula)}" class="${btnP.replace("px-4 py-3", "px-3 py-2")}"><i class="fa-solid fa-check mr-1"></i>Aprobar</button>
                            <button type="button" data-xg="rechazar" data-id="${E(a.cedula)}" class="${btnR}"><i class="fa-solid fa-xmark mr-1"></i>Rechazar</button>
                        </div>
                    </div>`).join("")}
                </div>` : ""}
            <div class="space-y-2 border-t border-gray-200 pt-3">
                <p class="text-sm font-bold ${alertas.length ? "text-adep-red" : "text-gray-700"}"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Intentos bloqueados (${alertas.length})</p>
            ${alertas.length ? `
                    <p class="text-sm text-gray-600">Alguien quiso entrar con una cédula que ya está en otro celular.</p>
                    ${alertas.map(al => `
                    <div class="rounded-xl border-2 border-red-200 bg-adep-redLight p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="min-w-0"><p class="font-bold text-gray-900 truncate">${E(nombre(al.cedula))}</p>
                            <p class="text-sm text-gray-600">Cédula ${E(al.cedula)} · ${E(fecha(al.fecha))}</p></div>
                        <div class="flex flex-wrap gap-2 shrink-0">
                            ${DB.afiliados().some(a => a.cedula === al.cedula && a.uid) ? `<button type="button" data-xg="liberar" data-id="${E(al.cedula)}" data-al="${E(al.id)}" class="${btnR}"><i class="fa-solid fa-unlock mr-1"></i>Liberar cédula</button>` : ""}
                            <button type="button" data-xg="descartar" data-al="${E(al.id)}" class="${btnG.replace("px-4 py-3", "px-3 py-2")}">Descartar</button>
                        </div>
                    </div>`).join("")}
                    <p class="text-xs text-gray-500">«Liberar cédula» saca a quien la esté usando y deja que el afiliado verdadero entre de nuevo con el código. Si esa persona ya votó, use «Restaurar voto» en Resultados.</p>`
                : `<p class="text-sm text-gray-500">No hay intentos bloqueados. Si alguien intenta entrar con la cédula de un afiliado que ya entró desde otro celular, aparecerá aquí y le saldrá un aviso.</p>`}
            </div>`;
        if (ok) q("xg-wa").href = "https://wa.me/?text=" + encodeURIComponent(mensaje(g));
    }

    // El código va solo en su línea (fácil de copiar) y también dentro del enlace, que lo escribe solo
    function mensaje(g) {
        const url = new URL("login.html?codigo=" + g.codigo, location.href).href;
        return `ADEP Vota · Su código de ingreso es:\n\n${g.codigo}\n\nToque este enlace para entrar (el código ya va incluido):\n${url}\n\nEscriba su número de cédula y toque «Continuar». Solo se pide la primera vez: después su celular queda recordado.\n\nVálido hasta: ${fecha(new Date(g.venceMs).toISOString())}. Cada cédula solo puede entrar desde un celular.`;
    }

    caja.addEventListener("click", async e => {
        const b = e.target.closest("button"); if (!b) return;
        const g = DB.ingreso();
        try {
            if (b.id === "xg-generar") {
                if (vigente(g) && !confirm("¿Cambiar el código? El código actual dejará de servir (quienes ya entraron siguen entrando normal).")) return;
                const horas = +q("xg-dur").value, codigo = DB.genCodigoIngreso();
                await DB.setIngreso({ codigo, activo: true, venceMs: Date.now() + horas * 3600e3, aprobacion: !!(g && g.aprobacion) }, "Código de ingreso generado", `Válido por ${horas} h`);
                showToast("Código generado. Compártalo con los afiliados.", "success");
            }
            if (b.id === "xg-apagar") {
                if (!confirm("¿Apagar el código? Nadie nuevo podrá entrar hasta que genere otro.")) return;
                await DB.setIngreso({ activo: false }, "Código de ingreso apagado");
                showToast("Código apagado.", "success");
            }
            if (b.id === "xg-copiar-cod") {
                await navigator.clipboard.writeText(g.codigo);
                showToast("Código copiado.", "success");
            }
        } catch (err) { console.error(err); showToast("No se pudo completar. Revise su conexión e intente de nuevo."); }
        const id = b.dataset.id, a = DB.afiliados().find(x => x.cedula === id);
        if (b.dataset.xg === "aprobar" && DB.aprobarIngreso(id)) showToast("Ingreso aprobado.", "success");
        if (b.dataset.xg === "rechazar" && a && confirm(`¿Rechazar el ingreso de ${a.nombre}? Ese celular quedará fuera.`)) {
            if (await DB.liberarCedula(id, "Ingreso rechazado")) showToast("Ingreso rechazado.", "success");
        }
        if (b.dataset.xg === "liberar" && a && confirm(`¿Liberar la cédula de ${a.nombre}? Quien la esté usando quedará fuera y el afiliado podrá entrar de nuevo con el código de ingreso.`)) {
            if (await DB.liberarCedula(id)) { await DB.borrarAlerta(b.dataset.al); showToast("Cédula liberada.", "success"); }
        }
        if (b.dataset.xg === "descartar") await DB.borrarAlerta(b.dataset.al);
    });
    caja.addEventListener("change", async e => {
        if (e.target.id !== "xg-aprob") return;
        const on = e.target.checked;
        try { await DB.setIngreso({ aprobacion: on }, on ? "Aprobación manual de ingresos encendida" : "Aprobación manual de ingresos apagada"); }
        catch (err) { console.error(err); e.target.checked = !on; showToast("No se pudo guardar. Intente de nuevo."); }
    });

    // Numerito rojo en la pestaña Afiliados: intentos bloqueados + ingresos esperando aprobación
    const tab = q("tab-afiliados");
    if (tab) tab.insertAdjacentHTML("beforeend", '<span id="badge-afiliados" class="hidden bg-adep-red text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">0</span>');
    function numerito() {
        const n = DB.alertas().length + DB.afiliados().filter(a => a.pendiente && a.uid).length, b = q("badge-afiliados");
        if (!b) return;
        b.textContent = n; b.classList.toggle("hidden", !n);
        tab.setAttribute("aria-label", n ? `Afiliados (${n} aviso(s))` : "Afiliados");
    }

    // Avisos emergentes: alguien espera aprobación, o hubo un intento bloqueado nuevo
    let antes = DB.afiliados().filter(a => a.pendiente && a.uid).length;
    let vistas = new Set(DB.alertas().map(a => a.id));
    const _ra = window.renderAll;
    window.renderAll = function () {
        _ra();
        pintar();
        numerito();
        const ahora = DB.afiliados().filter(a => a.pendiente && a.uid).length;
        if (ahora > antes) showToast(`Hay ${ahora} afiliado(s) esperando aprobación en la pestaña Afiliados.`, "success");
        antes = ahora;
        const nuevas = DB.alertas().filter(a => !vistas.has(a.id));
        if (nuevas.length) {
            const a = DB.afiliados().find(x => x.cedula === nuevas[0].cedula);
            showToast(`⚠ Intento bloqueado: alguien quiso entrar con la cédula ${nuevas[0].cedula}${a ? " (" + a.nombre + ")" : ""} desde otro celular. Revise la pestaña Afiliados.`);
        }
        vistas = new Set(DB.alertas().map(a => a.id));
    };
    pintar();
    numerito();
    // Al vencer el código, la caja se actualiza sola
    setInterval(() => { if (mostrado && !vigente(DB.ingreso())) pintar(); }, 30000);
})();
