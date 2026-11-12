/* este es el app.js */
// ===== Sesión: si no hay usuario, volver al login =====
const user = DB.session();
if (!user) location.replace('login.html');
const isAdmin = !!user && user.rol === 'Administrador';
const selectedVotes = {};   // { pollId: textoOpción }
const receiptData = {};     // { hash: datos del comprobante } para generar PDF
let pendingPoll = null;     // consulta que se está confirmando
let lastHash = null;        // último comprobante emitido
let pendingDel = null;      // consulta que se quiere eliminar
let pendingRestore = null;  // { pid, ced } voto que se quiere restaurar

// Filiales y núcleos de ADEP (lista de la Junta Directiva Central), agrupados por provincia
const FILIALES_POR_PROVINCIA = {
    'San José': ['San José', 'Santa Ana', 'Moravia', 'Pérez Zeledón', 'Puriscal', 'Tibás', 'Hatillo', 'Mora', 'Escazú', 'Goicoechea',
        'Desamparados', 'Coronado', 'Curridabat', 'Pavas', 'San Francisco de Dos Ríos', 'Aserrí', 'Los Santos', 'Montes de Oca', 'La Uruca', 'Zapote'],
    'Alajuela': ['Alajuela', 'Atenas', 'San Ramón', 'Grecia', 'San Carlos', 'Palmares', 'Orotina-San Mateo', 'Naranjo', 'Upala',
        'Poás', 'Alfaro Ruiz-Zarcero', 'Valverde Vega-Sarchí'],
    'Cartago': ['Cartago', 'La Unión', 'Turrialba', 'Paraíso', 'Tejar del Guarco', 'La Suiza'],
    'Heredia': ['Heredia', 'Barva', 'Flores', 'San Rafael de Heredia', 'Santo Domingo de Heredia', 'San Pablo de Heredia',
        'Santa Bárbara de Heredia', 'San Antonio de Belén', 'San Isidro de Heredia', 'Sarapiquí'],
    'Guanacaste': ['Nicoya', 'Santa Cruz', 'Liberia', 'Tilarán', 'Carrillo', 'Cañas', 'Nandayure', 'Sardinal-Carrillo', 'Bagaces',
        'La Cruz', 'Juntas de Abangares', 'Santa Bárbara (Guanacaste)'],
    'Puntarenas': ['Puntarenas', 'Esparza', 'Sur Sur', 'El Roble', 'Quepos', 'Buenos Aires', 'Montes de Oro-Miramar',
        'Osa (Palmar Norte-Sur)', 'Cóbano-Paquera', 'Jicaral', 'San Vito'],
    'Limón': ['Limón', 'Pococí', 'Batán']
};
const PROVINCIAS = Object.keys(FILIALES_POR_PROVINCIA);
const porNombreFilial = (a, b) => a.localeCompare(b, 'es');
const FILIALES = PROVINCIAS.flatMap(p => FILIALES_POR_PROVINCIA[p]).sort(porNombreFilial);
// Provincia de una filial (si el dato viejo ya era una provincia, se devuelve tal cual)
const provinciaDe = f => PROVINCIAS.find(p => FILIALES_POR_PROVINCIA[p].includes(f)) || (PROVINCIAS.includes(f) ? f : '');
// Filial que ya no está en la lista (por ejemplo «Guanacaste», de cuando se usaban provincias)
const filialVieja = f => !!f && !FILIALES.includes(f);
// Opciones de filial agrupadas por provincia; si el afiliado tiene una que ya no está en la lista, se conserva
const opcionesFilial = actual => (filialVieja(actual) ? `<option selected>${esc(actual)}</option>` : '')
    + PROVINCIAS.map(p => `<optgroup label="${esc(p)}">${[...FILIALES_POR_PROVINCIA[p]].sort(porNombreFilial)
        .map(f => `<option ${actual === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</optgroup>`).join('');

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const fmt = iso => new Date(iso).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });

async function logout() {
    if (!isAdmin && !confirm('¿Desea cerrar sesión?\n\nSi este es su propio celular o computadora, puede dejarla abierta. Para volver a entrar, escriba su cédula y toque «Continuar».')) return;
    await DB.logout(); location.replace('login.html');
}

// Si el administrador borra al afiliado, lo desactiva o libera su cédula, su sesión se cierra en ese momento
function sesionRetirada() {
    const v = document.createElement('div');
    v.setAttribute('role', 'alertdialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-live', 'assertive');
    v.setAttribute('aria-labelledby', 'cs-titulo');
    v.className = 'fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4';
    v.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-3">
            <i class="fa-solid fa-circle-notch fa-spin text-4xl text-adep-green" aria-hidden="true"></i>
            <p id="cs-titulo" class="text-2xl font-black text-gray-900 font-heading">Cerrando sesión…</p>
            <p class="text-sm text-gray-600">ADEP retiró el acceso de esta cuenta en este aparato. Si cree que es un error, comuníquese con ADEP.</p>
        </div>`;
    document.body.appendChild(v);
    setTimeout(async () => { await DB.cerrarSesionForzada(); location.replace('login.html'); }, 3500);
}
if (user && !isAdmin) DB.vigilarCuenta(sesionRetirada);

function switchTab(tab) {
    document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    $(`sec-${tab}`).classList.remove('hidden');
    document.body.dataset.tab = tab;   // para el estilo (p. ej. el saludo solo en Resumen y Votaciones)
    $(`tab-${tab}`).classList.add('active');
    renderAll();
    window.scrollTo({ top: 0 });
}

function clearError(id) {
    const i = $(id), e = $(`err-${id}`);
    if (i) i.classList.remove('field-error');
    if (e) e.classList.add('hidden');
}

function showToast(msg, type = 'error') {
    const ok = type !== 'error', t = document.createElement('div');
    t.setAttribute('role', 'status');
    t.className = `p-4 rounded-2xl shadow-lg border text-sm sm:text-base font-bold flex items-center gap-3 pointer-events-auto transition-all duration-300 ${ok ? 'bg-adep-green text-white border-emerald-700' : 'bg-adep-red text-white border-red-700'}`;
    t.innerHTML = `<i class="fa-solid ${ok ? 'fa-circle-check' : 'fa-circle-xmark'} text-lg"></i><span class="flex-1">${esc(msg)}</span>`;
    $('toast-container').appendChild(t);
    setTimeout(() => { t.classList.add('opacity-0'); setTimeout(() => t.remove(), 300); }, 4500);
}

// ===== Helpers de estado =====
const ESTADO = {
    borrador: ['Borrador', 'bg-slate-100 text-gray-600'],
    programada: ['Programada', 'bg-amber-100 text-amber-800'],
    abierta: ['Abierta', 'bg-adep-greenLight text-adep-green'],
    cerrada: ['Cerrada', 'bg-slate-200 text-gray-700']
};
const badgeEstado = p => { const [t, c] = ESTADO[DB.estado(p)]; return `<span class="text-xs font-bold px-2.5 py-1 rounded-full h-fit whitespace-nowrap ${c}">${t}</span>`; };
const horario = p => [p.apertura ? `Abre: ${fmt(p.apertura)}` : '', p.cierre ? `Cierra: ${fmt(p.cierre)}` : ''].filter(Boolean).join(' · ');

// ===== Temporizador (solo en consultas con fecha de apertura o cierre) =====
function fmtRestante(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return (d ? `${d} d ` : '') + `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
function timerHtml(p, kind) {
    const target = kind === 'open' ? p.apertura : p.cierre;
    const left = new Date(target).getTime() - DB.ahora();
    const cls = kind === 'open' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-adep-greenLight border-emerald-200 text-adep-green';
    return `<div data-countdown="${p.id}" data-kind="${kind}" role="timer" class="flex items-center justify-between gap-2 flex-wrap border-2 rounded-xl p-3 font-bold ${cls}">
        <span><i class="fa-solid fa-hourglass-half mr-1"></i>${kind === 'open' ? 'La votación abre en:' : 'La votación cierra en:'}</span>
        <span class="cd-time font-mono text-xl font-black">${fmtRestante(left)}</span>
    </div>`;
}
let firmaEstados = '';
function tickTimers() {
    let refrescar = false;
    // Una consulta programada que abre, o una abierta que cierra, se ve al instante (sin recargar)
    const firma = DB.polls().map(p => p.id + ':' + DB.estado(p) + ':' + DB.visible(p)).join();
    if (firma !== firmaEstados) { if (firmaEstados) refrescar = true; firmaEstados = firma; }
    // Si la consulta se cierra mientras el afiliado revisa su voto, la ventana se cierra sola
    if (pendingPoll !== null) {
        const pp = DB.polls().find(x => x.id === pendingPoll);
        if (!pp || DB.estado(pp) !== 'abierta') { closeConfirm(); showToast('La votación se cerró. Ya no se pueden enviar votos en esa consulta.'); }
    }
    document.querySelectorAll('[data-countdown]').forEach(el => {
        const p = DB.polls().find(x => x.id == el.dataset.countdown);
        if (!p) { refrescar = true; return; }
        const kind = el.dataset.kind, est = DB.estado(p);
        const target = kind === 'open' ? p.apertura : p.cierre;
        const left = target ? new Date(target).getTime() - DB.ahora() : 0;
        const vigente = kind === 'open' ? est === 'programada' : est === 'abierta';
        if (left <= 0 || !vigente) { refrescar = true; return; }
        const t = el.querySelector('.cd-time'); if (t) t.textContent = fmtRestante(left);
    });
    if (refrescar) { renderPolls(); renderResults(); if (isAdmin) renderManage(); }
}

// ===== Votaciones habilitadas =====
function renderPolls() {
    const polls = DB.polls().filter(p => isAdmin ? p.publicada : DB.visible(p));
    const abiertas = polls.filter(p => DB.estado(p) === 'abierta');
    $('badge-pendientes').innerText = isAdmin ? abiertas.length : abiertas.filter(p => !DB.hasVoted(p.id, user.cedula)).length;
    if (!polls.length) {
        $('polls-list').innerHTML = `<div class="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 text-base text-gray-500">${isAdmin ? 'No hay votaciones publicadas. Cree una y publíquela en Gestionar.' : 'No hay votaciones habilitadas por ahora.'}</div>`;
        return;
    }
    $('polls-list').innerHTML = polls.map((p, n) => {
        const est = DB.estado(p);
        const voted = !isAdmin && DB.hasVoted(p.id, user.cedula);
        const canVote = !isAdmin && est === 'abierta' && !voted;
        const opts = p.opciones.map((o, i) => `
            <div data-poll="${p.id}" data-opt="${i}" role="radio" aria-checked="false" tabindex="${canVote ? 0 : -1}" class="option-card rounded-xl p-4 flex items-center gap-4 ${canVote ? 'cursor-pointer' : 'opacity-70'}">
                <input type="radio" name="p${p.id}" tabindex="-1" class="w-6 h-6 accent-adep-green pointer-events-none" ${canVote ? '' : 'disabled'}>
                <span class="text-base sm:text-lg font-semibold text-gray-800">${esc(o)}</span>
            </div>`).join('');
        const action = isAdmin ? '<span class="text-sm text-gray-500">Vista de administrador: los administradores no votan.</span>'
            : voted ? '<span class="text-base font-bold text-adep-green"><i class="fa-solid fa-circle-check mr-1"></i>Voto enviado y guardado</span>'
                : est === 'cerrada' ? '<span class="text-base font-bold text-gray-600"><i class="fa-solid fa-lock mr-1"></i>Esta consulta ya cerró</span>'
                    : est === 'programada' ? '<span class="text-base font-bold text-amber-700"><i class="fa-regular fa-clock mr-1"></i>Todavía no abre. Vuelva en la fecha indicada.</span>'
                        : `<button data-send="${p.id}" class="w-full sm:w-auto bg-adep-green hover:bg-adep-greenDark text-white font-extrabold py-4 px-7 rounded-2xl text-lg flex items-center justify-center gap-2 shadow-md"><i class="fa-solid fa-paper-plane"></i> Revisar y enviar voto</button>`;
        const etiqueta = voted ? 'Completada' : est === 'cerrada' ? 'Cerrada' : est === 'programada' ? 'Próximamente' : p.publica ? 'Voto público' : 'Voto secreto';
        const privacidad = p.publica
            ? '<i class="fa-solid fa-eye mr-1 text-adep-green"></i> En esta consulta su nombre aparecerá junto a su voto.'
            : '<i class="fa-solid fa-user-secret mr-1 text-adep-green"></i> Su voto es secreto: nadie podrá saber qué eligió usted.';
        // Temporizador: solo si la consulta tiene apertura (programada) o cierre establecido
        const temporizador = (est === 'programada' && p.apertura) ? timerHtml(p, 'open')
            : (est === 'abierta' && p.cierre) ? timerHtml(p, 'close') : '';
        return `
        <div id="poll-card-${p.id}" class="bg-white rounded-2xl shadow-sm border-2 ${voted ? 'border-emerald-500' : 'border-gray-200'} overflow-hidden">
            <div class="bg-gradient-to-r from-adep-green to-emerald-800 p-4 text-white flex justify-between items-center gap-2">
                <span class="text-sm font-bold">Consulta #${polls.length - n} · ${esc(p.categoria)}</span>
                <span class="text-xs bg-emerald-900/60 font-bold px-2.5 py-1 rounded-full">${etiqueta}</span>
            </div>
            <div class="p-4 sm:p-6 space-y-4">
                <div class="flex flex-col sm:flex-row items-start justify-between gap-3">
                    ${p.sinPregunta ? '<span class="text-lg font-extrabold text-gray-900">Elija una de las siguientes respuestas:</span>' : `<h3 class="text-lg sm:text-xl font-extrabold text-gray-900">${esc(p.titulo)}</h3>`}
                    <button data-listen="${p.id}" aria-label="Escuchar la pregunta en voz alta" class="shrink-0 bg-adep-greenLight text-adep-green border-2 border-emerald-200 font-bold text-sm px-3 py-2 rounded-xl flex items-center gap-2">
                        <i class="fa-solid fa-volume-high"></i><span>Escuchar</span>
                    </button>
                </div>
                ${horario(p) ? `<p class="text-sm text-gray-500"><i class="fa-regular fa-clock mr-1"></i>${horario(p)}</p>` : ''}
                ${temporizador}
                <div class="space-y-3" id="options-group-${p.id}" role="radiogroup" aria-label="Opciones de respuesta">${opts}</div>
                <span id="err-poll-${p.id}" class="hidden block text-sm font-bold text-adep-red bg-adep-redLight p-3 rounded-lg border border-red-200">Debe seleccionar una opción.</span>
                <p class="text-sm text-gray-600 bg-slate-50 border border-slate-200 rounded-xl p-3">${privacidad}</p>
                <div class="pt-3 border-t border-gray-100 flex justify-end">${action}</div>
            </div>
        </div>`;
    }).join('');
    // restaurar selección visual
    Object.entries(selectedVotes).forEach(([pid, text]) => {
        const p = polls.find(x => x.id == pid); if (!p) return;
        const el = document.querySelector(`[data-poll="${pid}"][data-opt="${p.opciones.indexOf(text)}"]`);
        if (el) { el.classList.add('selected'); el.setAttribute('aria-checked', 'true'); el.querySelector('input').checked = true; }
    });
}

$('polls-list').addEventListener('click', e => {
    const send = e.target.closest('[data-send]');
    if (send) return startConfirm(+send.dataset.send);
    const listen = e.target.closest('[data-listen]');
    if (listen) return readPoll(+listen.dataset.listen);
    const card = e.target.closest('.option-card');
    if (!card || isAdmin) return;
    const pid = +card.dataset.poll, poll = DB.polls().find(p => p.id === pid);
    if (!poll || DB.hasVoted(pid, user.cedula) || DB.estado(poll) !== 'abierta') return;
    $(`options-group-${pid}`).querySelectorAll('.option-card').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-checked', 'false'); });
    card.classList.add('selected');
    card.setAttribute('aria-checked', 'true');
    card.querySelector('input').checked = true;
    selectedVotes[pid] = poll.opciones[+card.dataset.opt];
    $(`err-poll-${pid}`).classList.add('hidden');
});
// Teclado: Enter o Espacio seleccionan una opción
$('polls-list').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('option-card')) { e.preventDefault(); e.target.click(); }
});

function readPoll(pid) {
    const p = DB.polls().find(x => x.id === pid); if (!p) return;
    const texto = `${p.sinPregunta ? '' : p.titulo + '. '}Las opciones son: ${p.opciones.map((o, i) => `Opción ${i + 1}: ${o}`).join('. ')}.`;
    if (!leer(texto)) showToast('Este navegador no puede leer en voz alta.');
}

// ===== Confirmación antes de votar =====
function startConfirm(pid) {
    const poll = DB.polls().find(p => p.id === pid);
    if (!selectedVotes[pid]) {
        $(`err-poll-${pid}`).classList.remove('hidden');
        return showToast('Seleccione una respuesta antes de enviar su voto.');
    }
    pendingPoll = pid;
    $('c-title').innerText = poll.sinPregunta ? '' : poll.titulo;
    $('c-option').innerText = selectedVotes[pid];
    $('c-privacy').innerText = poll.publica ? 'Su nombre aparecerá junto a este voto.' : 'Su voto es secreto: no se guardará junto a su nombre.';
    $('modal-confirm').classList.remove('hidden');
    // Protección contra toques accidentales: «Sí, enviar» se habilita tras una breve pausa
    // y el foco empieza en la opción segura («No, quiero cambiarlo»).
    const si = $('c-yes');
    si.disabled = true;
    clearTimeout(confirmEspera);
    confirmEspera = setTimeout(() => { si.disabled = false; }, 700);
    $('c-no').focus({ preventScroll: true });
    $('modal-confirm').firstElementChild.scrollTop = 0;
}
let confirmEspera = null;
function closeConfirm() { clearTimeout(confirmEspera); $('modal-confirm').classList.add('hidden'); pendingPoll = null; }
function confirmVote() { if ($('c-yes').disabled) return; const pid = pendingPoll; closeConfirm(); if (pid) processVote(pid); }
// Tocar fuera de la ventana equivale a «No, quiero cambiarlo»
$('modal-confirm').addEventListener('click', e => { if (e.target === e.currentTarget) closeConfirm(); });

let votando = false;
async function processVote(pid) {
    if (isAdmin || votando) return;
    if (!selectedVotes[pid]) return;
    votando = true;
    showToast('Enviando su voto…', 'success');
    const vote = await DB.addVote({ pollId: pid, cedula: user.cedula, nombre: user.nombre, provincia: user.provincia, opcion: selectedVotes[pid] });
    votando = false;
    if (vote.error) { renderAll(); return showToast(vote.error); }
    delete selectedVotes[pid];
    const poll = DB.polls().find(p => p.id === pid);
    receiptData[vote.hash] = { nombre: user.nombre, filial: user.provincia, titulo: poll.titulo, opcion: vote.opcion, fecha: vote.fecha, hash: vote.hash, anonimo: !poll.publica };
    lastHash = vote.hash;
    $('m-voter-name').innerText = user.nombre;
    $('m-poll-num').innerText = poll.titulo;
    $('m-option-val').innerText = vote.opcion;
    $('m-timestamp').innerText = vote.fecha;
    $('m-hash-code').innerText = vote.hash;
    $('m-note').innerText = poll.publica
        ? 'Guarde este código como prueba de que su voto fue registrado.'
        : 'Su voto es secreto. Guarde este código: es la única forma de comprobar que su voto fue contado.';
    $('modal-success').classList.remove('hidden');
    renderAll();
}

// ===== Comprobantes =====
function renderReceipts() {
    if (isAdmin) return;
    const pub = DB.votes().filter(v => v.cedula === user.cedula).map(v => ({ pollId: v.pollId, fecha: v.fecha, opcion: v.opcion, hash: v.hash, nombre: v.nombre }));
    const anon = DB.voters().filter(r => r.cedula === user.cedula).map(r => ({ pollId: r.pollId, fecha: r.fecha, anonimo: true, codigo: r.codigo || DB.asegurarCodigo(r.pollId, r.cedula) }));
    const mine = [...pub, ...anon].sort((a, b) => b.pollId - a.pollId);
    $('badge-comprobantes').innerText = mine.length;
    $('receipts-empty').style.display = mine.length ? 'none' : '';
    $('receipts-container').querySelectorAll('.receipt-card').forEach(el => el.remove());
    mine.forEach(v => {
        const poll = DB.polls().find(p => p.id === v.pollId);
        const titulo = poll ? poll.titulo : 'Consulta eliminada';
        const d = document.createElement('div');
        d.className = 'receipt-card bg-white p-5 rounded-2xl border-2 border-emerald-200 shadow-sm flex flex-col sm:flex-row justify-between gap-3';
        if (v.anonimo) {
            receiptData['anon-' + v.pollId] = { nombre: user.nombre, filial: user.provincia, titulo, fecha: v.fecha, anonimo: true, hash: v.codigo };
            d.innerHTML = `
                <div class="space-y-1">
                    <span class="text-sm text-gray-500"><i class="fa-regular fa-clock mr-1"></i>${esc(v.fecha)}</span>
                    <h4 class="font-bold text-gray-900 text-base">${esc(titulo)}</h4>
                    <p class="text-sm text-gray-600"><i class="fa-solid fa-user-secret mr-1 text-adep-green"></i>Voto <strong>secreto</strong> registrado. Su elección no se guarda con su nombre.</p>
                    ${v.codigo ? `<p class="text-sm text-gray-600">Código de verificación: <span class="font-mono font-black text-adep-red bg-adep-redLight px-2 py-0.5 rounded-lg border border-red-200">${esc(v.codigo)}</span></p>` : '<p class="text-sm text-gray-500">Este voto se emitió antes de la actualización y no tiene código de verificación.</p>'}
                </div>
                <div class="sm:text-right space-y-2">
                    <span class="inline-block text-sm font-bold text-adep-green bg-adep-greenLight px-3 py-2 rounded-xl border border-emerald-200"><i class="fa-solid fa-circle-check mr-1"></i>Contado</span>
                    <button onclick="receiptPDF('anon-${v.pollId}')" class="block sm:ml-auto bg-adep-green text-white text-sm font-bold px-4 py-2 rounded-xl"><i class="fa-solid fa-file-pdf mr-1"></i> Descargar PDF</button>
                </div>`;
        } else {
            receiptData[v.hash] = { nombre: v.nombre, filial: user.provincia, titulo, opcion: v.opcion, fecha: v.fecha, hash: v.hash, anonimo: false };
            d.innerHTML = `
                <div class="space-y-1">
                    <span class="text-sm text-gray-500"><i class="fa-regular fa-clock mr-1"></i>${esc(v.fecha)}</span>
                    <h4 class="font-bold text-gray-900 text-base">${esc(titulo)}</h4>
                    <p class="text-sm text-gray-600">Selección: <strong>${esc(v.opcion)}</strong></p>
                    <p class="text-sm text-gray-500">Representante: <strong>${esc(v.nombre)}</strong>${user.provincia ? ` · Filial: <strong>${esc(user.provincia)}</strong>` : ''}</p>
                </div>
                <div class="sm:text-right space-y-2"><span class="block text-xs font-bold text-gray-400 uppercase">Código hash</span>
                    <span class="font-mono text-sm font-black text-adep-red bg-adep-redLight px-2.5 py-1 rounded-lg border border-red-200 inline-block">${esc(v.hash)}</span>
                    <button onclick="receiptPDF('${esc(v.hash)}')" class="block sm:ml-auto bg-adep-green text-white text-sm font-bold px-4 py-2 rounded-xl"><i class="fa-solid fa-file-pdf mr-1"></i> Descargar PDF</button></div>`;
        }
        $('receipts-container').appendChild(d);
    });
}

function receiptPDF(key) {
    const r = receiptData[key]; if (!r) return showToast('Comprobante no disponible.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0, 135, 68);
    doc.text('ADEP - Comprobante de voto', 20, 28);
    doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    let y = 42;
    const line = (k, v) => { const t = doc.splitTextToSize(`${k}: ${v}`, 170); doc.text(t, 20, y); y += t.length * 6 + 3; };
    line('Representante', r.nombre);
    if (r.filial) line('Filial', r.filial);
    line('Consulta', r.titulo);
    if (r.opcion) line('Opcion elegida', r.opcion);
    line('Fecha y hora', r.fecha);
    line('Modalidad', r.anonimo ? 'Voto secreto (no se guarda junto a su nombre)' : 'Voto publico');
    y += 4;
    if (r.hash) {
        // Recuadro destacado con el código para verificar
        doc.setFillColor(232, 245, 238); doc.setDrawColor(0, 135, 68); doc.setLineWidth(0.8);
        doc.roundedRect(20, y, 170, 46, 3, 3, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 107, 53);
        doc.text('CODIGO DE VERIFICACION', 105, y + 9, { align: 'center' });
        doc.setFont('courier', 'bold'); doc.setFontSize(24); doc.setTextColor(229, 37, 33);
        doc.text(r.hash, 105, y + 24, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
        const ins = doc.splitTextToSize('Para verificar su voto: ingrese al portal ADEP Vota, abra "Resultados en Vivo", busque "Verificar un comprobante" y escriba este codigo.', 156);
        doc.text(ins, 105, y + 33, { align: 'center' });
        y += 46;
    } else {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        const t = doc.splitTextToSize('Su voto fue registrado y contado. Por ser un voto secreto, este comprobante no incluye la opcion elegida. Este voto se emitio antes de que el sistema generara codigos de verificacion para votos secretos.', 170);
        doc.text(t, 20, y + 4); y += t.length * 5 + 4;
    }
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 135, 68); doc.setLineWidth(1.5); doc.rect(10, 10, 190, y + 10 - 10 + 6);
    doc.save(`Comprobante_${r.hash || 'voto-secreto-' + String(key).replace('anon-', '')}.pdf`);
}

// Quiénes ya votaron y quiénes faltan (solo participación; nunca qué eligió cada uno). Orden alfabético para no revelar el orden de llegada.
function quienVoto(pollId) {
    const ids = new Set([
        ...DB.voters().filter(r => r.pollId === pollId).map(r => r.cedula),
        ...DB.votes().filter(v => v.pollId === pollId && v.cedula).map(v => v.cedula)
    ]);
    const byName = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
    const todos = DB.afiliados();
    return {
        votaron: todos.filter(a => ids.has(a.cedula)).sort(byName),
        faltan: todos.filter(a => a.activo !== false && !ids.has(a.cedula)).sort(byName)
    };
}
// pollId (opcional): si se indica, cada afiliado muestra el botón "Restaurar" (consulta abierta)
// Con miles de afiliados se muestran los primeros 200 (la lista completa está en el Excel de resultados)
const MAX_LISTA = 200;
function listaAfiliados(todos, vacio, pollId = null) {
    const arr = todos.slice(0, MAX_LISTA), resto = todos.length - arr.length;
    return arr.length
        ? `<ul class="text-sm space-y-1 max-h-56 overflow-y-auto pr-1">${arr.map(a => `<li class="flex justify-between items-center gap-2 border-b border-gray-100 pb-1">
            <span class="font-semibold text-gray-800 min-w-0">${esc(a.nombre)}${a.provincia ? `<span class="block text-xs font-normal text-gray-500">Filial: ${esc(a.provincia)}</span>` : ''}</span>
            <span class="flex items-center gap-2 shrink-0"><span class="text-gray-500">${esc(a.cedula)}</span>${pollId !== null ? `<button data-restore="${pollId}" data-ced="${esc(a.cedula)}" class="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold"><i class="fa-solid fa-rotate-left mr-1"></i>Restaurar</button>` : ''}</span>
        </li>`).join('')}</ul>${resto > 0 ? `<p class="text-xs text-gray-500 mt-1">… y ${resto} más. Busque a alguien en la pestaña Representantes o descargue el Excel de resultados.</p>` : ''}`
        : `<p class="text-sm text-gray-500">${vacio}</p>`;
}

// ===== Resultados =====
function renderResults() {
    const polls = DB.polls().filter(p => isAdmin || DB.visible(p));
    if (!polls.length) { $('results-list').innerHTML = '<p class="text-base text-gray-500 text-center py-8">Aún no hay votaciones con resultados.</p>'; return; }
    // recordar qué listas de participación estaban abiertas para no cerrarlas al refrescar
    const abiertos = new Set([...document.querySelectorAll('#results-list details[open]')].map(d => d.dataset.det));
    const padron = DB.padron();
    $('results-list').innerHTML = polls.map(p => {
        const votes = DB.votes().filter(v => v.pollId === p.id), total = DB.participantes(p.id);
        const part = padron ? Math.min(100, Math.round(total * 100 / padron)) : 0;
        let detalle = '';
        if (isAdmin) {
            const q = quienVoto(p.id);
            const puedeRestaurar = DB.estado(p) === 'abierta';
            detalle = `<details data-det="${p.id}" ${abiertos.has(String(p.id)) ? 'open' : ''} class="bg-white border-2 border-gray-200 rounded-xl p-3">
                <summary class="cursor-pointer text-sm sm:text-base font-bold text-gray-800"><i class="fa-solid fa-list-check text-adep-green mr-1"></i> Registro de participación <span class="text-gray-500 font-semibold">(${q.votaron.length} han votado · ${q.faltan.length} pendientes)</span></summary>
                <div class="grid sm:grid-cols-2 gap-4 mt-3">
                    <div><h4 class="text-sm font-extrabold text-adep-green mb-2"><i class="fa-solid fa-circle-check mr-1"></i> Han emitido su voto (${q.votaron.length})</h4>${listaAfiliados(q.votaron, 'Aún no se registran votos.', puedeRestaurar ? p.id : null)}${puedeRestaurar && q.votaron.length ? '<p class="text-xs text-gray-500 mt-2">«Restaurar» anula el voto registrado por error para que el representante pueda votar nuevamente.</p>' : ''}</div>
                    <div><h4 class="text-sm font-extrabold text-adep-red mb-2"><i class="fa-regular fa-clock mr-1"></i> Pendientes de votar (${q.faltan.length})</h4>${listaAfiliados(q.faltan, 'Todos los representantes activos han emitido su voto.')}</div>
                </div>
            </details>`;
        }
        const rows = p.opciones.map(o => {
            const vs = votes.filter(v => v.opcion === o), pct = total ? Math.round(vs.length * 100 / total) : 0;
            const conNombre = vs.filter(v => v.nombre);
            const names = p.publica && conNombre.length ? `<ul class="mt-2 space-y-1 text-sm max-h-56 overflow-y-auto pr-1">${conNombre.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(v => `
                <li class="flex items-start gap-2 text-gray-700"><i class="fa-solid fa-user text-gray-400 text-xs mt-1"></i><span><span class="font-semibold">${esc(v.nombre)}</span>${v.filial ? `<span class="text-gray-500"> · Filial ${esc(v.filial)}</span>` : ''}</span></li>`).join('')}</ul>` : '';
            return `<div><div class="flex justify-between text-sm sm:text-base font-semibold text-gray-800"><span>${esc(o)}</span><span>${vs.length} (${pct}%)</span></div>
                <div class="h-4 bg-slate-100 rounded-full overflow-hidden mt-1"><div class="bar-fill h-full bg-adep-green rounded-full transition-all duration-700" style="width:${pct}%"></div></div>${names}</div>`;
        }).join('');
        return `<div class="bg-white rounded-2xl border-2 border-gray-200 p-4 sm:p-6 space-y-4">
            <div class="flex justify-between items-start gap-2 flex-wrap">
                <h3 class="font-extrabold text-base sm:text-lg text-gray-900">${esc(p.titulo)}</h3>
                <div class="flex items-center gap-2 flex-wrap">
                    ${badgeEstado(p)}
                    <span class="text-xs font-bold text-adep-green bg-adep-greenLight px-2.5 py-1 rounded-full whitespace-nowrap">${p.publica ? 'Nombres visibles' : 'Voto secreto'}</span>
                </div>
            </div>
            <div class="space-y-4">${rows}</div>
            ${DB.estado(p) === 'cerrada' ? `<div class="flex justify-between gap-2 text-sm sm:text-base font-semibold text-gray-500 border-t border-dashed border-gray-200 pt-3"><span><i class="fa-solid fa-ban mr-1"></i>Nulos (no votaron) <span class="block sm:inline text-xs font-normal">No se cuentan en el resultado</span></span><span>${Math.max(0, padron - total)}</span></div>` : ''}
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div class="flex justify-between text-sm font-bold text-gray-700"><span><i class="fa-solid fa-people-group mr-1"></i>Participación</span><span>${total} de ${padron} representantes (${part}%)</span></div>
                <div class="h-3 bg-slate-200 rounded-full overflow-hidden mt-2"><div class="bar-fill h-full bg-amber-500 rounded-full transition-all duration-700" style="width:${part}%"></div></div>
            </div>${detalle}</div>`;
    }).join('');
}

// ===== Administrador: restaurar un voto por equivocación =====
$('results-list').addEventListener('click', e => {
    const b = e.target.closest('[data-restore]'); if (!b || !isAdmin) return;
    startRestore(+b.dataset.restore, b.dataset.ced);
});

function startRestore(pid, ced) {
    const poll = DB.polls().find(p => p.id === pid);
    if (!poll) return showToast('Consulta no encontrada.');
    if (DB.estado(poll) !== 'abierta') return showToast('Solo se puede restaurar un voto mientras la consulta está abierta.');
    const a = DB.afiliados().find(x => x.cedula === ced);
    const nombre = a ? a.nombre : ced;
    // Solo se pide confirmar: el sistema sabe qué voto quitar (sin mostrarle a nadie qué eligió)
    if (!confirm(`¿Está seguro de restaurar el voto de ${nombre}?\n\nSu voto se anulará y podrá votar de nuevo en esta consulta.`)) return;
    DB.restaurarVoto(pid, ced).then(r => {
        if (r.pedirOpcion) return pedirOpcionRestaurar(pid, ced, nombre, poll);
        if (r.error) return showToast(r.error);
        showToast('Voto restaurado. El representante puede votar de nuevo.', 'success');
        renderAll();
    });
}
// Solo para votos secretos emitidos antes de la actualización: el afiliado indica qué opción eligió
function pedirOpcionRestaurar(pid, ced, nombre, poll) {
    pendingRestore = { pid, ced };
    $('rs-who').innerText = `${nombre} · Cédula ${ced}`;
    $('rs-opcion').innerHTML = poll.opciones.map((o, i) => `<option value="${i}">${esc(o)}</option>`).join('');
    $('modal-restore').classList.remove('hidden');
}
function closeRestore() { $('modal-restore').classList.add('hidden'); pendingRestore = null; }

$('rs-cancel').addEventListener('click', closeRestore);
$('rs-ok').addEventListener('click', async () => {
    if (!pendingRestore) return;
    const { pid, ced } = pendingRestore;
    const poll = DB.polls().find(p => p.id === pid);
    const opcion = poll ? poll.opciones[+$('rs-opcion').value] : '';
    closeRestore();
    const r = await DB.restaurarVoto(pid, ced, opcion);
    if (r.error) return showToast(r.error);
    showToast('Voto restaurado. El representante puede votar de nuevo.', 'success');
    renderAll();
});

// ===== Verificación pública de comprobantes =====
$('verify-form').addEventListener('submit', async e => {
    e.preventDefault();
    const box = $('verify-result'), code = $('verify-code').value;
    if (!code.trim()) return;
    const r = await DB.verify(code);
    box.classList.remove('hidden');
    if (r) {
        box.className = 'text-base font-bold rounded-xl p-4 border-2 bg-adep-greenLight text-adep-green border-emerald-200';
        box.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i> Código válido. Fue registrado en la consulta «${esc(r.titulo)}» el ${esc(r.fecha)}. <span class="block text-sm font-semibold mt-1">Por privacidad no se muestra quién votó.</span>`;
    } else {
        box.className = 'text-base font-bold rounded-xl p-4 border-2 bg-adep-redLight text-adep-red border-red-200';
        box.innerHTML = '<i class="fa-solid fa-circle-xmark mr-1"></i> No encontramos ese código. Revise que lo escribió igual que en su comprobante.';
    }
});

