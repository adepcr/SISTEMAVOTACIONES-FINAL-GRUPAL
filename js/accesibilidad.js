/* accesibilidad.js - se usa en login.html e index.html */
const A11Y = {
    load() {
        try { return JSON.parse(localStorage.getItem('adep_a11y')) || { fs: 0, hc: false }; }
        catch { return { fs: 0, hc: false }; }
    },
    save(s) { try { localStorage.setItem('adep_a11y', JSON.stringify(s)); } catch { } },
    apply(s) {
        const h = document.documentElement;
        h.classList.remove('fs-1', 'fs-2');
        if (s.fs > 0) h.classList.add('fs-' + s.fs);
        h.classList.toggle('hc', !!s.hc);
    }
};

// Se aplica de inmediato (antes de pintar) para evitar parpadeos
A11Y.apply(A11Y.load());

// ---- Lectura en voz alta (nativa del navegador, sin librerías) ----
function leer(texto) {
    if (!('speechSynthesis' in window)) return false;
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return true; } // segundo clic = detener
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-MX';
    u.rate = 0.9;
    speechSynthesis.speak(u);
    return true;
}

// ---- Barra flotante ----
document.addEventListener('DOMContentLoaded', () => {
    const s = A11Y.load();
    const bar = document.createElement('div');
    bar.id = 'a11y-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Opciones de accesibilidad');
    bar.innerHTML = `
        <button type="button" id="a11y-menos" aria-label="Disminuir tamaño de letra">A−</button>
        <button type="button" id="a11y-mas" aria-label="Aumentar tamaño de letra">A+</button>
        <button type="button" id="a11y-hc" aria-label="Activar alto contraste" aria-pressed="${!!s.hc}">
            <i class="fa-solid fa-circle-half-stroke"></i> Contraste
        </button>`;
    document.body.appendChild(bar);

    const cambiar = fn => { const n = A11Y.load(); fn(n); A11Y.save(n); A11Y.apply(n); };
    document.getElementById('a11y-menos').onclick = () => cambiar(n => n.fs = Math.max(0, n.fs - 1));
    document.getElementById('a11y-mas').onclick = () => cambiar(n => n.fs = Math.min(2, n.fs + 1));
    document.getElementById('a11y-hc').onclick = e => {
        cambiar(n => n.hc = !n.hc);
        e.currentTarget.setAttribute('aria-pressed', String(A11Y.load().hc));
    };
});