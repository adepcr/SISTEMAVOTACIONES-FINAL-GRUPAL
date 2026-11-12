/* db.js - ADEP Vota · datos en Supabase (proyecto de ADEP «inventario-archivo»), ver supabase/votaciones.sql.
   Mantiene la misma forma de uso que antes (DB.polls(), DB.votes(), ...): lee de una copia en memoria
   que se actualiza sola cada pocos segundos, y escribe en la nube.

   Quién es quién:
     - Administrador: cuenta de Supabase (correo y contraseña) que está activa en vota_admins.
     - Afiliado: NO tiene cuenta de Supabase. Entra con su cédula y recibe una «sesión» (número secreto)
       que guarda este celular. Todo lo hace por medio de las funciones vota_* de la base de datos.

   Tablas (todas empiezan con vota_, salvo la lista compartida con el carnet):
     carnet_afiliados        lista de afiliados de ADEP (la misma del carnet; nombre y filial)
     vota_cuentas            clave, celular, teléfono y estado de cada afiliado en este sistema
     vota_sesiones           sesiones de los afiliados (solo su huella)
     vota_admins             administradores
     vota_polls              consultas
     vota_conteos            votos por opción (c0..c9, total). El voto secreto vive SOLO aquí.
     vota_participacion      quién votó (nunca qué eligió) + código del comprobante
     vota_votos              votos de consultas públicas (con nombre)
     vota_codigos            códigos de verificación de comprobantes
     vota_auditoria          bitácora
     vota_alertas            intentos de entrar con una cédula que ya está en otro celular
     vota_eliminados         copia de lo que se borró
     vota_config             general (práctica) · publico (WhatsApp, enlace) · ingreso (código general)
     vota_ayuda              pedidos de ayuda durante una votación (no dicen qué votó)
     vota_solicitudes        pedidos de corrección de datos del afiliado */