// ===== Administrador: crear y gestionar consultas =====
let guardandoConsulta = false;
async function createNewPoll(e) {
    e.preventDefault();
    if (guardandoConsulta) return;
    const title = $('new-poll-title'), cat = $('new-poll-cat'), opts = $('new-poll-options');
    const sinPreg = $('new-poll-noquestion').checked;
    const list = leerOpciones();
    let bad = false;
    [[title, !sinPreg && !title.value.trim()], [cat, !cat.value.trim()], [opts, list.length < 2 || list.length > DB.MAX_OPCIONES]].forEach(([el, fail]) => {
        if (fail) { el.classList.add('field-error'); $(`err-${el.id}`).classList.remove('hidden'); bad = true; }
    });
    if (bad) return showToast(list.length > DB.MAX_OPCIONES ? `Máximo ${DB.MAX_OPCIONES} opciones por consulta.` : 'Rellene todos los campos requeridos.');
    // Dos opciones iguales se contarían juntas en los resultados
    const repetida = list.find((o, i) => list.findIndex(x => x.toLowerCase() === o.toLowerCase()) !== i);
    if (repetida) { opts.classList.add('field-error'); return showToast(`La opción «${repetida}» está repetida. Cada opción debe ser distinta.`); }
    const ap = $('new-poll-open').value, ci = $('new-poll-close').value;
    if (ap && ci && new Date(ci) <= new Date(ap)) return showToast('La fecha de cierre debe ser posterior a la de apertura.');
    if (ci && new Date(ci).getTime() <= DB.ahora()) return showToast('La fecha de cierre ya pasó. Elija una fecha y hora futuras.');
    guardandoConsulta = true;
    showToast('Guardando la consulta…', 'success');
    const creada = await DB.addPoll({
        titulo: sinPreg ? cat.value.trim() : title.value.trim(), sinPregunta: sinPreg, categoria: cat.value.trim(), opciones: list,
        // Con fecha de apertura queda publicada aunque no se marque «Publicar de inmediato»: se muestra sola a esa hora
        publicada: $('new-poll-publish').checked || !!ap, ocultaHastaApertura: !!ap && !$('new-poll-publish').checked,
        publica: $('new-poll-public').checked,
        apertura: ap ? new Date(ap).toISOString() : '', cierre: ci ? new Date(ci).toISOString() : '',
        creadaPor: user.cedula
    });
    guardandoConsulta = false;
    if (!creada) return;   // el error ya se mostró; el formulario queda como estaba
    $('form-new-poll').reset();
    pintarOpciones(['', '']);
    showToast('Consulta guardada.', 'success');
    switchTab('gestionar');
}

