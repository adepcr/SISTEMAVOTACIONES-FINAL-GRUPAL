/* mejoras.js · ADEP Vota
   1) Calendario propio para "Apertura" y "Cierre" (reemplaza la ventana simple del navegador).
      Los <input id="new-poll-open"> y <input id="new-poll-close"> siguen existiendo (ocultos)
      y conservan su valor, así app.js funciona igual.
   2) Asistente «Robi»: mini robot animado (parpadea y mueve la boca al hablar) que explica cada sección
      a afiliados y administradores.
   Para quitarlo: borrar la línea <script src="js/mejoras.js"> de index.html. */
(function () {
    "use strict";
    const css = `
  .cal-btn{display:flex;align-items:center;gap:.75rem;width:100%;min-height:56px;padding:.6rem 1rem;text-align:left;background:#fff;border:2px solid #7fbf9b;border-radius:.95rem;font-weight:700;font-size:1.05rem;color:#04492a;cursor:pointer}
  .cal-btn i{color:#008744;font-size:1.3rem}.cal-btn.vacio{color:#5b6672;font-weight:600}
  .cal-btn:hover{background:#f4fbf7;border-color:#008744}
  .cal-ov{position:fixed;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1rem;z-index:70}
  .cal-box{background:#fff;border-radius:1.5rem;width:min(100%,26rem);max-height:95vh;overflow:auto;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}
  .cal-top{background:linear-gradient(135deg,#04492a,#008744);color:#fff;padding:1rem 1.25rem}
  .cal-top b{font-family:Outfit,sans-serif;font-size:1.25rem;display:block}.cal-top span{font-size:.95rem;color:#c9f5dc}
  .cal-in{padding:1rem 1.1rem 1.2rem}
  .cal-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}
  .cal-nav b{font-family:Outfit,sans-serif;font-size:1.2rem;text-transform:capitalize;color:#04492a}
  .cal-nav button{width:48px;height:48px;border-radius:.8rem;border:2px solid #cfe3d6;background:#f4fbf7;color:#006b35;font-size:1.1rem}
  .cal-g{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
  .cal-w{text-align:center;font-weight:800;font-size:.9rem;color:#4a5a53;padding:.3rem 0}
  .cal-d{height:46px;border:0;border-radius:.75rem;background:#fff;font-weight:700;font-size:1.05rem;color:#1c2b25;cursor:pointer}
  .cal-d:hover{background:#e8f5ee}.cal-d.hoy{box-shadow:inset 0 0 0 2px #e52521}
  .cal-d.sel,.cal-d.sel:hover{background:#008744;color:#fff}
  .cal-d{position:relative}.cal-d.act::after{content:"";position:absolute;left:50%;bottom:5px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#e52521}
  .cal-d.sel.act::after{background:#fff}
  .cal-ley{display:flex;align-items:center;gap:.4rem;margin-top:.6rem;font-size:.9rem;font-weight:600;color:#4a5a53}
  .cal-ley b{width:8px;height:8px;border-radius:50%;background:#e52521}
  .cal-t{display:flex;align-items:center;gap:.5rem;margin-top:1rem;padding-top:1rem;border-top:1px solid #d5e2da;flex-wrap:wrap}
  .cal-t label{font-weight:800;color:#04492a;margin-right:.25rem}
  .cal-t select{min-height:48px;border:2px solid #b6c6bc;border-radius:.8rem;padding:0 .6rem;font-size:1.1rem;font-weight:700;background:#fff}
  .cal-ap button{min-height:48px;padding:0 .9rem;border:2px solid #b6c6bc;background:#fff;font-weight:800;font-size:1rem}
  .cal-ap button:first-child{border-radius:.8rem 0 0 .8rem}.cal-ap button:last-child{border-radius:0 .8rem .8rem 0;border-left:0}
  .cal-ap button[aria-pressed=true]{background:#008744;border-color:#008744;color:#fff}
  .cal-res{margin-top:1rem;background:#e8f5ee;border-radius:.85rem;padding:.7rem .9rem;font-weight:700;color:#04492a;min-height:3rem}
  .cal-f{display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap}
  .cal-f button{flex:1 1 auto;min-height:52px;border-radius:.9rem;font-weight:800;font-size:1.05rem;border:2px solid #cfe3d6;background:#f3f7f5;color:#1c2b25;padding:0 1rem}
  .cal-f .ok{background:#008744;border-color:#008744;color:#fff}.cal-f .ok:disabled{opacity:.45;cursor:not-allowed}
  #bot{position:fixed;right:12px;bottom:12px;z-index:45;display:flex;flex-direction:column;align-items:flex-end;gap:.6rem;max-width:calc(100vw - 24px)}
  #bot-btn{display:flex;align-items:center;gap:.4rem;padding:0 1rem 0 0;background:#fff;border:3px solid #008744;border-radius:999px;box-shadow:0 10px 24px -8px rgba(4,73,42,.6);font-weight:800;color:#04492a;font-size:1.05rem;cursor:pointer}
  #bot-btn .rb{width:62px;height:62px;margin:-6px 0 -2px -4px}
  #bot-panel{width:min(24rem,calc(100vw - 24px));background:#fff;border:2px solid #008744;border-radius:1.4rem;box-shadow:0 24px 50px -16px rgba(4,73,42,.65);overflow:hidden}
  #bot-panel[hidden],#bot-globo[hidden]{display:none}
  .bot-h{display:flex;align-items:center;gap:.6rem;background:linear-gradient(135deg,#04492a,#008744);color:#fff;padding:.45rem .6rem .45rem .5rem;font-weight:800}
  .bot-h .rb{width:46px;height:46px;flex-shrink:0;background:rgba(255,255,255,.15);border-radius:50%;padding:2px}
  .bot-h span{flex:1}
  .bot-h button{width:44px;height:44px;border-radius:.8rem;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:1.3rem}
  .bot-b{padding:1rem 1.1rem;max-height:55vh;overflow:auto}
  .bot-b h3{font-family:Outfit,sans-serif;font-size:1.3rem;color:#04492a;margin-bottom:.5rem}
  .bot-b ol{counter-reset:p;display:grid;gap:.6rem;padding:0;margin:.5rem 0 0;list-style:none}
  .bot-b li{counter-increment:p;display:flex;gap:.7rem;line-height:1.45;animation:rb-aparece .35s ease-out both}
  .bot-b li::before{content:counter(p);flex:0 0 1.9rem;height:1.9rem;border-radius:50%;background:#008744;color:#fff;font-weight:800;display:grid;place-items:center}
  .bot-aviso{background:#fff8e1;border:2px solid #f2d27a;border-radius:.85rem;padding:.6rem .8rem;font-weight:700;color:#6b4e00;margin-bottom:.5rem}
  .bot-f{padding:0 1.1rem 1rem}.bot-f button{min-height:48px;padding:0 1rem;border-radius:.9rem;border:2px solid #cfe3d6;background:#e8f5ee;color:#006b35;font-weight:800}
  #bot-globo{position:relative;max-width:min(17rem,calc(100vw - 24px));background:#fff;border:2px solid #008744;border-radius:1.1rem;padding:.75rem 2.4rem .75rem 1rem;font-weight:700;color:#04492a;line-height:1.4;box-shadow:0 14px 30px -14px rgba(4,73,42,.6);cursor:pointer;animation:rb-aparece .3s ease-out}
  #bot-globo::after{content:"";position:absolute;right:30px;bottom:-10px;width:16px;height:16px;background:#fff;border-right:2px solid #008744;border-bottom:2px solid #008744;transform:rotate(45deg)}
  #bot-globo button{position:absolute;top:4px;right:4px;width:32px;height:32px;border:0;border-radius:.6rem;background:#e8f5ee;color:#006b35;font-size:1rem;line-height:1}
  /* Animaciones del robot */
  .rb .rb-todo{animation:rb-flota 3s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  .rb .rb-ojos{animation:rb-parpadeo 4.5s infinite;transform-box:fill-box;transform-origin:center}
  .rb .rb-luz{animation:rb-luz 2s ease-in-out infinite}
  .rb .rb-boca{transform-box:fill-box;transform-origin:center}
  .rb .rb-brazo{transform-box:fill-box;transform-origin:20% 90%}
  #bot.hablando .rb-boca{animation:rb-habla .17s ease-in-out infinite alternate}
  #bot.hablando .rb-luz{animation-duration:.5s}
  #bot.saluda .rb-brazo{animation:rb-saludo .9s ease-in-out 2}
  @keyframes rb-flota{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
  @keyframes rb-parpadeo{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
  @keyframes rb-luz{50%{opacity:.35}}
  @keyframes rb-habla{0%{transform:scaleY(.6)}100%{transform:scaleY(3)}}
  @keyframes rb-saludo{0%,100%{transform:rotate(0)}30%{transform:rotate(-28deg)}70%{transform:rotate(14deg)}}
  @keyframes rb-aparece{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @media(max-width:640px){#bot-btn span{display:none}#bot-btn{padding:0}#bot-btn .rb{margin:-4px}}
  html.hc .cal-btn,html.hc #bot-btn,html.hc #bot-globo{border-color:#000;color:#000}`;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    /* ================= 1) CALENDARIO ================= */
    const MESES = [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "setiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ];
    const DIAS = ["do", "lu", "ma", "mi", "ju", "vi", "sá"];
    const pad = (n) => String(n).padStart(2, "0");
    const toVal = (d) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const leerValor = (v) => new Date(v.length === 10 ? v + "T00:00" : v); // "AAAA-MM-DD" en hora local
    const toDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const largoDia = (d) =>
        d.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const largo = (d) =>
        d.toLocaleString("es-CR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    let ov = null,
        S = null;

    function syncBtn(input, btn) {
        const v = input.value, o = btn._cal || {};
        btn.classList.toggle("vacio", !v);
        btn.querySelector("span").textContent = v
            ? (o.soloFecha ? largoDia : largo)(leerValor(v))
            : o.vacio || "Elegir fecha y hora (opcional)";
    }
    function abrir(input, btn, titulo) {
        const base = input.value ? leerValor(input.value) : null,
            hoy = new Date();
        const ref = base || hoy;
        S = {
            input,
            btn,
            soloFecha: !!(btn._cal && btn._cal.soloFecha),
            marcar: btn._cal && btn._cal.marcar,
            y: ref.getFullYear(),
            m: ref.getMonth(),
            sel: base
                ? new Date(base.getFullYear(), base.getMonth(), base.getDate())
                : null,
            h: base ? base.getHours() % 12 || 12 : 8,
            mi: base ? base.getMinutes() : 0,
            pm: base ? base.getHours() >= 12 : false,
        };
        ov = document.createElement("div");
        ov.className = "cal-ov";
        ov.innerHTML = `<div class="cal-box" role="dialog" aria-modal="true" aria-label="${titulo}">
      <div class="cal-top"><b>${titulo}</b><span>${S.soloFecha ? "Elija el día" : "Elija el día y la hora"}</span></div><div class="cal-in"></div></div>`;
        ov.addEventListener("click", (e) => {
            if (e.target === ov) cerrar();
        });
        document.body.appendChild(ov);
        dibujar();
        const f = ov.querySelector(".cal-d.sel,.cal-d.hoy,.cal-d");
        if (f) f.focus();
    }
    function cerrar() {
        if (ov) ov.remove();
        ov = null;
        if (S) S.btn.focus();
        S = null;
    }
    function dibujar() {
        const first = new Date(S.y, S.m, 1).getDay(),
            n = new Date(S.y, S.m + 1, 0).getDate(),
            hoy = new Date();
        let cells =
            DIAS.map((d) => `<div class="cal-w">${d}</div>`).join("") +
            "<div></div>".repeat(first);
        for (let d = 1; d <= n; d++) {
            const dt = new Date(S.y, S.m, d),
                esSel = S.sel && +S.sel === +dt,
                esHoy = dt.toDateString() === hoy.toDateString(),
                act = S.marcar && S.marcar(dt);
            cells += `<button type="button" class="cal-d${esSel ? " sel" : ""}${esHoy ? " hoy" : ""}${act ? " act" : ""}" data-d="${d}" aria-pressed="${!!esSel}" aria-label="${dt.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" })}${act ? ", con actividad" : ""}">${d}</button>`;
        }
        const hs = Array.from(
            { length: 12 },
            (_, i) =>
                `<option value="${i + 1}" ${S.h === i + 1 ? "selected" : ""}>${i + 1}</option>`,
        ).join("");
        const ms =
            Array.from(
                { length: 12 },
                (_, i) =>
                    `<option value="${i * 5}" ${S.mi === i * 5 ? "selected" : ""}>${pad(i * 5)}</option>`,
            ).join("") +
            (S.mi % 5
                ? `<option value="${S.mi}" selected>${pad(S.mi)}</option>`
                : "");
        const hora = `<div class="cal-t"><label for="cal-h">Hora</label><select id="cal-h" aria-label="Hora">${hs}</select><b>:</b><select id="cal-m" aria-label="Minutos">${ms}</select>
        <span class="cal-ap"><button type="button" data-ap="0" aria-pressed="${!S.pm}">a. m.</button><button type="button" data-ap="1" aria-pressed="${S.pm}">p. m.</button></span></div>`;
        ov.querySelector(".cal-in").innerHTML = `
      <div class="cal-nav"><button type="button" data-nav="-1" aria-label="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button><b>${MESES[S.m]} ${S.y}</b><button type="button" data-nav="1" aria-label="Mes siguiente"><i class="fa-solid fa-chevron-right"></i></button></div>
      <div class="cal-g">${cells}</div>
      ${S.marcar ? '<p class="cal-ley"><b></b> Días con actividad registrada</p>' : ""}
      ${S.soloFecha ? "" : hora}
      <div class="cal-res" role="status">${resTxt()}</div>
      <div class="cal-f"><button type="button" data-a="borrar">Borrar</button><button type="button" data-a="cancel">Cancelar</button><button type="button" class="ok" data-a="ok" ${S.sel ? "" : "disabled"}>Aceptar</button></div>`;
    }
    const fecha = () =>
        new Date(
            S.sel.getFullYear(),
            S.sel.getMonth(),
            S.sel.getDate(),
            (S.h % 12) + (S.pm ? 12 : 0),
            S.mi,
        );
    const resTxt = () =>
        S.sel
            ? "Elegido: " + (S.soloFecha ? largoDia(S.sel) : largo(fecha()))
            : "Toque un día del calendario.";
    function refrescarRes() {
        const r = ov.querySelector(".cal-res");
        r.textContent = resTxt();
        ov.querySelector("[data-a=ok]").disabled = !S.sel;
    }
    document.addEventListener("click", (e) => {
        if (!ov || !S) return;
        const d = e.target.closest(".cal-d"),
            nav = e.target.closest("[data-nav]"),
            ap = e.target.closest("[data-ap]"),
            a = e.target.closest("[data-a]");
        if (d) {
            S.sel = new Date(S.y, S.m, +d.dataset.d);
            dibujar();
            ov.querySelector(".cal-d.sel").focus();
        } else if (nav) {
            S.m += +nav.dataset.nav;
            if (S.m < 0) {
                S.m = 11;
                S.y--;
            }
            if (S.m > 11) {
                S.m = 0;
                S.y++;
            }
            dibujar();
        } else if (ap) {
            S.pm = ap.dataset.ap === "1";
            ov.querySelectorAll("[data-ap]").forEach((b) =>
                b.setAttribute("aria-pressed", String((b.dataset.ap === "1") === S.pm)),
            );
            refrescarRes();
        } else if (a) {
            if (a.dataset.a === "cancel") return cerrar();
            if (a.dataset.a === "borrar") S.input.value = "";
            if (a.dataset.a === "ok" && S.sel) S.input.value = S.soloFecha ? toDia(S.sel) : toVal(fecha());
            S.input.dispatchEvent(new Event("input", { bubbles: true }));
            S.input.dispatchEvent(new Event("change", { bubbles: true }));
            syncBtn(S.input, S.btn);
            cerrar();
        }
    });
    document.addEventListener("change", (e) => {
        if (!ov || !S) return;
        if (e.target.id === "cal-h") {
            S.h = +e.target.value;
            refrescarRes();
        }
        if (e.target.id === "cal-m") {
            S.mi = +e.target.value;
            refrescarRes();
        }
    });
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape" && ov) {
                e.stopPropagation();
                cerrar();
            }
        },
        true,
    );

    // Reemplaza un <input> de fecha por el botón del calendario. El input queda oculto y conserva el valor.
    // opciones: { soloFecha: true (sin hora), vacio: "texto sin fecha", marcar: fecha => true para poner un punto }
    function adjuntar(input, titulo, opciones = {}) {
        const lab = input.id && document.querySelector(`label[for="${input.id}"]`);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cal-btn";
        btn._cal = opciones;
        btn.innerHTML =
            '<i class="fa-regular fa-calendar-days" aria-hidden="true"></i><span></span>';
        btn.setAttribute("aria-label", lab ? lab.textContent.trim() : titulo);
        input.style.display = "none";
        input.after(btn);
        btn.addEventListener("click", () => abrir(input, btn, titulo));
        if (input.form)
            input.form.addEventListener("reset", () =>
                setTimeout(() => syncBtn(input, btn), 0),
            );
        syncBtn(input, btn);
        return { refrescar: () => syncBtn(input, btn) };
    }
    window.ADEPCalendario = { adjuntar };

    function initCalendarios() {
        [
            ["new-poll-open", "Fecha y hora de apertura"],
            ["new-poll-close", "Fecha y hora de cierre"],
        ].forEach(([id, titulo]) => {
            const input = document.getElementById(id);
            if (input) adjuntar(input, titulo);
        });
    }

    /* ================= 2) ASISTENTE (ROBOT) ================= */
    const GUIA = {
        resumen: {
            ad: [
                "Resumen general",
                [
                    "Las tarjetas muestran los afiliados activos, las votaciones abiertas, la participación y los votos de hoy.",
                    "Abajo verá la participación de cada filial. Puede elegir una consulta en la lista.",
                    "Use las pestañas de arriba para crear, gestionar y revisar votaciones.",
                ],
            ],
        },
        votacion: {
            a: [
                "Aquí usted vota",
                [
                    "Lea la pregunta. Si lo desea, pulse «Escuchar» para oírla.",
                    "Toque la respuesta que prefiere. Quedará marcada con «✔ Su elección».",
                    "Pulse «Revisar y enviar voto».",
                    "Confirme con «Sí, enviar mi voto». Solo puede votar una vez en cada consulta.",
                ],
            ],
            ad: [
                "Votaciones publicadas",
                [
                    "Así ven las votaciones los afiliados. Los administradores no votan.",
                    "Para publicar, retirar o cerrar una consulta vaya a «Gestionar».",
                ],
            ],
        },
        comprobantes: {
            a: [
                "Sus comprobantes",
                [
                    "Cada comprobante prueba que su voto quedó registrado.",
                    "Guarde el código y descargue el PDF si lo desea.",
                    "Para comprobar su código entre a «Resultados en Vivo».",
                ],
            ],
        },
        resultados: {
            a: [
                "Resultados en vivo",
                [
                    "Vea cuántos votos lleva cada opción.",
                    "La barra amarilla muestra cuántos afiliados ya participaron.",
                    "Abajo, en «Verificar un comprobante», escriba su código para confirmar que su voto fue contado.",
                ],
            ],
            ad: [
                "Resultados y participación",
                [
                    "Revise los resultados de cada consulta.",
                    "Abra «Registro de participación» para ver quién ya votó y quién está pendiente.",
                    "El botón «Acta» descarga el acta oficial en PDF, con el logo de ADEP.",
                ],
            ],
        },
        crear: {
            ad: [
                "Crear una consulta",
                [
                    "Escriba la pregunta y elija la categoría.",
                    "Escriba las opciones, una por línea (mínimo dos).",
                    "Si desea programarla, elija la fecha de apertura y de cierre en el calendario.",
                    "Marque «Publicar de inmediato» o publíquela después en «Gestionar».",
                ],
            ],
        },
        gestionar: {
            ad: [
                "Gestionar votaciones",
                [
                    "Publique o retire cada consulta.",
                    "«Cerrar ahora» detiene la votación.",
                    "Si ya hay votos, la modalidad (secreta o pública) no se puede cambiar.",
                    "«Eliminar» le ofrece descargar el acta antes de borrar.",
                ],
            ],
        },
        afiliados: {
            ad: [
                "Afiliados",
                [
                    "Registre al afiliado con su nombre, cédula, filial y teléfono.",
                    "El sistema crea un código de activación. Se muestra una sola vez: entréguelo en persona o con el botón «Enviar por WhatsApp».",
                    "La primera vez, el afiliado toca «Es mi primera vez», escribe su cédula y el código, y crea su propia clave. El código sirve una sola vez.",
                    "Si olvida su clave, use «Nuevo código». También puede desactivar o eliminar cuentas.",
                ],
            ],
        },
        admins: {
            ad: [
                "Administradores",
                [
                    "Cree cuentas con correo y contraseña de al menos 8 caracteres.",
                    "Ingresan desde «Soy administrador» en la pantalla de inicio.",
                    "A otro administrador puede enviarle un correo para que cambie su contraseña.",
                    "Usted no puede desactivar ni eliminar su propia cuenta.",
                ],
            ],
        },
        auditoria: {
            ad: [
                "Bitácora",
                [
                    "Aquí queda registrado quién hizo qué y cuándo.",
                    "Use «Desde» y «Hasta» para buscar por fechas. Los días con actividad tienen un punto rojo.",
                    "«Borrar bitácora» elimina todo el registro; queda anotado quién lo borró.",
                    "Los votos nunca guardan la opción elegida.",
                ],
            ],
        },
    };
    // Mini robot: flota, parpadea y mueve la boca cuando habla (clase .hablando en #bot)
    const ROBOT = `<svg class="rb" viewBox="0 0 64 64" aria-hidden="true"><g class="rb-todo">
        <line x1="32" y1="6" x2="32" y2="13" stroke="#006b35" stroke-width="3" stroke-linecap="round"/>
        <circle class="rb-luz" cx="32" cy="6" r="4" fill="#e52521"/>
        <path class="rb-brazo" d="M53 40 q8 -2 8 -12" fill="none" stroke="#006b35" stroke-width="4" stroke-linecap="round"/>
        <circle cx="61" cy="27" r="3" fill="#d4af37"/>
        <rect x="10" y="13" width="44" height="36" rx="13" fill="#008744"/>
        <circle cx="8" cy="31" r="4" fill="#006b35"/><circle cx="56" cy="31" r="4" fill="#006b35"/>
        <rect x="15.5" y="19" width="33" height="24" rx="9" fill="#fff"/>
        <g class="rb-ojos"><ellipse cx="25" cy="28" rx="4" ry="4.4" fill="#04492a"/><ellipse cx="39" cy="28" rx="4" ry="4.4" fill="#04492a"/>
        <circle cx="26.3" cy="26.6" r="1.3" fill="#fff"/><circle cx="40.3" cy="26.6" r="1.3" fill="#fff"/></g>
        <circle cx="19.5" cy="34.5" r="2.2" fill="#f9a8b8" opacity=".8"/><circle cx="44.5" cy="34.5" r="2.2" fill="#f9a8b8" opacity=".8"/>
        <rect class="rb-boca" x="27" y="35" width="10" height="3" rx="1.5" fill="#04492a"/>
        <rect x="21" y="50" width="22" height="9" rx="4.5" fill="#006b35"/>
        <circle cx="32" cy="54.5" r="2" fill="#d4af37"/></g></svg>`;
    let bot,
        panel,
        btn,
        globo,
        actual = null,
        texto = "";
    const visto = (k) => {
        try {
            return sessionStorage.getItem("adep_bot_" + k);
        } catch {
            return null;
        }
    };
    const marcar = (k) => {
        try {
            sessionStorage.setItem("adep_bot_" + k, "1");
        } catch { }
    };
    const esAdmin = () => !!document.getElementById("tab-crear");
    const nombre = () => (typeof user !== "undefined" && user && user.nombre ? user.nombre.split(" ")[0] : "");

    // ---- Boca: habla un rato, o mientras se lee en voz alta ----
    // En la app de celular, js/app-movil.js define estaLeyendo/dejarDeLeer con la voz del teléfono
    const leyendo = () => window.estaLeyendo ? window.estaLeyendo() : ("speechSynthesis" in window && speechSynthesis.speaking);
    const callar = () => window.dejarDeLeer ? window.dejarDeLeer() : ("speechSynthesis" in window && speechSynthesis.speaking && speechSynthesis.cancel());
    let finHablar = null, vigilaVoz = null;
    function hablar(ms) {
        clearTimeout(finHablar);
        bot.classList.add("hablando");
        finHablar = setTimeout(() => bot.classList.remove("hablando"), ms);
    }
    function hablarMientrasLee() {
        clearInterval(vigilaVoz);
        hablar(60000);
        setTimeout(() => {
            vigilaVoz = setInterval(() => {
                if (!leyendo()) {
                    clearInterval(vigilaVoz);
                    hablar(0);
                }
            }, 250);
        }, 400);
    }
    function saludar() {
        bot.classList.remove("saluda");
        void bot.offsetWidth; // reinicia la animación
        bot.classList.add("saluda");
    }

    // ---- Globo de texto: escribe letra por letra mientras mueve la boca ----
    let escribiendo = null, ocultarGlobo = null;
    function decir(frase) {
        clearInterval(escribiendo);
        clearTimeout(ocultarGlobo);
        const t = globo.querySelector("p");
        globo.hidden = false;
        t.textContent = "";
        let n = 0;
        hablar(frase.length * 35 + 200);
        escribiendo = setInterval(() => {
            t.textContent = frase.slice(0, ++n);
            if (n >= frase.length) clearInterval(escribiendo);
        }, 35);
        ocultarGlobo = setTimeout(() => { globo.hidden = true; }, 9000);
    }

    function seccion() {
        const s = [...document.querySelectorAll("main > section")].find(
            (x) => !x.classList.contains("hidden"),
        );
        return s ? s.id.replace("sec-", "") : null;
    }
    function guia() {
        const g = GUIA[actual];
        return g ? (esAdmin() ? g.ad : g.a) || [] : [];
    }
    function pintar() {
        if (!actual) return;
        const [t, pasos] = guia();
        if (!t) return;
        let aviso = "";
        if (!esAdmin() && actual === "votacion") {
            const n =
                parseInt(
                    (document.getElementById("badge-pendientes") || {}).textContent,
                    10,
                ) || 0;
            aviso = `<p class="bot-aviso">${n ? `Tiene ${n} ${n === 1 ? "votación pendiente" : "votaciones pendientes"}. ¡Vamos a votar!` : "No tiene votaciones pendientes por ahora."}</p>`;
        }
        panel.querySelector(".bot-b").innerHTML =
            `<h3>${t}</h3>${aviso}<ol>${pasos.map((p, i) => `<li style="animation-delay:${i * 0.35}s"><span>${p}</span></li>`).join("")}</ol>`;
        texto = `${t}. ` + pasos.map((p, i) => `Paso ${i + 1}: ${p}`).join(" ");
    }
    function abrirBot(v) {
        const antes = !panel.hidden;
        panel.hidden = !v;
        btn.setAttribute("aria-expanded", String(v));
        if (v) {
            globo.hidden = true;
            pintar();
            if (!antes) { saludar(); hablar(Math.min(6000, guia()[1] ? guia()[1].length * 900 + 800 : 1500)); }
        } else {
            callar();
            hablar(0);
        }
    }
    let espera = null;
    function revisar() {
        clearTimeout(espera);
        espera = setTimeout(() => {
            const id = seccion();
            if (!id) return;
            if (id !== actual) {
                actual = id;
                pintar();
                const k = (esAdmin() ? "ad" : "a") + id;
                if (!visto(k) && guia()[0]) {
                    marcar(k);
                    // Primera visita a la sección: en computadora abre la explicación; en celular saluda con un globo
                    if (window.innerWidth > 640) abrirBot(true);
                    else {
                        abrirBot(false);
                        saludar();
                        decir(`¡Hola${nombre() ? ", " + nombre() : ""}! Toque aquí y le explico «${guia()[0]}».`);
                    }
                } else if (!panel.hidden) pintar();
                else abrirBot(false);
            } else if (!panel.hidden) pintar();
        }, 250);
    }
    function initBot() {
        if (!document.querySelector("main")) return;
        bot = document.createElement("div");
        bot.id = "bot";
        bot.innerHTML = `<div id="bot-panel" role="region" aria-label="Asistente ADEP" hidden>
        <div class="bot-h">${ROBOT}<span>Robi, su asistente ADEP</span><button type="button" aria-label="Cerrar asistente">✕</button></div>
        <div class="bot-b" aria-live="polite"></div>
        <div class="bot-f"><button type="button" id="bot-oir"><i class="fa-solid fa-volume-high"></i> Escuchar</button></div></div>
      <div id="bot-globo" role="status" hidden><p></p><button type="button" aria-label="Cerrar mensaje">✕</button></div>
      <button type="button" id="bot-btn" aria-label="Abrir ayuda del asistente" aria-expanded="false">${ROBOT}<span>Ayuda</span></button>`;
        document.body.appendChild(bot);
        panel = bot.querySelector("#bot-panel");
        btn = bot.querySelector("#bot-btn");
        globo = bot.querySelector("#bot-globo");
        btn.addEventListener("click", () => {
            actual = actual || seccion();
            abrirBot(panel.hidden);
        });
        globo.addEventListener("click", (e) => {
            globo.hidden = true;
            if (!e.target.closest("button")) abrirBot(true);
        });
        panel.querySelector(".bot-h button").addEventListener("click", () => {
            abrirBot(false);
            btn.focus();
        });
        panel.querySelector("#bot-oir").addEventListener("click", () => {
            if (typeof leer === "function" && leer(texto)) hablarMientrasLee();
        });
        new MutationObserver(revisar).observe(document.querySelector("main"), {
            subtree: true,
            attributes: true,
            attributeFilter: ["class"],
        });
        revisar();
    }

    const iniciar = () => {
        initCalendarios();
        initBot();
    };
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();
