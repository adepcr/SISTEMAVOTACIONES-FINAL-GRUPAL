/* instalar.js · ADEP Vota · INSTALAR LA PÁGINA COMO APP (sin descargar archivos)
   En Android (Chrome, Edge, Samsung Internet) muestra un botón grande: un toque y el ícono de ADEP Vota
   queda en la pantalla de inicio, sin descargar el APK ni dar permisos de «origen desconocido».
   En iPhone explica cómo agregarla desde «Compartir».
   - En la pantalla de ingreso aparece en la caja #lg-app.
   - Dentro del sistema aparece como un aviso que se puede cerrar.
   No aparece si ya se abrió como app instalada o dentro de la app de Android (Capacitor). */
(function () {
    "use strict";
    const nativa = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
    const instalada = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    if (nativa || instalada()) {
        document.addEventListener("DOMContentLoaded", () => { const c = document.getElementById("lg-app"); if (c) c.remove(); });
        return;
    }
    const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/i.test(ua), android = /Android/i.test(ua);
    const CERRADO = "adep_instalar_cerrado";
    let aviso = null;   // evento de Chrome para pedir la instalación

    const css = `
  .ins-btn{display:flex;align-items:center;justify-content:center;gap:.7rem;width:100%;min-height:60px;border:0;border-radius:1rem;
    background:#008744;color:#fff;font-weight:900;font-size:1.15rem;box-shadow:0 10px 22px -10px rgba(0,107,53,.8);cursor:pointer}
  .ins-btn i{font-size:1.5rem}
  .ins-sub{font-size:.95rem;color:#4a5a53;font-weight:600;line-height:1.4}
  .ins-pasos{background:#fff8e1;border:2px solid #f2d27a;border-radius:1rem;padding:.75rem 1rem;color:#5c4400;font-weight:700;line-height:1.5;text-align:left}
  .ins-ok{background:#e8f5ee;border:2px solid #a7dcbf;border-radius:1rem;padding:.75rem 1rem;color:#04492a;font-weight:800}
  #ins-banner{display:flex;flex-direction:column;gap:.6rem;background:#fff;border:2px solid #008744;border-radius:1.25rem;padding:1rem;margin:0 auto 1rem;max-width:72rem;position:relative}
  #ins-banner .x{position:absolute;top:.4rem;right:.4rem;width:40px;height:40px;border:0;border-radius:.7rem;background:#e8f5ee;color:#006b35;font-size:1.1rem}
  #ins-banner h3{font-weight:900;color:#04492a;font-size:1.1rem;padding-right:2.5rem}`;

    function contenido() {
        if (aviso) return `<button type="button" class="ins-btn" data-ins="instalar"><i class="fa-solid fa-mobile-screen-button"></i> Instalar la app en este celular</button>
            <p class="ins-sub">Un solo toque. Después la encuentra en su pantalla de inicio con el logo de ADEP.</p>`;
        if (ios) return `<p class="ins-pasos"><i class="fa-brands fa-apple mr-1"></i> Para tenerla como app: toque <strong>Compartir</strong> <i class="fa-solid fa-arrow-up-from-bracket"></i> (abajo) y luego <strong>«Agregar a pantalla de inicio»</strong>.</p>`;
        if (android) return `<p class="ins-pasos"><i class="fa-solid fa-mobile-screen-button mr-1"></i> Para tenerla como app: toque los <strong>3 puntitos ⋮</strong> (arriba a la derecha) y elija <strong>«Instalar aplicación»</strong> o <strong>«Agregar a pantalla de inicio»</strong>.</p>`;
        return "";
    }

    function pintar() {
        const html = contenido();
        // Pantalla de ingreso
        const zona = document.getElementById("lg-instalar");
        if (zona) { zona.innerHTML = html; zona.classList.toggle("hidden", !html); }
        // Dentro del sistema: aviso que se puede cerrar
        const main = document.querySelector("main");
        if (!zona && main && html && (aviso || android || ios)) {
            let cerrado = false; try { cerrado = localStorage.getItem(CERRADO) === "1"; } catch { }
            if (cerrado) return;
            let b = document.getElementById("ins-banner");
            if (!b) { b = document.createElement("div"); b.id = "ins-banner"; main.before(b); }
            b.innerHTML = `<button type="button" class="x" data-ins="cerrar" aria-label="Cerrar aviso">✕</button>
                <h3><i class="fa-solid fa-mobile-screen-button mr-1"></i> Tenga ADEP Vota como app en su celular</h3>${html}`;
        }
    }

    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); aviso = e; pintar(); });
    window.addEventListener("appinstalled", () => {
        aviso = null;
        const ok = '<p class="ins-ok"><i class="fa-solid fa-circle-check mr-1"></i> ¡Listo! Busque el ícono <strong>ADEP Vota</strong> en su pantalla de inicio.</p>';
        const zona = document.getElementById("lg-instalar"), b = document.getElementById("ins-banner");
        if (zona) zona.innerHTML = ok;
        if (b) b.innerHTML = ok;
    });
    document.addEventListener("click", async e => {
        const t = e.target.closest("[data-ins]"); if (!t) return;
        if (t.dataset.ins === "cerrar") {
            try { localStorage.setItem(CERRADO, "1"); } catch { }
            const b = document.getElementById("ins-banner"); if (b) b.remove();
            return;
        }
        if (t.dataset.ins === "instalar" && aviso) {
            const ev = aviso; aviso = null;
            ev.prompt();
            const r = await ev.userChoice.catch(() => null);
            if (!r || r.outcome !== "accepted") { aviso = null; pintar(); }   // dijo que no: quedan las instrucciones
        }
    });

    const css2 = document.createElement("style"); css2.textContent = css;
    document.head.appendChild(css2);
    // Si el navegador no ofrece la instalación de una vez, se muestran las instrucciones
    document.addEventListener("DOMContentLoaded", () => setTimeout(pintar, aviso ? 0 : 2500));
})();
