/* aviso-conexion.js · ADEP Vota · AVISO DE CONEXIÓN (idea tomada del proyecto de Josué)
   Si el aparato pierde internet aparece una franja roja arriba que lo dice claramente,
   y al volver la conexión una franja verde por unos segundos. Se usa en login.html e index.html.
   Para quitarlo: borrar la línea <script src="js/aviso-conexion.js"> de cada página. */
(function () {
    "use strict";
    let franja = null, ocultar = null;
    function mostrar(enLinea) {
        if (!document.body) return;
        if (!franja) {
            franja = document.createElement("div");
            franja.setAttribute("role", "status");
            franja.setAttribute("aria-live", "assertive");
            franja.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:200;padding:.75rem 1rem;text-align:center;font:800 1.05rem/1.3 Arial,Helvetica,sans-serif;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .3s";
            document.body.appendChild(franja);
        }
        clearTimeout(ocultar);
        franja.style.transform = "translateY(0)";
        franja.style.background = enLinea ? "#008744" : "#c81e1b";
        franja.textContent = enLinea
            ? "✓ Conexión recuperada. Todo sigue funcionando."
            : "⚠ Sin conexión a internet. Su voto no se puede enviar hasta que vuelva la conexión. No cierre esta página.";
        if (enLinea) ocultar = setTimeout(() => { franja.style.transform = "translateY(-110%)"; }, 4000);
    }
    window.addEventListener("offline", () => mostrar(false));
    window.addEventListener("online", () => mostrar(true));
    const inicio = () => { if (navigator.onLine === false) mostrar(false); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio); else inicio();
})();
