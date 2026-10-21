/* temporadas.js · ADEP Vota · decoración para fechas especiales (se usa en login.html e index.html)
   - Navidad (1 al 30 de diciembre): luces de colores y copos de nieve
   - Año Nuevo (31 de diciembre al 6 de enero): confeti dorado
   - Independencia (1 al 15 de setiembre): franja con los colores de la bandera y confeti azul, blanco y rojo
   - Día de la Madre (15 de agosto): corazones
   Solo adorna: no cambia nada del sistema. Para agregar otra fecha basta con sumarla a TEMPORADAS.
   Para probarla cualquier día: abrir la página con ?temporada=navidad (o anionuevo, independencia, madre).
   Para quitarlo: borrar la línea <script src="js/temporadas.js"></script> de index.html y login.html */
(function () {
    "use strict";

    // desde / hasta: [mes, día] (enero = 1). Si «desde» es mayor que «hasta», el rango cruza el fin de año.
    const TEMPORADAS = [
        {
            id: "navidad", desde: [12, 1], hasta: [12, 30],
            icono: "fa-tree", titulo: "¡Feliz Navidad!", texto: "ADEP les desea paz, salud y alegría en estas fiestas.",
            fondo: "linear-gradient(90deg,#04492a,#008744,#04492a)", luces: true,
            caen: ["❄", "❅", "❆"], colores: ["#ffffff", "#dbeafe", "#bfdbfe"]
        },
        {
            id: "anionuevo", desde: [12, 31], hasta: [1, 6],
            icono: "fa-champagne-glasses", titulo: "¡Feliz Año Nuevo!", texto: "Que este año venga lleno de bendiciones para toda la familia ADEP.",
            fondo: "linear-gradient(90deg,#1f2937,#04492a,#1f2937)",
            confeti: ["#d4af37", "#f5d76e", "#008744", "#e52521", "#ffffff"]
        },
        {
            id: "independencia", desde: [9, 1], hasta: [9, 15],
            icono: "fa-flag", titulo: "¡Feliz Día de la Independencia!", texto: "15 de setiembre · ¡Viva Costa Rica!",
            fondo: "linear-gradient(90deg,#002b7f,#1e40af,#002b7f)", bandera: true,
            confeti: ["#002b7f", "#ffffff", "#ce1126"]
        },
        {
            id: "madre", desde: [8, 15], hasta: [8, 15],
            icono: "fa-heart", titulo: "¡Feliz Día de la Madre!", texto: "Un abrazo a todas las madres de la familia ADEP.",
            fondo: "linear-gradient(90deg,#9d174d,#db2777,#9d174d)",
            caen: ["♥", "❤"], colores: ["#f9a8d4", "#ec4899", "#fbcfe8"]
        }
    ];

    const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { } };
    const leerLS = k => { try { return localStorage.getItem(k); } catch { return null; } };

    function temporadaDe(f) {
        let prueba = null;
        try { prueba = new URLSearchParams(location.search).get("temporada"); } catch { }
        if (prueba) return TEMPORADAS.find(t => t.id === prueba) || null;
        const hoy = (f.getMonth() + 1) * 100 + f.getDate();
        return TEMPORADAS.find(t => {
            const a = t.desde[0] * 100 + t.desde[1], b = t.hasta[0] * 100 + t.hasta[1];
            return a <= b ? hoy >= a && hoy <= b : hoy >= a || hoy <= b;
        }) || null;
    }

    const ahora = new Date(), t = temporadaDe(ahora);
    if (!t) return;
    // El año de la temporada (Año Nuevo en enero cuenta como la del diciembre anterior)
    const clave = "adep_temporada_" + t.id + "_" + (ahora.getMonth() === 0 ? ahora.getFullYear() - 1 : ahora.getFullYear());

    const st = document.createElement("style");
    st.textContent = `
  .tp-banda{position:relative;z-index:45;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;gap:.6rem;padding:.6rem 3rem .6rem 1rem;text-align:center;line-height:1.25;box-shadow:0 4px 14px -6px rgba(0,0,0,.35)}
  .tp-banda i.tp-ic{font-size:1.25rem;color:#facc15;flex-shrink:0}
  .tp-banda small{display:block;font-weight:600;opacity:.92;font-size:.85em}
  .tp-banda .tp-x{position:absolute;right:.4rem;top:50%;transform:translateY(-50%);width:2.5rem;height:2.5rem;border-radius:999px;background:rgba(255,255,255,.15);color:#fff;font-size:1.1rem}
  .tp-banda .tp-x:hover,.tp-banda .tp-x:focus-visible{background:rgba(255,255,255,.3)}
  .tp-bandera{height:12px;background:linear-gradient(#002b7f 0 16.66%,#fff 16.66% 33.33%,#ce1126 33.33% 66.66%,#fff 66.66% 83.33%,#002b7f 83.33%)}
  .tp-luces{height:16px;background:#04492a;position:relative;overflow:hidden}
  .tp-luces::before{content:"";position:absolute;inset:0;background:
      radial-gradient(circle at 12px 9px,#ef4444 4px,transparent 5px) 0 0/96px 16px repeat-x,
      radial-gradient(circle at 36px 9px,#facc15 4px,transparent 5px) 0 0/96px 16px repeat-x,
      radial-gradient(circle at 60px 9px,#22c55e 4px,transparent 5px) 0 0/96px 16px repeat-x,
      radial-gradient(circle at 84px 9px,#3b82f6 4px,transparent 5px) 0 0/96px 16px repeat-x;
      animation:tp-brillo 1.6s steps(2) infinite}
  @keyframes tp-brillo{50%{opacity:.45}}
  .tp-cielo{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:44}
  .tp-cae{position:absolute;top:-2rem;animation:tp-caer linear forwards;text-shadow:0 0 3px rgba(0,0,0,.25)}
  .tp-papel{position:absolute;top:-1rem;width:8px;height:14px;border-radius:2px;animation:tp-caer linear forwards;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
  @keyframes tp-caer{to{transform:translate(var(--tp-x),110vh) rotate(var(--tp-g))}}
  @media (prefers-reduced-motion: reduce){.tp-cielo{display:none}.tp-luces::before{animation:none}}
  html.hc .tp-cielo{display:none}`;
    document.head.appendChild(st);

    function pintar() {
        // Franja con el saludo (se puede cerrar; vuelve la próxima temporada)
        if (leerLS(clave) !== "cerrada") {
            const caja = document.createElement("div");
            caja.setAttribute("role", "region");
            caja.setAttribute("aria-label", t.titulo);
            if (t.bandera) caja.insertAdjacentHTML("beforeend", '<div class="tp-bandera" aria-hidden="true"></div>');
            if (t.luces) caja.insertAdjacentHTML("beforeend", '<div class="tp-luces" aria-hidden="true"></div>');
            const banda = document.createElement("div");
            banda.className = "tp-banda";
            banda.style.background = t.fondo;
            banda.innerHTML = `<i class="fa-solid ${t.icono} tp-ic" aria-hidden="true"></i><span>${t.titulo}<small>${t.texto}</small></span>
                <button type="button" class="tp-x" aria-label="Cerrar saludo">✕</button>`;
            caja.appendChild(banda);
            if (t.bandera) caja.insertAdjacentHTML("beforeend", '<div class="tp-bandera" aria-hidden="true"></div>');
            banda.querySelector(".tp-x").onclick = () => { guardar(clave, "cerrada"); caja.remove(); };
            document.body.insertBefore(caja, document.body.firstChild);
        }

        // Nieve, confeti o corazones: una sola vez por visita y solo unos segundos, para no estorbar al votar
        try { if (sessionStorage.getItem(clave)) return; sessionStorage.setItem(clave, "1"); } catch { }
        const cielo = document.createElement("div");
        cielo.className = "tp-cielo";
        cielo.setAttribute("aria-hidden", "true");
        const azar = (a, b) => a + Math.random() * (b - a);
        for (let i = 0; i < 36; i++) {
            const p = document.createElement("span");
            if (t.caen) {
                p.className = "tp-cae";
                p.textContent = t.caen[i % t.caen.length];
                p.style.fontSize = azar(14, 28) + "px";
                p.style.color = t.colores[i % t.colores.length];
            } else {
                p.className = "tp-papel";
                p.style.background = t.confeti[i % t.confeti.length];
            }
            p.style.left = azar(0, 100) + "vw";
            p.style.setProperty("--tp-x", azar(-60, 60) + "px");
            p.style.setProperty("--tp-g", azar(-540, 540) + "deg");
            p.style.animationDuration = azar(6, 11) + "s";
            p.style.animationDelay = azar(0, 6) + "s";
            cielo.appendChild(p);
        }
        document.body.appendChild(cielo);
        setTimeout(() => cielo.remove(), 18000);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar);
    else pintar();
})();
