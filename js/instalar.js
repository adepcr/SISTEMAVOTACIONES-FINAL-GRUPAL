/* instalar.js · ADEP Vota · INSTALAR LA PÁGINA COMO APP (sin descargar archivos)
   En Android (Chrome, Edge, Samsung Internet) muestra un botón grande: un toque y el ícono de ADEP Vota
   queda en la pantalla de inicio, sin descargar el APK ni dar permisos de «origen desconocido».
   En iPhone explica cómo agregarla desde «Compartir».
   - En la pantalla de ingreso aparece en la caja #lg-app.
   - Dentro del sistema aparece como un botón pequeño y centrado, solo al final de «Resumen» (administrador)
     o de «Votaciones» (afiliado), y se puede cerrar.
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
    let intentos = 0;   // espera a que exista la sección donde va el botón

    const css = `
  .ins-btn{display:flex;align-items:center;justify-content:center;gap:.7rem;width:100%;min-height:60px;border:0;border-radius:1rem;
    background:#008744;color:#fff;font-weight:900;font-size:1.15rem;box-shadow:0 10px 22px -10px rgba(0,107,53,.8);cursor:pointer}
  .ins-btn i{font-size:1.5rem}
  .ins-sub{font-size:.95rem;color:#4a5a53;font-weight:600;line-height:1.4}
  .ins-pasos{background:#fff8e1;border:2px solid #f2d27a;border-radius:1rem;padding:.75rem 1rem;color:#5c4400;font-weight:700;line-height:1.5;text-align:left}
  .ins-ok{background:#e8f5ee;border:2px solid #a7dcbf;border-radius:1rem;padding:.75rem 1rem;color:#04492a;font-weight:800}
  #ins-banner{display:flex;flex-direction:column;align-items:center;gap:.5rem;margin:1.5rem auto 1rem;padding:0 1rem;max-width:30rem;text-align:center}
  #ins-banner .fila{display:flex;align-items:center;justify-content:center;gap:.4rem;flex-wrap:wrap}
  .ins-mini{display:inline-flex;align-items:center;gap:.55rem;min-height:54px;padding:.6rem 1.5rem;border-radius:999px;background:#e8f5ee;border:2px solid #a7dcbf;color:#006b35;font-weight:800;font-size:1.1rem;cursor:pointer}
  .ins-mini i{font-size:1.3rem}
  .ins-mini:hover{background:#d6efe1}
  #ins-banner .x{width:36px;height:36px;border:0;border-radius:999px;background:transparent;color:#6b7c73;font-size:1rem}
  #ins-banner .ins-pasos,#ins-banner .ins-ok{font-size:.95rem}`;

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
        // Dentro del sistema: botón pequeño y centrado al final de una sola sección, para no estorbar.
        // «Resumen» la crea extras.js cuando termina de cargar: si todavía no existe, se reintenta.
        if (!zona && document.querySelector("main") && html) {
            let cerrado = false; try { cerrado = localStorage.getItem(CERRADO) === "1"; } catch { }
            if (cerrado) return;
            const sec = document.getElementById("sec-resumen")
                || (typeof user !== "undefined" && user && user.rol !== "Administrador" ? document.getElementById("sec-votacion") : null);
            if (!sec) { if ((intentos = (intentos || 0) + 1) < 20) setTimeout(pintar, 1000); return; }
            let b = document.getElementById("ins-banner");
            if (!b || b.parentElement !== sec) { if (b) b.remove(); b = document.createElement("div"); b.id = "ins-banner"; sec.append(b); }
            const cerrar = '<button type="button" class="x" data-ins="cerrar" aria-label="No mostrar más" title="No mostrar más">✕</button>';
            b.innerHTML = aviso
                ? `<div class="fila"><button type="button" class="ins-mini" data-ins="instalar"><i class="fa-solid fa-mobile-screen-button"></i> Instalar la app</button>${cerrar}</div>`
                : `<div class="fila"><button type="button" class="ins-mini" data-ins="pasos" aria-expanded="false"><i class="fa-solid fa-mobile-screen-button"></i> ¿Cómo instalar la app?</button>${cerrar}</div>
                   <div class="hidden" data-ins-pasos>${html}</div>`;
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
        if (t.dataset.ins === "pasos") {
            const p = document.querySelector("[data-ins-pasos]"); if (!p) return;
            const ver = p.classList.toggle("hidden") === false;
            t.setAttribute("aria-expanded", String(ver));
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