// ===== Opciones de respuesta: un espacio por cada opción =====
const leerOpciones = () => [...document.querySelectorAll('#new-poll-options input')].map(i => i.value.trim()).filter(Boolean);
function pintarOpciones(valores) {
    $('new-poll-options').innerHTML = valores.map((v, i) => `
        <div class="flex items-center gap-2">
            <span class="w-7 h-7 shrink-0 rounded-full bg-adep-greenLight text-adep-green text-sm font-bold flex items-center justify-center">${i + 1}</span>
            <input type="text" value="${esc(v)}" maxlength="200" aria-label="Opción ${i + 1}" placeholder="${['Ej: Sí', 'Ej: No', 'Ej: En blanco'][i] || 'Opción ' + (i + 1)}" class="flex-1 min-w-0 border-2 border-gray-200 rounded-xl p-3 text-sm font-semibold focus:border-adep-green focus:outline-none transition">
            <button type="button" data-quitar="${i}" aria-label="Quitar opción ${i + 1}" class="w-10 h-10 shrink-0 rounded-xl bg-adep-redLight text-adep-red border border-red-200 ${valores.length <= 2 ? 'invisible' : ''}"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
    $('new-poll-add-opt').classList.toggle('hidden', valores.length >= DB.MAX_OPCIONES);
}
const valoresOpciones = () => [...document.querySelectorAll('#new-poll-options input')].map(i => i.value);
function agregarOpcion() {
    const v = valoresOpciones();
    if (v.length >= DB.MAX_OPCIONES) return showToast(`Máximo ${DB.MAX_OPCIONES} opciones por consulta.`);
    pintarOpciones([...v, '']);
    const ins = document.querySelectorAll('#new-poll-options input');
    ins[ins.length - 1].focus();
}
$('new-poll-add-opt').addEventListener('click', agregarOpcion);
$('new-poll-options').addEventListener('input', () => clearError('new-poll-options'));
$('new-poll-options').addEventListener('click', e => {
    const b = e.target.closest('[data-quitar]'); if (!b) return;
    const v = valoresOpciones(); v.splice(+b.dataset.quitar, 1);
    pintarOpciones(v);
});
$('new-poll-options').addEventListener('keydown', e => {
    // Enter en la última opción agrega otra (en vez de enviar el formulario)
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const ins = [...document.querySelectorAll('#new-poll-options input')], i = ins.indexOf(e.target);
    if (i < ins.length - 1) ins[i + 1].focus(); else if (e.target.value.trim()) agregarOpcion();
});
$('new-poll-options').addEventListener('paste', e => {
    // Si se pegan varias líneas, cada una queda en su propio espacio
    const lineas = (e.clipboardData || window.clipboardData).getData('text').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lineas.length < 2 || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const v = valoresOpciones(), i = [...document.querySelectorAll('#new-poll-options input')].indexOf(e.target);
    v.splice(i, 1, ...lineas);
    pintarOpciones(v.filter((x, k) => x.trim() || k < 2).slice(0, DB.MAX_OPCIONES));
});
pintarOpciones(['', '']);

// ===== Preguntas sugeridas según la categoría: al tocar una, se escribe en la pregunta =====
const SUGERENCIAS = {
    'Presupuesto': [
        '¿Aprueba el presupuesto anual presentado por la Junta Directiva?',
        '¿Está de acuerdo con destinar fondos a actividades culturales y recreativas?',
        '¿Aprueba la modificación al presupuesto vigente?'
    ],
    'Candidato': [
        '¿A quién elige para la Junta Directiva?',
        '¿Por quién vota para el cargo de Presidencia?',
        '¿Por quién vota para el cargo de Fiscalía?'
    ],
    'Propuesta': [
        '¿Aprueba la propuesta presentada en la asamblea?',
        '¿Está de acuerdo con la modificación del reglamento interno?',
        '¿Apoya la realización de esta actividad para los representantes?'
    ],
    'Retroalimentación': [
        '¿Cómo califica las actividades realizadas por ADEP este año?',
        '¿Qué tan satisfecho(a) está con los servicios de ADEP?',
        '¿Qué tipo de actividad le gustaría que ADEP organice próximamente?'
    ]
};
function pintarSugerencias() {
    const caja = $('new-poll-sugerencias'), lista = SUGERENCIAS[$('new-poll-cat').value] || [];
    const ver = lista.length && !$('new-poll-noquestion').checked;
    caja.classList.toggle('hidden', !ver);
    caja.innerHTML = ver ? `<p class="text-xs font-bold text-gray-500"><i class="fa-regular fa-lightbulb mr-1 text-amber-500"></i>Preguntas sugeridas (toque una para usarla):</p>`
        + lista.map(t => `<button type="button" data-sugerencia="${esc(t)}" class="block w-full text-left text-sm font-semibold text-adep-green bg-adep-greenLight border border-emerald-200 hover:bg-emerald-100 rounded-xl px-3 py-2">${esc(t)}</button>`).join('') : '';
}
$('new-poll-cat').addEventListener('change', pintarSugerencias);
$('new-poll-sugerencias').addEventListener('click', e => {
    const b = e.target.closest('[data-sugerencia]'); if (!b) return;
    const t = $('new-poll-title');
    t.value = b.dataset.sugerencia; clearError('new-poll-title'); t.focus();
});
$('form-new-poll').addEventListener('reset', () => setTimeout(pintarSugerencias, 0));

function toggleSinPregunta(on) {
    const t = $('new-poll-title');
    t.disabled = on; if (on) { t.value = ''; clearError('new-poll-title'); }
    t.classList.toggle('opacity-50', on);
    t.placeholder = on ? 'Esta consulta no lleva pregunta (solo respuestas)' : 'Ej: ¿Aprueba el presupuesto para actividades culturales 2027?';
    pintarSugerencias();
}

function renderManage() {
    const polls = DB.polls();
    $('manage-list').innerHTML = polls.length ? polls.map(p => {
        const n = DB.participantes(p.id);
        const est = DB.estado(p);
        return `<div class="bg-white rounded-2xl border-2 border-gray-200 p-4 space-y-3">
            <div class="flex justify-between gap-2"><h3 class="font-bold text-base text-gray-900">${esc(p.titulo)}</h3>${badgeEstado(p)}</div>
            <p class="text-sm text-gray-500">${esc(p.categoria)} · ${p.opciones.length} opciones · ${n} votos${horario(p) ? ' · ' + horario(p) : ''}</p>
            ${p.ocultaHastaApertura && est === 'programada' ? '<p class="text-sm font-semibold text-amber-700"><i class="fa-regular fa-clock mr-1"></i>Se mostrará a los representantes automáticamente a la hora de apertura.</p>' : ''}
            <div class="flex flex-wrap gap-2 text-sm font-bold">
                <button data-act="pub" data-id="${p.id}" class="px-3 py-2 rounded-xl bg-adep-green text-white">${p.publicada ? 'Retirar' : 'Publicar'}</button>
                ${est === 'programada' ? `<button data-act="open" data-id="${p.id}" class="px-3 py-2 rounded-xl bg-adep-green text-white"><i class="fa-solid fa-play mr-1"></i>Abrir ahora</button>` : ''}
                ${est === 'abierta' ? `<button data-act="close" data-id="${p.id}" class="px-3 py-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200"><i class="fa-solid fa-lock mr-1"></i>Cerrar ahora</button>` : ''}
                <button data-act="priv" data-id="${p.id}" class="px-3 py-2 rounded-xl bg-adep-greenLight text-adep-green border border-emerald-200 ${n ? 'opacity-60' : ''}"><i class="fa-solid ${n ? 'fa-lock' : p.publica ? 'fa-eye' : 'fa-eye-slash'} mr-1"></i>${p.publica ? 'Votos públicos (con nombre)' : 'Votos anónimos'}</button>
                <button data-act="res" class="px-3 py-2 rounded-xl bg-slate-100 text-gray-700">Ver resultados</button>
                <button data-act="del" data-id="${p.id}" class="px-3 py-2 rounded-xl bg-adep-redLight text-adep-red border border-red-200">Eliminar</button>
            </div></div>`;
    }).join('') : '<p class="text-base text-gray-500 text-center py-8">No hay consultas. Cree la primera en "Crear Consulta".</p>';
}

$('manage-list').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'res') return switchTab('resultados');
    const id = +b.dataset.id, p = DB.polls().find(x => x.id === id);
    if (!p) return;
    if (act === 'pub') DB.updatePoll(id, { publicada: !p.publicada, ocultaHastaApertura: false }, `${p.publicada ? 'Consulta retirada' : 'Consulta publicada'}: ${p.titulo}`);
    if (act === 'priv') {
        if (DB.participantes(id)) return showToast('No se puede cambiar la modalidad: la consulta ya tiene votos.');
        DB.updatePoll(id, { publica: !p.publica }, `Modalidad cambiada a ${p.publica ? 'anónima' : 'pública'}: ${p.titulo}`);
    }
    if (act === 'open') {
        if (!confirm('¿Abrir esta consulta ahora? Los representantes podrán votar desde este momento.')) return;
        DB.updatePoll(id, { publicada: true, apertura: new Date(DB.ahora()).toISOString(), ocultaHastaApertura: false }, `Consulta abierta manualmente: ${p.titulo}`);
        showToast('Consulta abierta. Los representantes ya pueden votar.', 'success');
    }
    if (act === 'close') {
        if (!confirm('¿Cerrar esta consulta ahora? Ya nadie podrá votar.')) return;
        DB.updatePoll(id, { cierre: new Date(DB.ahora()).toISOString() }, `Consulta cerrada manualmente: ${p.titulo}`);
    }
    if (act === 'del') return openDelPoll(id); // pregunta si desea descargar la minuta antes de eliminar
    renderAll();
});

// ===== Administrador: eliminar consulta (ofrece descargar la minuta primero) =====
function openDelPoll(id) {
    const p = DB.polls().find(x => x.id === id); if (!p) return;
    pendingDel = id;
    $('dp-title').innerText = p.titulo;
    $('modal-delpoll').classList.remove('hidden');
}
function closeDelPoll() { $('modal-delpoll').classList.add('hidden'); pendingDel = null; }
function finishDelete(id) {
    closeDelPoll();
    DB.deletePoll(id);
    showToast('Consulta eliminada.', 'success');
    renderAll();
}
$('dp-pdf').addEventListener('click', async () => {
    const id = pendingDel; if (id === null) return;
    if (await generarActa(id) === false) return;   // canceló la descarga: no se elimina
    finishDelete(id);
});
$('dp-nopdf').addEventListener('click', () => { const id = pendingDel; if (id !== null) finishDelete(id); });
$('dp-cancel').addEventListener('click', closeDelPoll);

// ===== Administrador: afiliados =====
// Teléfono para WhatsApp: 8 dígitos de Costa Rica → se agrega 506. Devuelve '' si no es válido.
function telefonoWA(t) {
    const d = String(t || '').replace(/\D/g, '');
    if (d.length === 8) return '506' + d;
    return d.length >= 10 && d.length <= 15 ? d : '';
}
const telefonoTxt = t => t ? (t.startsWith('506') && t.length === 11 ? `${t.slice(3, 7)}-${t.slice(7)}` : '+' + t) : '';
// Enlace de WhatsApp con el mensaje del código de activación (el administrador solo tiene que pulsar «Enviar»)
function enlaceWhatsApp(a, clave) {
    const url = new URL('login.html', location.href).href;
    const msg = `Hola ${a.nombre.split(' ')[0]}, le saluda ADEP.\n\nSus datos para ingresar a ADEP Vota:\n• Cédula: ${a.cedula}\n• Código de activación: ${clave}\n\nIngrese aquí: ${url}\nEscriba su cédula, toque «Continuar», escriba este código y cree su propia clave de 6 números. El código sirve una sola vez. No lo comparta con nadie.`;
    return `https://wa.me/${a.telefono}?text=${encodeURIComponent(msg)}`;
}
function botonWhatsApp(a, clave) {
    return a.telefono
        ? `<a href="${esc(enlaceWhatsApp(a, clave))}" target="_blank" rel="noopener" data-wa="${esc(a.cedula)}" class="wa-btn"><i class="fa-brands fa-whatsapp"></i> Enviar por WhatsApp</a>`
        : '';
}
// Registrar en la bitácora cada envío por WhatsApp (sin la clave)
document.addEventListener('click', e => {
    const w = e.target.closest('[data-wa]'); if (!w) return;
    const a = DB.afiliados().find(x => x.cedula === w.dataset.wa);
    DB.log('Clave enviada por WhatsApp', a ? `${a.nombre} (${a.cedula})` : w.dataset.wa);
});

// Con miles de afiliados, dibujarlos todos congela la página: se muestran de a 50 (y solo si la pestaña está abierta)
const AF_PAGINA = 50;
let afMostrar = AF_PAGINA;
function renderAfiliados() {
    if ($('sec-afiliados').classList.contains('hidden')) return;
    const q = ($('af-buscar').value || '').toLowerCase().trim();
    const todos = DB.afiliados();
    // Filtro por filial o provincia: «f:Barva», «p:Heredia», «sin» (sin filial) o «vieja» (filial que ya no está en la lista)
    const ver = $('af-ver-filial').value;
    const enFiltro = a => !ver || (ver === 'sin' ? !a.provincia : ver === 'vieja' ? filialVieja(a.provincia)
        : ver.startsWith('p:') ? provinciaDe(a.provincia) === ver.slice(2) : a.provincia === ver.slice(2));
    const list = todos.filter(a => enFiltro(a) && (!q || a.nombre.toLowerCase().includes(q) || a.cedula.includes(q) || (a.provincia || '').toLowerCase().includes(q) || provinciaDe(a.provincia).toLowerCase().includes(q)));
    const viejas = todos.filter(a => filialVieja(a.provincia)).length;
    $('afiliados-list').innerHTML = `<p class="text-sm text-gray-500">${todos.length} representante(s) registrado(s)${q || ver ? ` · ${list.length} coincidencia(s)` : ''}</p>`
        + (viejas && ver !== 'vieja' ? `<p class="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3"><i class="fa-solid fa-circle-info mr-1"></i>${viejas} representante(s) tienen una filial que ya no está en la lista (de cuando se usaban provincias). Elija «Filial vieja (revisar)» arriba para verlos y asignarles su filial, o vuelva a importarlos con «Actualizar su nombre, filial y teléfono».</p>` : '')
        + (list.length ? list.slice(0, afMostrar).map(a => `
        <div class="bg-white rounded-2xl border-2 border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="min-w-0">
                <p class="font-bold text-base text-gray-900 truncate">${esc(a.nombre)}</p>
                <p class="text-sm text-gray-500 break-words">Cédula ${esc(a.cedula)} · ${a.activo === false ? 'Desactivado' : 'Activo'}${a.activado ? '' : ' · <span class="text-amber-700 font-semibold">Todavía no ha entrado</span>'}${a.pendiente && a.uid ? ' · <span class="text-amber-700 font-semibold">Esperando aprobación</span>' : ''}</p>
                ${a.uid && a.dispositivo ? `<p class="text-sm text-gray-600 mt-1"><i class="fa-solid fa-mobile-screen text-adep-green mr-1"></i>Entra desde: ${esc(a.dispositivo)}</p>` : ''}
                <p class="text-sm text-gray-600 flex items-center gap-2 flex-wrap mt-1"><span><i class="fa-solid fa-location-dot text-adep-green mr-1"></i>Filial:</span>
                    <select data-af-filial="${esc(a.cedula)}" aria-label="Filial de ${esc(a.nombre)}" class="border-2 border-gray-200 rounded-lg px-2 py-1 text-sm font-semibold bg-white">
                        <option value="">Sin filial</option>
                        ${opcionesFilial(a.provincia)}
                    </select>${filialVieja(a.provincia) ? '<span class="text-amber-700 font-semibold">Elija la filial nueva</span>' : ''}</p>
                <p class="text-sm text-gray-600 mt-1"><i class="fa-brands fa-whatsapp text-adep-green mr-1"></i>${a.telefono ? esc(telefonoTxt(a.telefono)) : '<span class="text-gray-500">Sin teléfono</span>'}</p>
            </div>
            <div class="flex flex-wrap gap-2 text-sm font-bold">
                <button data-af="tel" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-slate-100 text-gray-700"><i class="fa-solid fa-phone mr-1"></i>Teléfono</button>
                ${a.uid ? `<button data-af="liberar" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200" title="Saca la cédula del celular donde está, para que pueda entrar desde otro"><i class="fa-solid fa-unlock mr-1"></i>Liberar cédula</button>` : ''}
                <button data-af="reset" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-adep-greenLight text-adep-green border border-emerald-200">Código personal</button>
                <button data-af="toggle" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-slate-100 text-gray-700">${a.activo === false ? 'Activar' : 'Desactivar'}</button>
                <button data-af="del" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-adep-redLight text-adep-red border border-red-200">Eliminar</button>
            </div>
        </div>`).join('') + (list.length > afMostrar
            ? `<div class="text-center space-y-2 py-2"><p class="text-sm text-gray-500">Se muestran ${afMostrar} de ${list.length}. Para encontrar a alguien, use el buscador de arriba.</p>
                <button type="button" id="af-mas" class="px-4 py-3 rounded-xl bg-adep-greenLight text-adep-green border border-emerald-200 font-bold text-sm">Mostrar ${Math.min(AF_PAGINA, list.length - afMostrar)} más</button></div>` : '')
        : '<p class="text-base text-gray-500 text-center py-8">No hay representantes que mostrar.</p>');
}
let afEspera = null;
$('af-buscar').addEventListener('input', () => { clearTimeout(afEspera); afEspera = setTimeout(() => { afMostrar = AF_PAGINA; renderAfiliados(); }, 250); });
$('af-ver-filial').insertAdjacentHTML('beforeend', '<option value="sin">Sin filial</option><option value="vieja">Filial vieja (revisar)</option>'
    + PROVINCIAS.map(p => `<optgroup label="${esc(p)}"><option value="p:${esc(p)}">Toda la provincia de ${esc(p)}</option>${[...FILIALES_POR_PROVINCIA[p]].sort(porNombreFilial)
        .map(f => `<option value="f:${esc(f)}">${esc(f)}</option>`).join('')}</optgroup>`).join(''));
$('af-ver-filial').addEventListener('change', () => { afMostrar = AF_PAGINA; renderAfiliados(); });

function showCredentials(cedula, pin, filial) {
    const box = $('af-nueva');
    const a = DB.afiliados().find(x => x.cedula === cedula) || { cedula, nombre: '' };
    box.classList.remove('hidden');
    box.innerHTML = `<p class="font-bold text-amber-800 mb-1">Entregue estos datos al representante (la clave no se vuelve a mostrar):</p>
        <p>Cédula: <strong class="font-mono text-base">${esc(cedula)}</strong></p>
        ${filial ? `<p>Filial: <strong>${esc(filial)}</strong></p>` : ''}
        <p>Código de activación: <strong class="font-mono text-2xl tracking-widest">${esc(pin)}</strong></p>
        ${a.telefono ? `<div class="mt-3">${botonWhatsApp(a, pin)}<p class="text-amber-800 mt-2">Se abrirá WhatsApp con el mensaje listo para ${esc(telefonoTxt(a.telefono))}. Después de enviarlo, borre el mensaje de su chat.</p></div>`
            : '<p class="text-amber-800 mt-2"><i class="fa-brands fa-whatsapp mr-1"></i>Para enviarla por WhatsApp, agregue el teléfono del representante con el botón «Teléfono».</p>'}
        <p class="text-amber-800 mt-2"><i class="fa-solid fa-shield-halved mr-1"></i>La primera vez, el representante escribe su cédula, toca «Continuar», escribe este código y crea su propia clave. El código sirve una sola vez.</p>`;
}

if ($('af-filial')) $('af-filial').insertAdjacentHTML('beforeend', opcionesFilial(''));
$('form-afiliado').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = $('af-nombre').value.trim(), cedula = $('af-cedula').value.replace(/\D/g, ''), filial = $('af-filial').value;
    const telTxt = $('af-telefono').value.trim(), telefono = telefonoWA(telTxt);
    if (!nombre || cedula.length < 9) return showToast('Ingrese el nombre y la cédula (mínimo 9 números).');
    if (!filial) return showToast('Seleccione la filial del representante.');
    if (telTxt && !telefono) return showToast('El teléfono debe tener 8 números (o incluir el código de país).');
    const res = await DB.addAfiliado({ nombre, cedula, provincia: filial, telefono });
    if (res.error) return showToast(res.error);
    $('form-afiliado').reset();
    $('af-nueva').classList.add('hidden');
    showToast('Representante creado. Entra con su cédula y el código de ingreso.', 'success');
    renderAfiliados();
});

$('afiliados-list').addEventListener('change', e => {
    const s = e.target.closest('[data-af-filial]'); if (!s) return;
    if (DB.setFilial(s.dataset.afFilial, s.value)) showToast('Filial actualizada.', 'success');
});

$('afiliados-list').addEventListener('click', async e => {
    if (e.target.closest('#af-mas')) { afMostrar += AF_PAGINA; return renderAfiliados(); }
    const b = e.target.closest('[data-af]'); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.af === 'reset') { const pin = await DB.resetPass(id); if (pin) { const a = DB.afiliados().find(x => x.cedula === id); showCredentials(id, pin, a ? a.provincia : ''); } }
    if (b.dataset.af === 'liberar') {
        const a = DB.afiliados().find(x => x.cedula === id); if (!a) return;
        if (!confirm(`¿Liberar la cédula de ${a.nombre}? El celular donde está quedará fuera y podrá entrar de nuevo (por ejemplo, desde un celular nuevo) con el código de ingreso.`)) return;
        if (await DB.liberarCedula(id)) showToast('Cédula liberada.', 'success');
    }
    if (b.dataset.af === 'toggle') { const a = DB.afiliados().find(x => x.cedula === id); DB.setActivo(id, a.activo === false); }
    if (b.dataset.af === 'tel') {
        const a = DB.afiliados().find(x => x.cedula === id); if (!a) return;
        const nuevo = prompt(`Teléfono / WhatsApp de ${a.nombre} (8 números). Déjelo vacío para borrarlo:`, telefonoTxt(a.telefono));
        if (nuevo === null) return;
        const tel = telefonoWA(nuevo);
        if (nuevo.trim() && !tel) return showToast('El teléfono debe tener 8 números (o incluir el código de país).');
        DB.setTelefono(id, tel);
        showToast(tel ? 'Teléfono guardado.' : 'Teléfono borrado.', 'success');
    }
    if (b.dataset.af === 'del') {
        if (!confirm('¿Eliminar a este representante?')) return;
        DB.deleteAfiliado(id, user);
    }
    renderAfiliados();
});

// ===== Administrador: administradores =====
function renderAdmins() {
    $('admins-list').innerHTML = DB.admins().map(a => {
        const yo = a.cedula === user.cedula;
        return `
        <div class="bg-white rounded-2xl border-2 ${yo ? 'border-emerald-300' : 'border-gray-200'} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="min-w-0">
                <p class="font-bold text-base text-gray-900 truncate">${esc(a.nombre)} ${yo ? '<span class="text-xs bg-adep-greenLight text-adep-green px-2 py-0.5 rounded-full ml-1">Usted</span>' : ''}</p>
                <p class="text-sm text-gray-500 truncate">${esc(a.correo)} · ${a.activo === false ? 'Desactivado' : 'Activo'}</p>
            </div>
            <div class="flex flex-wrap gap-2 text-sm font-bold">
                <button data-ad="pass" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-adep-greenLight text-adep-green border border-emerald-200">${yo ? 'Cambiar mi contraseña' : 'Enviar correo de contraseña'}</button>
                ${yo ? '' : `
                <button data-ad="toggle" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-slate-100 text-gray-700">${a.activo === false ? 'Activar' : 'Desactivar'}</button>
                <button data-ad="del" data-id="${esc(a.cedula)}" class="px-3 py-2 rounded-xl bg-adep-redLight text-adep-red border border-red-200">Eliminar</button>`}
            </div>
        </div>`;
    }).join('');
}

$('ad-ver').addEventListener('click', () => {
    const p = $('ad-pass'), ver = p.type === 'password';
    p.type = ver ? 'text' : 'password';
    $('ad-ver').innerHTML = `<i class="fa-solid ${ver ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
});
function showAdminError(msg) { $('ad-error').textContent = msg; $('ad-error').classList.toggle('hidden', !msg); }

$('form-admin').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = $('ad-nombre').value.trim(), correo = $('ad-correo').value.trim(), pass = $('ad-pass').value;
    if (!nombre || !correo) return showAdminError('Complete nombre y correo.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return showAdminError('Escriba un correo válido.');
    const boton = e.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    const res = await DB.addAdmin({ nombre, correo, pass }).finally(() => { boton.disabled = false; });
    if (res.error) return showAdminError(res.error);
    showAdminError('');
    $('form-admin').reset();
    showToast(res.nueva ? `Administrador creado. Entra con ${res.correo} y la contraseña que escribió.`
        : `Ese correo ya tenía cuenta: ahora es administrador y entra con su contraseña de siempre.`, 'success');
    renderAdmins();
});

$('admins-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-ad]'); if (!b) return;
    const id = b.dataset.id;
    if (id === user.cedula && b.dataset.ad !== 'pass') return; // no actuar sobre sí mismo
    if (b.dataset.ad === 'pass') {
        if (id === user.cedula) {
            const nueva = prompt('Nueva contraseña (mínimo 8 caracteres):');
            if (nueva === null) return;
            if (nueva.length < 8) return showToast('La contraseña debe tener al menos 8 caracteres.');
            const r = await DB.setPass(id, nueva);
            if (r.error) return showToast(r.error);
            showToast('Contraseña actualizada.', 'success');
        } else {
            const a = DB.admins().find(x => x.cedula === id);
            if (!confirm(`Se enviará un correo a ${a ? a.correo : 'este administrador'} con un enlace para crear una contraseña nueva. ¿Continuar?`)) return;
            const r = await DB.setPass(id);
            if (r.error) return showToast(r.error);
            showToast(`Correo enviado a ${r.correo}.`, 'success');
        }
    }
    if (b.dataset.ad === 'toggle') { const a = DB.admins().find(x => x.cedula === id); DB.setActivo(id, a.activo === false); }
    if (b.dataset.ad === 'del') {
        if (!confirm('¿Eliminar a este administrador?')) return;
        DB.deleteAdmin(id, user);
    }
    renderAdmins();
});

