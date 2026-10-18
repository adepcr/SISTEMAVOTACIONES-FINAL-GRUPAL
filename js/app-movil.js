// Soporte para la app (Android/iOS con Capacitor) y para instalar la página como PWA.
(() => {
    const cap = window.Capacitor;
    const esApp = !!(cap && cap.isNativePlatform && cap.isNativePlatform());

    // En la web: registrar el service worker para que se pueda instalar como app.
    if (!esApp) {
        if ("serviceWorker" in navigator && location.protocol === "https:") {
            window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));
        }
        return;
    }

    // En la app no existen las descargas del navegador: el archivo se guarda
    // y se abre el menú de "Compartir" para guardarlo, enviarlo o imprimirlo.
    const { Filesystem, Share, TextToSpeech } = cap.Plugins;

    // Lectura en voz alta con la voz del teléfono (la del navegador no funciona dentro de la app)
    if (TextToSpeech) {
        let leyendo = false;
        window.leer = texto => {
            if (leyendo) { TextToSpeech.stop().catch(() => { }); leyendo = false; return true; } // segundo toque = detener
            leyendo = true;
            TextToSpeech.speak({ text: texto, lang: "es-MX", rate: 0.9 }).catch(() => { }).finally(() => { leyendo = false; });
            return true;
        };
        window.estaLeyendo = () => leyendo;
        window.dejarDeLeer = () => { if (leyendo) { TextToSpeech.stop().catch(() => { }); leyendo = false; } };
    }

    async function guardarYCompartir(nombre, base64) {
        try {
            const { uri } = await Filesystem.writeFile({ path: nombre, data: base64, directory: "CACHE" });
            await Share.share({ title: nombre, url: uri });
        } catch (e) {
            if (!/cancel/i.test(e && e.message)) alert("No se pudo guardar el archivo: " + (e && e.message || e));
        }
    }

    const blobABase64 = blob => new Promise((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1]);
        r.onerror = fail;
        r.readAsDataURL(blob);
    });

    // PDFs hechos con jsPDF (comprobantes, resultados, actas).
    if (window.jspdf) {
        window.jspdf.jsPDF.API.save = function (nombre) {
            guardarYCompartir(nombre || "documento.pdf", this.output("datauristring").split(",")[1]);
        };
    }

    // Enlaces de descarga creados en el código (CSV, plantillas).
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (!this.hasAttribute("download")) return clickOriginal.call(this);
        const nombre = this.download || "archivo";
        fetch(this.href).then(r => r.blob()).then(blobABase64).then(b64 => guardarYCompartir(nombre, b64));
    };

    // Hojas para imprimir: se guardan como archivo HTML para abrirlas e imprimirlas.
    window.open = () => {
        let html = "";
        return {
            document: {
                write: t => { html += t; },
                close: () => {
                    const limpio = html.replace(/<script>window\.onload=function\(\)\{window\.print\(\)\}<\/script>/, "");
                    blobABase64(new Blob([limpio], { type: "text/html" })).then(b64 => guardarYCompartir("Hoja_para_imprimir.html", b64));
                }
            }
        };
    };
})();