const DB = {
    MAX_OPCIONES: 10,
    URL_PUBLICADA: 'https://adepcr.github.io/SISTEMAVOTACIONES-FINAL-GRUPAL/',   // dirección en GitHub Pages: para los enlaces de «Olvidé mi contraseña» desde la app

    yo: null, _token: null,
    _polls: [], _conteos: {}, _part: [], _votos: [], _afiliados: {}, _admins: {}, _audit: [], _config: {}, _ingreso: null, _alertas: [],
    _padron: 0, _votesCache: null, _firmas: {},
    _ayuda: [], _solicitudes: [], ayudaCargada: false,
    _desfase: 0, relojSincronizado: false,

    // ================= Utilidades =================
    _norm(id) { return String(id).replace(/\D/g, ''); },   // cédulas: solo números
    _ms(iso) { return iso ? new Date(iso).getTime() : 0; },
    async _rpc(nombre, args = {}) {
        const { data, error } = await SB.rpc(nombre, args);
        if (error) throw error;
        return data;
    },
    _sinRed(e) { return /fetch|network|conex/i.test(String((e && e.message) || e || '')); },
    _falla(e, msg) {
        console.error(e);
        const c = String((e && e.code) || ''), m = String((e && e.message) || '');
        let causa = '';
        if (c === '42501' || /permiso|permission/i.test(m)) causa = ' (Sin permiso: revise que supabase/votaciones.sql esté actualizado en Supabase.)';
        else if (this._sinRed(e)) causa = ' (Sin conexión a internet.)';
        else if (m) causa = ` (Detalle: ${m.slice(0, 120)})`;
        if (typeof showToast === 'function') showToast((msg || 'No se pudo guardar el cambio. Revise su conexión e intente de nuevo.') + causa);
    },
    _azar(n, letras) {
        const a = new Uint32Array(n); crypto.getRandomValues(a);
        return Array.from(a, x => letras[x % letras.length]).join('');
    },
    genCode() {
        const s = this._azar(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
        return `ADEP-${s.slice(0, 4)}-${s.slice(4)}`;
    },
    // Código de activación: 8 caracteres sin letras que se confundan (I, L, O, 0, 1)
    genActivacion() { const s = this._azar(8, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'); return `${s.slice(0, 4)}-${s.slice(4)}`; },
    _limpiarCodigo(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); },
    // Huella SHA-256 del código (base64 "url", la misma que calcula la base de datos)
    async _huella(ced, codigo) {
        const datos = new TextEncoder().encode(ced + ':' + this._limpiarCodigo(codigo));
        // crypto.subtle solo existe en https o localhost; si la página se abre por http se usa el cálculo propio
        const bytes = (window.crypto && crypto.subtle) ? new Uint8Array(await crypto.subtle.digest('SHA-256', datos)) : this._sha256(datos);
        return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
    },
    // SHA-256 de respaldo (mismo resultado que crypto.subtle)
    _sha256(m) {
        const K = [], H = [], r = (x, n) => (x >>> n) | (x << (32 - n));
        for (let c = 2, n = 0; n < 64; c++) {
            if ([2, 3, 5, 7, 11, 13].some(p => p < c && c % p === 0) || ![...Array(Math.floor(Math.sqrt(c)) + 1).keys()].slice(2).every(p => c % p)) continue;
            if (n < 8) H[n] = (Math.pow(c, 1 / 2) % 1) * 2 ** 32 | 0;
            K[n++] = (Math.pow(c, 1 / 3) % 1) * 2 ** 32 | 0;
        }
        const l = m.length, t = new Uint8Array(((l + 9 + 63) >> 6) << 6);
        t.set(m); t[l] = 0x80;
        const dv = new DataView(t.buffer); dv.setUint32(t.length - 4, l * 8);
        const w = new Array(64);
        for (let i = 0; i < t.length; i += 64) {
            for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4);
            for (let j = 16; j < 64; j++) {
                const s0 = r(w[j - 15], 7) ^ r(w[j - 15], 18) ^ (w[j - 15] >>> 3), s1 = r(w[j - 2], 17) ^ r(w[j - 2], 19) ^ (w[j - 2] >>> 10);
                w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
            }
            let [a, b, c, d, e, f, g, h] = H;
            for (let j = 0; j < 64; j++) {
                const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
                const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            [a, b, c, d, e, f, g, h].forEach((x, k) => { H[k] = (H[k] + x) | 0; });
        }
        const out = new Uint8Array(32), od = new DataView(out.buffer);
        H.forEach((x, k) => od.setUint32(k * 4, x));
        return out;
    },
    _errAuth(e) {
        const c = String((e && (e.code || e.error_code)) || ''), m = String((e && e.message) || '');
        if (c.includes('rate_limit') || /rate limit|too many/i.test(m)) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
        if (c === 'invalid_credentials' || /invalid login/i.test(m)) return 'Los datos de ingreso no son correctos. Revise e intente de nuevo.';
        if (c === 'email_not_confirmed') return 'Esa cuenta todavía no confirmó su correo. En Supabase → Authentication → Users, confírmela.';
        if (c === 'weak_password' || /password should/i.test(m)) return 'La contraseña es muy débil. Use al menos 8 caracteres.';
        if (c === 'same_password') return 'La contraseña nueva debe ser distinta de la anterior.';
        if (c === 'reauthentication_needed' || c === 'session_not_found') return 'Por seguridad, cierre sesión, vuelva a entrar e intente de nuevo.';
        if (this._sinRed(e)) return 'No hay conexión a internet. Revise e intente de nuevo.';
        console.error(e);
        return 'No se pudo completar. Intente de nuevo en unos minutos.';
    },
    _fechaTexto() { return new Date().toLocaleString('es-CR'); },

    // ================= Sesión =================
    _guardarSesion(cedula, token, tipo) {
        this._token = token;
        try {
            localStorage.setItem('adep_sesion', JSON.stringify({ cedula, token, tipo }));
            if (tipo === 'dispositivo') localStorage.setItem('adep_llave_' + cedula, token);
        } catch { }
    },
    _sesionGuardada() { try { return JSON.parse(localStorage.getItem('adep_sesion')); } catch { return null; } },
    _olvidarSesion() { this._token = null; try { localStorage.removeItem('adep_sesion'); } catch { } },
    _llave(ced) { try { return localStorage.getItem('adep_llave_' + ced); } catch { return null; } },
    async _perfilAdmin() {
        const { data } = await SB.auth.getSession();
        if (!data || !data.session) return null;
        const p = await this._rpc('vota_admin_perfil');
        return p ? { ...p, cedula: p.uid } : null;
    },
    // Sesión guardada en este equipo (para la pantalla de ingreso)
    async revisarSesion() {
        this.yo = null;
        const adm = await this._perfilAdmin().catch(e => { if (this._sinRed(e)) throw e; return null; });
        if (adm) return (this.yo = adm);
        const { data } = await SB.auth.getSession();
        if (data && data.session) await SB.auth.signOut().catch(() => { });   // cuenta de Supabase sin permiso aquí
        const s = this._sesionGuardada();
        if (!s || !s.token) return null;
        const p = await this._rpc('vota_yo', { p_token: s.token });
        if (!p) { this._olvidarSesion(); return null; }
        this._token = s.token;
        return (this.yo = p);
    },
    // Carga inicial de index.html: false si no hay una sesión válida (o si espera la aprobación del administrador)
    async init() {
        const yo = await this.revisarSesion();
        if (!yo || yo.pendiente) return false;
        await this._escuchar();
        return true;
    },
    session() { return this.yo; },
    async logout() {
        await this.log('Cierre de sesión');
        await this.cerrarSesionForzada();
    },

    async instalado() { return !!(await this._rpc('vota_publico')).instalado; },
    // Primera instalación: una cuenta de Supabase que ya existe queda como primer administrador (solo una vez)
    async instalar({ nombre, correo, pass }) {
        const r = await SB.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: pass });
        if (r.error) return { error: this._errAuth(r.error) };
        let res;
        try { res = await this._rpc('vota_instalar', { p_nombre: nombre }); }
        catch (e) { await SB.auth.signOut().catch(() => { }); return { error: this._errAuth(e) }; }
        if (res.error) { await SB.auth.signOut().catch(() => { }); return { error: res.error }; }
        this.yo = await this._perfilAdmin();
        await this.log('Sistema instalado', 'Primer administrador');
        return this.yo;
    },
    async loginAdmin(correo, pass) {
        const r = await SB.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: pass });
        if (r.error) return { error: this._errAuth(r.error) };
        const p = await this._perfilAdmin().catch(() => null);
        if (!p) { await SB.auth.signOut().catch(() => { }); return { error: 'Esta cuenta no tiene permisos de administrador en ADEP Vota.' }; }
        this.yo = p;
        await this.log('Ingreso al sistema', 'Administrador');
        return p;
    },
    // «Olvidé mi contraseña» de un administrador: Supabase envía un enlace a su correo
    async olvideClave(correo) {
        const nativa = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
        const destino = nativa ? this.URL_PUBLICADA + 'login.html' : new URL('login.html', location.href).href;
        await SB.auth.resetPasswordForEmail(correo.trim().toLowerCase(), { redirectTo: destino });
    },
    // ¿Se abrió la página desde el enlace del correo para crear una contraseña nueva?
    vieneDeRecuperacion() { return /type=recovery/.test(location.hash) || /type=recovery/.test(location.search); },
    async cambiarMiClave(pass) {
        const { error } = await SB.auth.updateUser({ password: pass });
        return error ? { error: this._errAuth(error) } : { ok: true };
    },
    // ¿Cómo entra esta cédula? → 'activa' (con clave) | 'dispositivo' (ya está en un celular) | 'sin-activar'
    estadoCedula(cedula) { return this._rpc('vota_estado_cedula', { p_cedula: this._norm(cedula) }); },
    // Ajustes que se ven antes de iniciar sesión (WhatsApp de ayuda de ADEP)
    async ajustesPublicos() {
        try { return (await this._rpc('vota_publico')) || {}; }
        catch { return {}; }
    },
    async setEnlaceApp(url) {
        await this._rpc('vota_guardar_config', { p_clave: 'publico', p_valor: { enlaceApp: url || '' } });
        this.log('Enlace de descarga de la app actualizado', url ? 'con enlace' : 'sin enlace');
    },
    async setWhatsappAyuda(numero) {
        await this._rpc('vota_guardar_config', { p_clave: 'publico', p_valor: { whatsappAyuda: numero || '' } });
        this.log('WhatsApp de ayuda actualizado', numero || 'sin número');
    },
    async loginAfiliado(cedula, pin) {
        const ced = this._norm(cedula);
        let r;
        try {
            if ((await this.estadoCedula(ced)) === 'sin-activar')
                return { error: 'Esta cédula todavía no tiene la cuenta activada. Toque «Cambiar», escriba su cédula y luego el código de activación que le dio ADEP.', sinActivar: true };
            r = await this._rpc('vota_login', { p_cedula: ced, p_pin: String(pin) });
        } catch (e) { return { error: this._errAuth(e) }; }
        if (r.error) return { error: r.error };
        this._guardarSesion(ced, r.token, 'clave');
        this.yo = r.perfil;
        await this.log('Ingreso al sistema', 'Afiliado');
        return this.yo;
    },
    // ================= Ingreso con el código general =================
    _dispositivo() {
        const ua = navigator.userAgent;
        const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Otro';
        const app = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
        const nav = app ? 'app ADEP Vota' : /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
        return `${so} · ${nav}`;
    },
    // Este celular ya tiene la cédula: entra sin pedir nada
    async entrarDispositivo(cedula) {
        const ced = this._norm(cedula), k = this._llave(ced);
        if (!k) return null;
        let p;
        try { p = await this._rpc('vota_yo', { p_token: k }); }
        catch (e) { console.error(e); return null; }
        if (!p) { try { localStorage.removeItem('adep_llave_' + ced); } catch { } return null; }
        this._guardarSesion(ced, k, 'dispositivo');
        this.yo = p;
        if (!p.pendiente) await this.log('Ingreso al sistema', 'Afiliado (celular reconocido)');
        return p;
    },
    // Aviso al administrador: alguien intentó entrar con una cédula que ya está en otro celular
    avisarIntento(cedula) {
        return this._rpc('vota_avisar_intento', { p_cedula: this._norm(cedula).slice(0, 15) }).catch(e => console.error(e));
    },
    async ingresarConCodigo(cedula, codigo) {
        const ced = this._norm(cedula), cod = String(codigo || '').replace(/\D/g, '');
        if (cod.length !== 6) return { error: 'El código de ingreso tiene 6 números.' };
        let r;
        try { r = await this._rpc('vota_ingresar_codigo', { p_cedula: ced, p_codigo: cod, p_dispositivo: this._dispositivo() }); }
        catch (e) { return { error: this._errAuth(e) }; }
        if (r.error) {
            if (r.enUso) this.avisarIntento(ced);
            return { error: r.error, ...(r.enUso ? { enUso: true } : {}) };
        }
        this._guardarSesion(ced, r.token, 'dispositivo');
        this.yo = r.perfil;
        if (!this.yo.pendiente) await this.log('Ingreso con código general', this.yo.nombre);
        return this.yo;
    },
    // Esperando la aprobación del administrador: avisa cuando lo aprueban (true) o lo rechazan (false).
    // Devuelve una función para dejar de esperar.
    esperarAprobacion(fn) {
        let listo = false;
        const revisar = async () => {
            if (listo) return;
            let p;
            try { p = await this._rpc('vota_yo', { p_token: this._token }); } catch { return; }   // sin internet: sigue esperando
            if (listo) return;
            if (!p) { listo = true; clearInterval(t); fn(false); }
            else if (!p.pendiente) { listo = true; clearInterval(t); this.yo = p; fn(true); }
        };
        const t = setInterval(revisar, 5000);
        return () => { listo = true; clearInterval(t); };
    },
    // Afiliado conectado: avisa (fn) en cuanto el administrador lo borra, lo desactiva o libera su cédula
    // (se revisa cada vez que se actualizan los datos). Si la cuenta ya no es suya, se olvida la llave de este celular.
    vigilarCuenta(fn) {
        if (!this.yo || this.yo.rol !== 'Afiliado') return;
        this._alSalir = fn;
    },
    _fuera(olvidar) {
        if (this._avisadoFuera || !this._alSalir) return;
        this._avisadoFuera = true;
        if (olvidar) try { localStorage.removeItem('adep_llave_' + this.yo.cedula); } catch { }
        this._alSalir();
    },
    // Cierre de sesión hecho por el sistema
    async cerrarSesionForzada() {
        this._detener();
        if (this.yo && this.yo.rol === 'Administrador') await SB.auth.signOut().catch(() => { });
        else if (this._token) await this._rpc('vota_salir', { p_token: this._token }).catch(() => { });
        this._olvidarSesion();
        this.yo = null;
    },

    // ---- Administrador ----
    ingreso() { return this._ingreso; },
    alertas() { return this._alertas; },
    genCodigoIngreso() { return this._azar(6, '0123456789'); },
    async setIngreso(cambios, accion, detalle) {
        this._ingreso = { ...(this._ingreso || {}), ...cambios };
        await this._rpc('vota_guardar_config', { p_clave: 'ingreso', p_valor: cambios });
        if (accion) this.log(accion, detalle || '');
    },
    aprobarIngreso(cedula) {
        const a = this._afiliados[cedula]; if (!a) return false;
        return this._cambiarAfiliado(cedula, { pendiente: false }, 'Ingreso aprobado', `${a.nombre} (${cedula})`);
    },
    // Quita la cédula del celular donde está: ese celular queda fuera y la cédula puede entrar de nuevo
    async liberarCedula(cedula, motivo) {
        const a = this._afiliados[cedula]; if (!a) return false;
        try { await this._rpc('vota_liberar', { p_cedula: cedula }); } catch (e) { this._falla(e); return false; }
        Object.assign(a, { uid: null, activado: false, pendiente: false, dispositivo: '' });
        this.log(motivo || 'Cédula liberada', `${a.nombre} (${cedula})`);
        return true;
    },
    async borrarAlerta(id) {
        this._alertas = this._alertas.filter(a => a.id !== id);
        const { error } = await SB.from('vota_alertas').delete().eq('id', id);
        if (error) this._falla(error);
    },

    // Primera vez: con el código de activación, el afiliado crea su propia clave de 6 números
    async activar(cedula, codigo, pin) {
        const ced = this._norm(cedula), cod = this._limpiarCodigo(codigo);
        if (cod.length !== 8) return { error: 'El código de activación tiene 8 letras y números (por ejemplo K7P2-9QXM).' };
        let r;
        try { r = await this._rpc('vota_activar', { p_cedula: ced, p_codigo: cod, p_pin: String(pin) }); }
        catch (e) { return { error: this._errAuth(e) }; }
        if (r.error) return { error: r.error };
        this._guardarSesion(ced, r.token, 'clave');
        this.yo = r.perfil;
        await this.log('Cuenta activada', this.yo.nombre);
        return this.yo;
    },

    // ================= Reloj del servidor =================
    // La apertura y el cierre los decide la hora del servidor. Si el celular tiene la hora adelantada
    // o atrasada, la pantalla mostraría «cerrada» o «abierta» por error: se mide la diferencia
    // con el servidor (2 mediciones, se usa la más rápida) y se corrige. Cada 5 min y al volver internet.
    ahora() { return Date.now() + this._desfase; },
    async sincronizarReloj() {
        if (this._midiendo) return;
        this._midiendo = true;
        try {
            const m = [];
            for (let i = 0; i < 2; i++) {
                try {
                    const t0 = Date.now(), srv = Number(await this._rpc('vota_hora')), t1 = Date.now();
                    if (srv > 0) m.push({ desfase: srv - (t0 + t1) / 2, demora: t1 - t0 });
                } catch (e) { console.warn('Reloj', e); }
            }
            if (m.length) {
                const mejor = m.sort((a, b) => a.demora - b.demora)[0], antes = this._desfase;
                this._desfase = Math.abs(mejor.desfase) < 500 ? 0 : Math.round(mejor.desfase);   // menos de medio segundo no importa
                this.relojSincronizado = true;
                if (Math.abs(antes - this._desfase) > 1000) this._redibujar();
            }
        } finally { this._midiendo = false; }
    },
    _iniciarReloj() {
        if (this._relojIniciado) return;
        this._relojIniciado = true;
        this.sincronizarReloj();
        setInterval(() => this.sincronizarReloj(), 5 * 60 * 1000);
        window.addEventListener('online', () => this.sincronizarReloj());
    },

    // ================= Datos (se actualizan solos) =================
    _redibujar() {
        clearTimeout(this._t);
        this._t = setTimeout(() => { if (typeof renderAll === 'function') renderAll(); }, 250);
    },
    // Guarda una parte de los datos; true si cambió desde la última vez
    _poner(parte, valor, fn) {
        const firma = JSON.stringify(valor);
        if (this._firmas[parte] === firma) return false;
        this._firmas[parte] = firma;
        fn(valor); this._votesCache = null;
        return true;
    },
    // Lee una tabla completa (Supabase entrega de a 1000 filas)
    async _todo(tabla, orden, asc = true, max = Infinity) {
        const out = [];
        for (let i = 0; i < max; i += 1000) {
            let q = SB.from(tabla).select('*').range(i, Math.min(i + 999, max - 1));
            if (orden) q = q.order(orden, { ascending: asc });
            const { data, error } = await q;
            if (error) throw error;
            out.push(...data);
            if (data.length < 1000) break;
        }
        return out;
    },
    _conteo(c) { const o = { total: c.total }; (c.c || []).forEach((n, i) => { o['c' + i] = n; }); return o; },
    async _cargarAfiliado() {
        const d = await this._rpc('vota_datos', { p_token: this._token });
        if (d.error) {
            if (d.error === 'sesion') this._fuera(true);
            else if (d.error === 'desactivado') this._fuera(false);
            return false;
        }
        let cambio = false;
        cambio = this._poner('polls', d.polls, v => { this._polls = v.map(p => ({ ...p, id: Number(p.id) })).sort((a, b) => a.id - b.id); }) || cambio;
        cambio = this._poner('conteos', d.conteos, v => { this._conteos = v; }) || cambio;
        cambio = this._poner('part', d.participacion, v => { this._part = v.map(r => ({ ...r, pollId: Number(r.pollId) })); }) || cambio;
        cambio = this._poner('votos', d.votos, v => { this._votos = v.map(x => ({ ...x, pollId: Number(x.pollId) })); }) || cambio;
        cambio = this._poner('config', d.config, v => { this._config = v || {}; }) || cambio;
        cambio = this._poner('padron', d.padron, v => { this._padron = v || 0; }) || cambio;
        cambio = this._poner('ayuda', d.ayuda || [], v => { this._ayuda = v.map(a => ({ ...a, pollId: Number(a.pollId), id: a.pollId + '_' + a.cedula })); }) || cambio;
        cambio = this._poner('solicitudes', d.solicitud ? [d.solicitud] : [], v => { this._solicitudes = v; }) || cambio;
        this.ayudaCargada = true;
        if (d.yo) this.yo = { ...this.yo, ...d.yo };
        return cambio;
    },
    async _cargarAdmin(conPadron) {
        const [polls, conteos, part, votos, config, alertas, admins, audit, padron, ayuda, solicitudes] = await Promise.all([
            this._todo('vota_polls', 'id'), this._todo('vota_conteos'), this._todo('vota_participacion'), this._todo('vota_votos'),
            this._todo('vota_config'), this._todo('vota_alertas', 'fecha', false, 50), this._todo('vota_admins'),
            this._todo('vota_auditoria', 'fecha', false, 1000), conPadron ? this._rpc('vota_padron') : null,
            this._todo('vota_ayuda', 'fecha'), this._todo('vota_solicitudes', 'fecha')
        ]);
        let cambio = false;
        cambio = this._poner('polls', polls, v => { this._polls = v.map(p => ({ ...p.datos, id: Number(p.id) })); }) || cambio;
        cambio = this._poner('conteos', conteos, v => { this._conteos = {}; v.forEach(c => { this._conteos[String(c.poll_id)] = this._conteo(c); }); }) || cambio;
        cambio = this._poner('part', part, v => { this._part = v.map(r => ({ pollId: Number(r.poll_id), cedula: r.cedula, fecha: r.fecha, codigo: r.codigo })); }) || cambio;
        cambio = this._poner('votos', votos, v => {
            this._votos = v.map(x => ({ pollId: Number(x.poll_id), cedula: x.cedula, nombre: x.nombre, filial: x.filial, opcion: x.opcion, idx: x.idx, codigo: x.codigo, fecha: x.fecha }));
        }) || cambio;
        cambio = this._poner('config', config, v => {
            const c = Object.fromEntries(v.map(x => [x.clave, x.valor]));
            this._config = c.general || {}; this._ingreso = c.ingreso || null;
        }) || cambio;
        cambio = this._poner('alertas', alertas, v => { this._alertas = v; }) || cambio;
        cambio = this._poner('admins', admins, v => { this._admins = {}; v.forEach(a => { this._admins[a.uid] = { ...a, cedula: a.uid }; }); }) || cambio;
        cambio = this._poner('audit', audit, v => { this._audit = v; }) || cambio;
        cambio = this._poner('ayuda', ayuda, v => {
            this._ayuda = v.map(a => ({ id: a.poll_id + '_' + a.cedula, pollId: Number(a.poll_id), cedula: a.cedula, nombre: a.nombre, motivo: a.motivo, nota: a.nota, fecha: a.fecha }));
        }) || cambio;
        cambio = this._poner('solicitudes', solicitudes, v => { this._solicitudes = v; }) || cambio;
        this.ayudaCargada = true;
        if (padron) cambio = this._poner('afiliados', padron, v => { this._afiliados = {}; v.forEach(a => { this._afiliados[a.cedula] = a; }); }) || cambio;
        return cambio;
    },
    // Vuelve a leer los datos; redibuja la pantalla solo si algo cambió
    async _refrescar(conPadron) {
        if (!this.yo) return;
        try {
            const admin = this.yo.rol === 'Administrador';
            if (await (admin ? this._cargarAdmin(conPadron) : this._cargarAfiliado())) this._redibujar();
        } catch (e) { console.error('Actualizar datos', e); }
    },
    async _escuchar() {
        this._iniciarReloj();
        const admin = this.yo.rol === 'Administrador';
        if (admin) await this._cargarAdmin(true); else await this._cargarAfiliado();
        let vueltas = 0;
        this._detener();
        // Cada 10 segundos (la lista de afiliados, cada minuto); en pausa mientras la página no se ve
        this._reloj = setInterval(() => {
            if (document.hidden) return;
            vueltas++;
            this._refrescar(admin && vueltas % 6 === 0);
        }, 10000);
        this._alVolver = () => { if (!document.hidden) this._refrescar(admin); };
        document.addEventListener('visibilitychange', this._alVolver);
    },
    _detener() {
        clearInterval(this._reloj);
        if (this._alVolver) document.removeEventListener('visibilitychange', this._alVolver);
    },
    // Compatibilidad: ajustes y "recordar cédula" (este último solo en el equipo)
    _get(k, d) {
        if (k === 'recordar') { try { return JSON.parse(localStorage.getItem('adep_' + k)) ?? d; } catch { return d; } }
        if (k === 'users') {
            const u = {};
            Object.values(this._afiliados).forEach(a => { u[a.cedula] = { ...a, rol: 'Afiliado' }; });
            Object.values(this._admins).forEach(a => { u[a.cedula] = { ...a, rol: 'Administrador' }; });
            return u;
        }
        const v = this._config[k];
        return v === undefined ? d : v;
    },
    _set(k, v) {
        if (k === 'recordar') { localStorage.setItem('adep_' + k, JSON.stringify(v)); return; }
        this._config = { ...this._config, [k]: v };
        this._rpc('vota_guardar_config', { p_clave: 'general', p_valor: { [k]: v } }).catch(e => this._falla(e));
    },

    // ================= Bitácora =================
    log(accion, detalle = '') {
        if (!this.yo) return Promise.resolve();
        const token = this.yo.rol === 'Administrador' ? null : this._token;
        if (this.yo.rol !== 'Administrador' && !token) return Promise.resolve();
        return this._rpc('vota_log', { p_token: token, p_accion: String(accion).slice(0, 120), p_detalle: String(detalle).slice(0, 300) })
            .catch(e => console.error('Bitácora', e));
    },
    auditoria() { return this._audit; },
    // Borra toda la bitácora; queda un único registro con quién la borró
    async limpiarAuditoria() {
        const n = await this._rpc('vota_limpiar_auditoria');
        await this.log('Bitácora borrada', `Se eliminaron ${n} registro(s)`);
        await this._refrescar();
        return n;
    },
    // Respaldo completo de este sistema (sin claves ni sesiones)
    respaldo() { return this._rpc('vota_respaldo'); },

    // ================= Afiliados (lista compartida con el carnet) =================
    afiliados() { return Object.values(this._afiliados); },
    padron() {
        if (this.yo && this.yo.rol === 'Administrador') return this.afiliados().filter(a => a.activo !== false).length;
        return this._padron || 0;
    },
    async addAfiliado({ nombre, cedula, provincia, telefono }) {
        const key = this._norm(cedula);
        if (!/^\d{9,12}$/.test(key)) return { error: 'La cédula debe tener de 9 a 12 números.' };
        if (this._afiliados[key]) return { error: 'Ya existe un afiliado con esa cédula.' };
        try { await this.crearAfiliados([{ nombre, cedula: key, provincia, telefono }], false); }
        catch (e) { this._falla(e, 'No se pudo guardar el afiliado.'); return { error: 'No se pudo guardar el afiliado.' }; }
        this.log('Afiliado creado', `${nombre} (${key})${provincia ? ' · ' + provincia : ''}`);
        return { cedula: key };
    },
    // Envía la lista de cambios a la base de datos en tandas de 500
    async _guardarAfiliados(items) {
        for (let i = 0; i < items.length; i += 500) await this._rpc('vota_guardar_afiliados', { p_lista: items.slice(i, i + 500) });
        await this._refrescar(true);
    },
    // Crea (o actualiza) muchos afiliados. Con conCodigo, cada uno con su código de activación personal. Devuelve [{...afiliado, codigo}]
    async crearAfiliados(lista, conCodigo = true) {
        const out = [], items = [];
        for (const a of lista) {
            const ced = this._norm(a.cedula);
            const item = { cedula: ced, nombre: a.nombre || '', provincia: a.provincia || '', telefono: a.telefono || '' };
            let codigo = '';
            if (conCodigo) { codigo = this.genActivacion(); item.hash = await this._huella(ced, codigo); }
            items.push(item);
            out.push({ ...a, cedula: ced, codigo });
        }
        await this._guardarAfiliados(items);
        return out;
    },
    // Códigos de activación nuevos: la cuenta anterior deja de funcionar. Devuelve { cédula: código }
    async nuevosCodigos(cedulas) {
        const out = {}, items = [];
        for (const ced of cedulas) {
            const codigo = this.genActivacion();
            items.push({ cedula: ced, hash: await this._huella(ced, codigo) });
            out[ced] = codigo;
        }
        await this._guardarAfiliados(items);
        return out;
    },
    async actualizarAfiliados(lista) {
        await this._guardarAfiliados(lista.map(a => ({ cedula: a.cedula, ...a.cambios })));
    },
    _cambiarAfiliado(cedula, cambios, accion, detalle) {
        const a = this._afiliados[cedula]; if (!a) return false;
        Object.assign(a, cambios);
        this._rpc('vota_cambiar_afiliado', { p_cedula: cedula, p_cambios: cambios })
            .then(() => this._refrescar(true)).catch(e => this._falla(e));
        this.log(accion, detalle);
        return true;
    },
    setFilial(cedula, provincia) {
        const a = this._afiliados[cedula]; if (!a) return false;
        return this._cambiarAfiliado(cedula, { provincia: provincia || '' }, 'Filial actualizada', `${a.nombre} (${cedula})${provincia ? ' · ' + provincia : ' · sin filial'}`);
    },
    setTelefono(cedula, telefono) {
        const a = this._afiliados[cedula]; if (!a) return false;
        return this._cambiarAfiliado(cedula, { telefono: telefono || '' }, 'Teléfono actualizado', `${a.nombre} (${cedula})`);
    },
    async resetPass(cedula) {
        const a = this._afiliados[cedula]; if (!a) return null;
        try {
            const r = await this.nuevosCodigos([cedula]);
            this.log('Nuevo código de activación', `${a.nombre} (${cedula})`);
            return r[cedula];
        } catch (e) { this._falla(e); return null; }
    },
    // Afiliado: activo/desactivado solo para votar (no le quita el carnet). Administrador: su cuenta.
    setActivo(id, activo) {
        const adm = this._admins[id];
        if (adm) {
            adm.activo = activo;
            SB.from('vota_admins').update({ activo }).eq('uid', id)
                .then(({ error }) => { if (error) this._falla(error); this._refrescar(); });
            this.log(activo ? 'Cuenta activada' : 'Cuenta desactivada', `${adm.nombre} (${adm.correo})`);
            return;
        }
        const a = this._afiliados[id]; if (!a) return;
        this._cambiarAfiliado(id, { activo }, activo ? 'Cuenta activada' : 'Cuenta desactivada', `${a.nombre} (${id})`);
    },
    // Quita al afiliado de la lista compartida (también del carnet hasta el próximo reporte mensual).
    deleteAfiliado(cedula) {
        const a = this._afiliados[cedula]; if (!a) return;
        delete this._afiliados[cedula];
        this._rpc('vota_eliminar_afiliado', { p_cedula: cedula, p_fecha: this._fechaTexto() })
            .then(() => this._refrescar(true)).catch(e => this._falla(e));
        this.log('Afiliado eliminado', `${a.nombre} (${cedula})`);
    },
    // Borra a TODOS los afiliados de la lista compartida (queda copia de cada uno en «eliminados»).
    // Los votos ya emitidos no se tocan. Quien tenga la sesión abierta sale. Devuelve cuántos se borraron.
    async borrarTodosAfiliados() {
        const n = await this._rpc('vota_eliminar_todos', { p_fecha: this._fechaTexto() });
        this.log('Todos los afiliados eliminados', `${n} afiliado(s)`);
        await this._refrescar(true);
        return n;
    },

    // ================= Administradores =================
    admins() { return Object.values(this._admins); },
    // Crea la cuenta (correo y contraseña) y le da permiso. Si el correo ya tenía cuenta, solo le da permiso.
    async addAdmin({ nombre, correo, pass }) {
        let r;
        try { r = await this._rpc('vota_crear_admin', { p_nombre: nombre, p_correo: correo.trim().toLowerCase(), p_pass: pass || '' }); }
        catch (e) { this._falla(e); return { error: 'No se pudo guardar el administrador. Revise que supabase/votaciones.sql esté actualizado en Supabase.' }; }
        if (r.error) return { error: r.error };
        this.log(r.nueva ? 'Administrador creado' : 'Permiso de administrador dado', `${nombre} (${r.correo})`);
        await this._refrescar();
        return { correo: r.correo, nueva: r.nueva };
    },
    // Su propia contraseña: se cambia aquí. La de otro administrador: se le envía un correo para cambiarla.
    async setPass(uid, pass) {
        const a = this._admins[uid]; if (!a) return { error: 'Administrador no encontrado.' };
        if (uid === this.yo.uid) {
            const r = await this.cambiarMiClave(pass);
            if (r.error) return r;
            this.log('Contraseña cambiada', `${a.nombre} (${a.correo})`);
            return { ok: true };
        }
        try { await this.olvideClave(a.correo); }
        catch (e) { return { error: this._errAuth(e) }; }
        this.log('Correo para cambiar contraseña enviado', `${a.nombre} (${a.correo})`);
        return { ok: true, correo: a.correo };
    },
    deleteAdmin(uid) {
        const a = this._admins[uid]; if (!a) return;
        delete this._admins[uid];
        this._rpc('vota_eliminar_admin', { p_uid: uid, p_fecha: this._fechaTexto() })
            .then(() => this._refrescar()).catch(e => this._falla(e));
        this.log('Administrador eliminado', `${a.nombre} (${a.correo})`);
    },

    // ================= Pedidos de ayuda y de corrección de datos =================
    escucharSolicitudes() { },   // se leen junto con lo demás, cada pocos segundos
    ayudas() { return this._ayuda; },
    miAyuda(pollId) { return this._ayuda.find(a => a.pollId === pollId && a.cedula === (this.yo && this.yo.cedula)); },
    async pedirAyuda(pollId, motivo, nota) {
        const poll = this._polls.find(p => p.id === pollId);
        if (!poll) return { error: 'Consulta no encontrada.' };
        let r;
        try { r = await this._rpc('vota_pedir_ayuda', { p_token: this._token, p_poll: pollId, p_motivo: motivo, p_nota: String(nota || '').slice(0, 200) }); }
        catch (e) { console.error(e); return { error: 'No se pudo enviar el pedido. Revise su conexión e intente de nuevo.' }; }
        if (r.error) return { error: r.error };
        this.log('Pedido de ayuda enviado', `Consulta: ${poll.titulo}`.slice(0, 120));
        await this._refrescar();
        return { ok: true };
    },
    async cancelarAyuda(pollId, cedula) {
        const admin = this.yo.rol === 'Administrador';
        try {
            if (admin) await this._rpc('vota_atender_ayuda', { p_poll: pollId, p_cedula: cedula });
            else await this._rpc('vota_cancelar_ayuda', { p_token: this._token, p_poll: pollId });
        } catch (e) { this._falla(e); return false; }
        if (admin) {
            const poll = this._polls.find(p => p.id === pollId), a = this._afiliados[cedula];
            this.log('Pedido de ayuda atendido', `${poll ? poll.titulo : pollId} · ${a ? a.nombre : cedula}`.slice(0, 120));
        }
        await this._refrescar();
        return true;
    },
    solicitudes() { return this._solicitudes; },
    async pedirCambioDatos({ nombre, provincia, telefono, nota }) {
        let r;
        try { r = await this._rpc('vota_pedir_cambio', { p_token: this._token, p_nombre: nombre, p_provincia: provincia || '', p_telefono: telefono || '', p_nota: nota || '' }); }
        catch (e) { console.error(e); return { error: 'No se pudo enviar el pedido. Revise su conexión e intente de nuevo.' }; }
        if (r.error) return { error: r.error };
        this.log('Pedido de corrección de datos enviado');
        await this._refrescar();
        return { ok: true };
    },
    async cancelarCambioDatos() {
        try { await this._rpc('vota_cancelar_cambio', { p_token: this._token }); }
        catch (e) { this._falla(e); return false; }
        await this._refrescar();
        return true;
    },
    async _resolverCambio(cedula, aprobar) {
        const a = this._afiliados[cedula], s = this._solicitudes.find(x => x.cedula === cedula);
        let r;
        try { r = await this._rpc('vota_resolver_cambio', { p_cedula: cedula, p_aprobar: aprobar }); }
        catch (e) { this._falla(e); return { error: 'No se pudo guardar.' }; }
        if (r.error) return { error: r.error };
        this.log(aprobar ? 'Datos de afiliado corregidos (por pedido)' : 'Pedido de corrección de datos rechazado',
            `${a ? a.nombre : ''}${aprobar && s ? ' → ' + s.nombre : ''} (${cedula})`.slice(0, 300));
        await this._refrescar(true);
        return { ok: true };
    },
    aprobarCambioDatos(cedula) { return this._resolverCambio(cedula, true); },
    async rechazarCambioDatos(cedula) { return !(await this._resolverCambio(cedula, false)).error; },

    // ================= Votaciones =================
    polls() { return this._polls; },
    estado(p) {
        if (!p.publicada) return 'borrador';
        const now = this.ahora();
        if (p.apertura && now < new Date(p.apertura).getTime()) return 'programada';
        if (p.cierre && now >= new Date(p.cierre).getTime()) return 'cerrada';
        return 'abierta';
    },
    // Visible para los afiliados. Una consulta programada sin «Publicar de inmediato» aparece sola a la hora de apertura.
    visible(p) {
        return !!p.publicada && !(p.ocultaHastaApertura && this.estado(p) === 'programada');
    },
    // Devuelve la consulta cuando quedó guardada en la nube, o null si no se pudo
    async addPoll(p) {
        if ((p.opciones || []).length > this.MAX_OPCIONES) { this._falla(null, `Máximo ${this.MAX_OPCIONES} opciones por consulta.`); return null; }
        const poll = { id: Date.now(), publicada: false, publica: false, apertura: '', cierre: '', ...p, creada: new Date().toISOString() };
        const { id, ...datos } = poll;
        const { error } = await SB.from('vota_polls').insert({ id, datos: { ...datos, aperturaMs: this._ms(poll.apertura), cierreMs: this._ms(poll.cierre) } });
        if (error) { this._falla(error, 'No se pudo guardar la consulta.'); return null; }
        this.log('Consulta creada', poll.titulo);
        await this._refrescar();
        return poll;
    },
    updatePoll(id, changes, motivo) {
        const c = { ...changes };
        if ('apertura' in c) c.aperturaMs = this._ms(c.apertura);
        if ('cierre' in c) c.cierreMs = this._ms(c.cierre);
        const p = this._polls.find(x => x.id === id);
        if (p) Object.assign(p, c);
        this._rpc('vota_cambiar_poll', { p_id: id, p_cambios: c }).then(() => this._refrescar()).catch(e => this._falla(e));
        if (motivo) this.log(motivo);
    },
    async deletePoll(id) {
        const p = this._polls.find(x => x.id === id);
        const { error } = await SB.from('vota_polls').delete().eq('id', id);   // borra también sus votos y conteos
        if (error) { this._falla(error, 'No se pudo eliminar la consulta.'); return; }
        if (p) this.log('Consulta eliminada', p.titulo);
        await this._refrescar();
    },

    // ================= Votos =================
    // Lista de votos como antes: los secretos se reconstruyen desde el conteo (no tienen dueño)
    votes() {
        if (this._votesCache) return this._votesCache;
        const out = [];
        this._polls.forEach(p => {
            if (p.publica) {
                this._votos.filter(v => v.pollId === p.id)
                    .forEach(v => out.push({ pollId: p.id, opcion: v.opcion, cedula: v.cedula, nombre: v.nombre, filial: v.filial || (this._afiliados[v.cedula] || {}).provincia || '', fecha: v.fecha, hash: v.codigo, publica: true }));
                return;
            }
            const c = this._conteos[String(p.id)] || {};
            p.opciones.forEach((o, i) => { for (let k = 0; k < (c['c' + i] || 0); k++) out.push({ pollId: p.id, opcion: o, publica: false }); });
        });
        return (this._votesCache = out);
    },
    // Cuántos afiliados votaron en la consulta (total del conteo)
    participantes(pollId) {
        const c = this._conteos[String(pollId)];
        return c ? c.total || 0 : 0;
    },
    // Quién votó en consultas secretas (sin la opción). El afiliado solo ve lo suyo.
    voters() {
        const publica = new Set(this._polls.filter(p => p.publica).map(p => p.id));
        return this._part.filter(r => !publica.has(r.pollId));
    },
    hasVoted(pollId, cedula) {
        return this._part.some(r => r.pollId === pollId && r.cedula === cedula)
            || this._votos.some(v => v.pollId === pollId && v.cedula === cedula);
    },
    async addVote(v) {
        const poll = this._polls.find(p => p.id === v.pollId);
        if (!poll || this.estado(poll) !== 'abierta') return { error: 'Esta consulta no está abierta para votar.' };
        const idx = poll.opciones.indexOf(v.opcion);
        if (idx < 0 || idx >= this.MAX_OPCIONES) return { error: 'La opción elegida no es válida.' };
        if (this.hasVoted(poll.id, this.yo.cedula)) return { error: 'Ya emitió su voto en esta consulta.' };
        const ahora = new Date();
        let r;
        try {
            r = await this._rpc('vota_votar', { p_token: this._token, p_poll: poll.id, p_idx: idx,
                p_fecha: ahora.toLocaleString('es-CR'), p_dia: ahora.toLocaleDateString('es-CR') });
        } catch (e) {
            console.error(e);
            return { error: 'No se pudo registrar el voto. Revise su conexión e intente de nuevo. Recuerde que solo se puede votar una vez.' };
        }
        if (r.error) return { error: r.error };
        this.log('Voto emitido', `Consulta: ${poll.titulo}`.slice(0, 120));
        await this._refrescar();
        return { pollId: poll.id, opcion: v.opcion, hash: r.codigo, fecha: r.fecha };
    },
    asegurarCodigo(pollId, cedula) {
        const r = this._part.find(x => x.pollId === pollId && x.cedula === cedula);
        return r ? r.codigo || '' : '';
    },
    // Restaurar un voto por equivocación: el afiliado podrá votar de nuevo.
    // Voto público: se quita su voto. Voto secreto: se quita un voto de la opción que el afiliado indica.
    async restaurarVoto(pollId, cedula, opcion) {
        const poll = this._polls.find(p => p.id === pollId);
        if (!poll) return { error: 'Consulta no encontrada.' };
        if (this.estado(poll) !== 'abierta') return { error: 'Solo se puede restaurar un voto mientras la consulta está abierta.' };
        if (!this._part.find(r => r.pollId === pollId && r.cedula === cedula)) return { error: 'Este afiliado no ha votado.' };
        let idx = null;
        if (!poll.publica) {
            idx = poll.opciones.indexOf(opcion);
            if (idx < 0 || !((this._conteos[String(pollId)] || {})['c' + idx] > 0)) return { error: 'No hay votos registrados con esa opción.' };
        }
        let r;
        try { r = await this._rpc('vota_restaurar', { p_poll: pollId, p_cedula: cedula, p_idx: idx }); }
        catch (e) { this._falla(e); return { error: 'No se pudo restaurar el voto.' }; }
        if (r.error) return { error: r.error };
        const a = this._afiliados[cedula];
        this.log('Voto restaurado', `${poll.titulo} · ${a ? a.nombre : cedula}`.slice(0, 120));
        await this._refrescar();
        return { ok: true };
    },
    async verify(code) {
        const c = String(code).trim().toUpperCase();
        if (!/^ADEP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null;
        let d;
        try { d = await this._rpc('vota_verificar', { p_token: this._token, p_codigo: c }); } catch { return null; }
        return d ? { titulo: d.titulo, fecha: d.fecha } : null;
    }
};