// ===== Administrador: bitácora de auditoría =====
function renderAudit() {
    const l = DB.auditoria().slice(0, 150);
    $('audit-list').innerHTML = l.length ? `<div class="bg-white rounded-2xl border-2 border-gray-200 divide-y divide-gray-100">${l.map(a => `
        <div class="p-3 sm:p-4">
            <div class="flex justify-between gap-2 flex-wrap"><strong class="text-sm sm:text-base text-gray-900">${esc(a.accion)}</strong><span class="text-sm text-gray-500">${fmt(a.fecha)}</span></div>
            ${a.detalle ? `<p class="text-sm text-gray-600">${esc(a.detalle)}</p>` : ''}
            <p class="text-xs text-gray-400">Por: ${esc(a.por)}</p>
        </div>`).join('')}</div>` : '<p class="text-base text-gray-500 text-center py-8">Aún no hay actividad registrada.</p>';
}

// ===== Bienvenida con el nombre del usuario =====
function saludo() {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
function renderBienvenida() {
    let b = $('bienvenida');
    if (!b) {
        b = document.createElement('div');
        b.id = 'bienvenida';
        document.querySelector('main').before(b);
    }
    // Primera palabra del nombre con mayúscula inicial («QUIROS» → «Quiros»)
    const pal = user.nombre.trim().split(/\s+/)[0] || '';
    const nombre = esc(pal.charAt(0).toLocaleUpperCase('es') + pal.slice(1).toLocaleLowerCase('es'));
    const f = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
    const hoy = f.charAt(0).toUpperCase() + f.slice(1);
    let detalle, accion = '';
    if (isAdmin) {
        const abiertas = DB.polls().filter(p => DB.estado(p) === 'abierta').length;
        detalle = `Panel de administración · ${abiertas} ${abiertas === 1 ? 'votación abierta' : 'votaciones abiertas'}`;
    } else {
        const pend = DB.polls().filter(p => p.publicada && DB.estado(p) === 'abierta' && !DB.hasVoted(p.id, user.cedula)).length;
        detalle = pend ? `Tiene ${pend} ${pend === 1 ? 'votación pendiente' : 'votaciones pendientes'}.` : 'No tiene votaciones pendientes por ahora.';
        if (pend) accion = `<button type="button" onclick="switchTab('votacion')" class="bv-btn"><i class="fa-solid fa-check-to-slot"></i> Ir a votar</button>`;
    }
    b.innerHTML = `<div class="bv-txt">
            <p class="bv-fecha">${esc(hoy)}</p>
            <h2 class="bv-hola">${saludo()}, ${nombre}</h2>
            <p class="bv-det">Bienvenido(a) a ADEP Vota. ${detalle}</p>
        </div>${accion}`;
}

// ===== Modales =====
function closeModal() { $('modal-success').classList.add('hidden'); }
function closeModalAndGoReceipts() { closeModal(); switchTab('comprobantes'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeConfirm(); closeModal(); closeDelPoll(); closeRestore(); } });

function renderAll() {
    renderBienvenida();
    renderPolls(); renderReceipts(); renderResults();
    if (isAdmin) { renderManage(); renderAfiliados(); renderAdmins(); renderAudit(); }
}

// ===== Inicio =====
if (user) {
    const partes = user.nombre.trim().split(/\s+/);
    $('user-name').innerText = partes.slice(0, 2).join(' ');
    $('user-name').title = user.nombre;
    $('user-avatar').innerText = (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
    // El rol interno sigue siendo «Afiliado»; en pantalla se muestra «Representante»
    const rolTxt = isAdmin ? user.rol : 'Representante';
    $('user-role').innerText = (!isAdmin && user.provincia) ? `${rolTxt} · ${user.provincia}` : rolTxt;
    document.querySelectorAll('[data-rol]').forEach(t => { if (t.dataset.rol !== user.rol) t.remove(); });
    switchTab('votacion');
    // Temporizador: se actualiza cada segundo (sin redibujar las tarjetas)
    setInterval(tickTimers, 1000);
    // Cierre/apertura automática: se refresca el estado cada 30 s
    setInterval(() => { renderPolls(); renderResults(); if (isAdmin) renderManage(); }, 30000);
}