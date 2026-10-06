// Almacenamiento local de estado de votos y selecciones
const selectedVotes = {}; // { 1: { optionText: "", value: "" } }
const completedVotes = new Set();
const userReceipts = [];
let totalPollsCount = 3;

// Cambiar entre Pestañas de la App
function switchTab(tabName) {
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`sec-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// Selección visual e interactiva de opción
function selectOption(pollNum, optionText, cardElem) {
    if (completedVotes.has(pollNum)) return; // Ya votado

    // Limpiar selección previa en el grupo
    const parent = document.getElementById(`options-group-${pollNum}`);
    if (parent) {
        parent.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
    }

    // Marcar actual
    cardElem.classList.add('selected');
    const radio = cardElem.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;

    // Guardar en objeto temporal
    selectedVotes[pollNum] = {
        text: optionText,
        val: radio ? radio.value : optionText
    };

    // Ocultar alerta de error de pregunta si estaba activa
    const errSpan = document.getElementById(`err-poll-${pollNum}`);
    if (errSpan) errSpan.classList.add('hidden');
}

// Limpiar estilos de error en inputs
function clearError(inputId) {
    const input = document.getElementById(inputId);
    const errSpan = document.getElementById(`err-${inputId}`);
    if (input) input.classList.remove('field-error');
    if (errSpan) errSpan.classList.add('hidden');
}

// Mostrar Toast de Notificación
function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const isError = type === 'error';
    toast.className = `p-3.5 rounded-2xl shadow-lg border text-xs sm:text-sm font-bold flex items-center gap-3 transition-all duration-300 transform translate-y-2 pointer-events-auto ${
        isError 
        ? 'bg-adep-red text-white border-red-700' 
        : 'bg-adep-green text-white border-emerald-700'
    }`;

    toast.innerHTML = `
        <i class="fa-solid ${isError ? 'fa-circle-xmark text-lg' : 'fa-circle-check text-lg'}"></i>
        <span class="flex-1">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Confirmar identidad del votante
function confirmVoter() {
    const voterId = document.getElementById('voter-id');
    const voterName = document.getElementById('voter-name');
    const voterFilial = document.getElementById('voter-filial');
    let hasErrors = false;

    if (!voterId.value.trim()) {
        voterId.classList.add('field-error');
        document.getElementById('err-voter-id').classList.remove('hidden');
        hasErrors = true;
    }
    if (!voterName.value.trim()) {
        voterName.classList.add('field-error');
        document.getElementById('err-voter-name').classList.remove('hidden');
        hasErrors = true;
    }
    if (!voterFilial.value) {
        voterFilial.classList.add('field-error');
        document.getElementById('err-voter-filial').classList.remove('hidden');
        hasErrors = true;
    }

    if (hasErrors) {
        showToast('Complete Cédula, Nombre y Filial para confirmar su identidad.', 'error');
        return;
    }

    // Mostrar el nombre completo en el encabezado (reemplaza "Afiliado No Verificado")
    const statusLabel = document.getElementById('voter-status-label');
    if (statusLabel) {
        statusLabel.innerHTML = `<span class="text-adep-green font-extrabold"><i class="fa-solid fa-user-check mr-1"></i>${voterName.value.trim()}</span>`;
    }

    // Cambiar el botón a estado confirmado
    const btn = document.getElementById('btn-confirm-voter');
    if (btn) {
        btn.className = 'w-full sm:w-auto bg-emerald-100 text-adep-green font-bold py-2.5 px-5 rounded-xl border border-emerald-300 text-xs sm:text-sm flex items-center justify-center gap-2';
        btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Identidad Confirmada';
    }

    showToast('Identidad confirmada correctamente.', 'success');
}

// VALIDACIÓN Y PROCESAMIENTO DE VOTO
function processVote(pollNum) {
    let hasErrors = false;

    // 1. Validar Datos del Votante
    const voterId = document.getElementById('voter-id');
    const voterName = document.getElementById('voter-name');
    const voterFilial = document.getElementById('voter-filial');

    if (!voterId.value.trim()) {
        voterId.classList.add('field-error');
        document.getElementById('err-voter-id').classList.remove('hidden');
        hasErrors = true;
    }
    if (!voterName.value.trim()) {
        voterName.classList.add('field-error');
        document.getElementById('err-voter-name').classList.remove('hidden');
        hasErrors = true;
    }
    if (!voterFilial.value) {
        voterFilial.classList.add('field-error');
        document.getElementById('err-voter-filial').classList.remove('hidden');
        hasErrors = true;
    }

    if (hasErrors) {
        const voterCard = document.getElementById('card-voter-info');
        voterCard.classList.add('animate-shake', 'border-adep-red');
        setTimeout(() => voterCard.classList.remove('animate-shake'), 400);
        
        showToast('Debe completar sus datos de afiliado (Cédula, Nombre y Filial) antes de enviar su voto.', 'error');
        voterCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    // 2. Validar Selección de Respuesta para la pregunta específica
    if (!selectedVotes[pollNum] || !selectedVotes[pollNum].text) {
        const pollCard = document.getElementById(`poll-card-${pollNum}`);
        const errSpan = document.getElementById(`err-poll-${pollNum}`);
        
        if (errSpan) errSpan.classList.remove('hidden');
        if (pollCard) {
            pollCard.classList.add('animate-shake', 'border-adep-red');
            setTimeout(() => pollCard.classList.remove('animate-shake'), 400);
            pollCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        showToast(`Por favor seleccione una respuesta para la Consulta #${pollNum} antes de hacer clic en enviar.`, 'error');
        return;
    }

    // TODO CORRECTO -> REGISTRAR VOTO
    completedVotes.add(pollNum);
    const voteData = selectedVotes[pollNum];
    const timestamp = new Date().toLocaleString('es-CR');
    const hashCode = 'ADEP-2027-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

    // Actualizar etiqueta del header manteniendo el nombre completo
    const statusLabel = document.getElementById('voter-status-label');
    if (statusLabel) {
        statusLabel.innerHTML = `<span class="text-adep-green font-extrabold"><i class="fa-solid fa-user-check mr-1"></i>${voterName.value.trim()}</span>`;
    }

    // Marcar pregunta visualmente como COMPLETADA
    const card = document.getElementById(`poll-card-${pollNum}`);
    if (card) {
        card.classList.remove('border-gray-200');
        card.classList.add('border-emerald-500', 'bg-emerald-50/20');
        
        const btn = document.getElementById(`btn-vote-${pollNum}`);
        if (btn) {
            btn.disabled = true;
            btn.className = 'w-full sm:w-auto bg-emerald-100 text-adep-green font-bold py-2.5 px-5 rounded-xl cursor-not-allowed border border-emerald-300 text-xs sm:text-sm';
            btn.innerHTML = '<i class="fa-solid fa-circle-check text-adep-green mr-1"></i> Voto Enviado y Guardado';
        }

        const tag = document.getElementById(`status-tag-${pollNum}`);
        if (tag) {
            tag.className = 'text-[11px] bg-emerald-600 text-white font-extrabold px-2.5 py-0.5 rounded-full';
            tag.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Completada';
        }
    }

    // Actualizar contador del badge
    const pendBadge = document.getElementById('badge-pendientes');
    const pends = Math.max(0, totalPollsCount - completedVotes.size);
    pendBadge.innerText = pends;

    // Guardar Comprobante
    const receipt = {
        num: pollNum,
        voter: voterName.value,
        id: voterId.value,
        filial: voterFilial.value,
        option: voteData.text,
        date: timestamp,
        hash: hashCode
    };
    userReceipts.push(receipt);
    renderReceipts();

    // Abrir Modal de Éxito
    document.getElementById('m-voter-name').innerText = voterName.value;
    document.getElementById('m-poll-num').innerText = `#${pollNum}`;
    document.getElementById('m-option-val').innerText = voteData.text;
    document.getElementById('m-timestamp').innerText = timestamp;
    document.getElementById('m-hash-code').innerText = hashCode;
    
    document.getElementById('modal-success').classList.remove('hidden');

    showToast('¡Voto emitido con éxito! Se ha generado su comprobante.', 'success');
}

// Renderizar Lista de Comprobantes
function renderReceipts() {
    const container = document.getElementById('receipts-container');
    const empty = document.getElementById('receipts-empty');
    const badge = document.getElementById('badge-comprobantes');

    badge.innerText = userReceipts.length;

    if (userReceipts.length > 0 && empty) {
        empty.style.display = 'none';
    }

    // Limpiar ítems previos (salvo empty div)
    container.querySelectorAll('.receipt-card').forEach(el => el.remove());

    userReceipts.forEach(r => {
        const item = document.createElement('div');
        item.className = 'receipt-card bg-white p-4 rounded-2xl border-2 border-emerald-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3';
        item.innerHTML = `
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-extrabold text-adep-green bg-adep-greenLight px-2 py-0.5 rounded">Consulta #${r.num}</span>
                    <span class="text-xs text-gray-500 font-medium"><i class="fa-regular fa-clock mr-1"></i>${r.date}</span>
                </div>
                <h4 class="font-bold text-gray-900 text-xs sm:text-sm">Selección: ${r.option}</h4>
                <p class="text-[11px] text-gray-500">Afiliado: <strong>${r.voter}</strong> (${r.filial})</p>
            </div>
            <div class="text-left sm:text-right w-full sm:w-auto border-t sm:border-0 pt-2 sm:pt-0 border-gray-100">
                <span class="block text-[10px] font-bold text-gray-400 uppercase">Código Hash</span>
                <span class="font-mono text-xs font-black text-adep-red bg-adep-redLight px-2.5 py-1 rounded-lg border border-red-200 inline-block mt-0.5">
                    ${r.hash}
                </span>
            </div>
        `;
        container.prepend(item);
    });
}

function closeModal() {
    document.getElementById('modal-success').classList.add('hidden');
}

function closeModalAndGoReceipts() {
    closeModal();
    switchTab('comprobantes');
}

// Crear nueva consulta (Admin)
function createNewPoll(e) {
    e.preventDefault();
    
    const title = document.getElementById('new-poll-title');
    const cat = document.getElementById('new-poll-cat');
    const options = document.getElementById('new-poll-options');

    let errors = false;

    if (!title.value.trim()) {
        title.classList.add('field-error');
        document.getElementById('err-new-poll-title').classList.remove('hidden');
        errors = true;
    }
    if (!cat.value.trim()) {
        cat.classList.add('field-error');
        document.getElementById('err-new-poll-cat').classList.remove('hidden');
        errors = true;
    }

    const optionsList = options.value.split('\n').filter(o => o.trim() !== '');
    if (optionsList.length < 2) {
        options.classList.add('field-error');
        document.getElementById('err-new-poll-options').classList.remove('hidden');
        errors = true;
    }

    if (errors) {
        showToast('Rellene todos los campos requeridos para publicar la encuesta.', 'error');
        return;
    }

    totalPollsCount++;
    const num = totalPollsCount;

    const optionsHTML = optionsList.map(opt => `
        <div onclick="selectOption(${num}, '${opt}', this)" class="option-card rounded-xl p-3 flex items-center gap-3 cursor-pointer">
            <input type="radio" name="p${num}" value="${opt}" class="w-5 h-5 accent-adep-green pointer-events-none">
            <span class="text-xs sm:text-sm font-semibold text-gray-800">${opt}</span>
        </div>
    `).join('');

    const newCard = document.createElement('div');
    newCard.id = `poll-card-${num}`;
    newCard.className = 'poll-item bg-white rounded-2xl shadow-sm border-2 border-gray-200 overflow-hidden transition-all duration-300';
    newCard.innerHTML = `
        <div class="bg-gradient-to-r from-adep-green to-emerald-800 p-3.5 text-white flex justify-between items-center">
            <div class="flex items-center gap-2">
                <span class="bg-white/20 text-white font-bold text-[10px] px-2 py-0.5 rounded uppercase">Consulta #${num}</span>
                <span class="text-xs text-emerald-100 font-semibold">• ${cat.value}</span>
            </div>
            <span id="status-tag-${num}" class="text-[11px] bg-emerald-900/60 text-emerald-200 font-bold px-2.5 py-0.5 rounded-full">
                <i class="fa-regular fa-clock mr-1"></i> Pendiente
            </span>
        </div>
        <div class="p-4 sm:p-5 space-y-4">
            <h3 class="text-sm sm:text-base font-bold text-gray-900 leading-snug">${title.value}</h3>
            <div class="space-y-2" id="options-group-${num}">
                ${optionsHTML}
            </div>
            <span id="err-poll-${num}" class="text-xs font-bold text-adep-red hidden block bg-adep-redLight p-2 rounded-lg border border-red-200">
                <i class="fa-solid fa-triangle-exclamation mr-1"></i> Debe seleccionar una opción.
            </span>
            <div class="pt-3 border-t border-gray-100 flex justify-end">
                <button onclick="processVote(${num})" id="btn-vote-${num}" class="w-full sm:w-auto bg-adep-green hover:bg-adep-greenDark text-white font-bold py-2.5 px-5 rounded-xl transition text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm">
                    <i class="fa-solid fa-paper-plane"></i> Confirmar y Enviar Voto
                </button>
            </div>
        </div>
    `;

    document.querySelector('#sec-votacion .space-y-5').appendChild(newCard);

    document.getElementById('form-new-poll').reset();
    document.getElementById('badge-pendientes').innerText = parseInt(document.getElementById('badge-pendientes').innerText || 0) + 1;

    showToast('Nueva consulta creada y agregada a la lista de votaciones.', 'success');
    switchTab('votacion');
}

function refreshResultsAnimation() {
    document.querySelectorAll('.bar-fill').forEach(bar => {
        const w = bar.style.width;
        bar.style.width = '0%';
        setTimeout(() => bar.style.width = w, 150);
    });
}