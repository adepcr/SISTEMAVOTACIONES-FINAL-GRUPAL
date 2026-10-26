/* db.js - ADEP Vota · datos en Firestore protegidos por Firebase Authentication y reglas de seguridad
   (ver firestore.rules). Mantiene la misma forma de uso que antes (DB.polls(), DB.votes(), ...):
   lee de una copia en memoria que Firestore actualiza en tiempo real, y escribe en la nube.

   Colecciones:
     admins/{uid}            administradores
     afiliados/{cédula}      padrón (uid = cuenta de Firebase enlazada al activarse)
     activaciones/{cédula}   huella SHA-256 del código de activación (nunca el código)
     acceso/{cédula}         correo interno de la cuenta, para poder ingresar con la cédula (tipo 'dispositivo': entró con el código general)
     ingresos/{cédula}       celular (cuenta) que entró con el código general: una cédula, un celular
     alertas/{auto}          intentos de entrar con una cédula que ya está en otro celular
     cuentas/{uid}           cuenta de Firebase → cédula
     polls/{id}              consultas
     conteos/{id}            votos por opción (c0..c9, total). El voto secreto vive SOLO aquí.
     participacion/{id_céd}  quién votó (nunca qué eligió) + código del comprobante
     votos/{id_céd}          votos de consultas públicas (con nombre)
     codigos/{código}        códigos de verificación de comprobantes
     auditoria/{auto}        bitácora
     config/general          ajustes (práctica, cantidad de afiliados activos)
     config/ingreso          código general de ingreso para afiliados (solo administradores)
     config/instalado        existe cuando ya se creó el primer administrador */
const DB = {
    DOMINIO: 'afiliados.adepvota.cr',   // correos internos de las cuentas de afiliados (no reciben correo)
    MAX_OPCIONES: 10,

    yo: null,
    _polls: [], _conteos: {}, _part: [], _votos: [], _afiliados: {}, _admins: {}, _audit: [], _config: {}, _ingreso: null, _alertas: [],
    _votesCache: null,

    // ================= Utilidades =================
    _norm(id) { return String(id).toLowerCase().replace(/[\s-]/g, ''); },
    _ref(...ruta) { return FB.doc(FB.db, ...ruta.map(String)); },
    _col(nombre) { return FB.collection(FB.db, nombre); },
    _ms(iso) { return iso ? new Date(iso).getTime() : 0; },
    _falla(e, msg) {
        console.error(e);
        const c = (e && e.code) || '';
        let causa = '';
        if (c.includes('permission-denied')) causa = ' (Sin permiso: revise que las reglas de seguridad publicadas en Firebase sean las más recientes.)';
        else if (c.includes('unavailable') || c.includes('network')) causa = ' (Sin conexión a internet.)';
        else if (e && e.message) causa = ` (Detalle: ${e.message.slice(0, 120)})`;
        if (typeof showToast === 'function') showToast((msg || 'No se pudo guardar el cambio. Revise su conexión e intente de nuevo.') + causa);
    },
    // Firebase pide contraseñas más largas: la clave de 6 números se completa siempre igual
    _claveAuth(pin) { return 'ADEP#' + pin + '#Vota'; },
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
    // Huella SHA-256 del código (base64 "url", la misma que calculan las reglas de seguridad)
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
        const c = (e && e.code) || '';
        if (c.includes('too-many-requests')) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
        if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-login'))
            return 'Los datos de ingreso no son correctos. Revise e intente de nuevo.';
        if (c.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo.';
        if (c.includes('invalid-email')) return 'El correo no es válido.';
        if (c.includes('weak-password')) return 'La contraseña es muy débil. Use al menos 8 caracteres.';
        if (c.includes('network')) return 'No hay conexión a internet. Revise e intente de nuevo.';
        if (c.includes('requires-recent-login')) return 'Por seguridad, cierre sesión, vuelva a entrar e intente de nuevo.';
        console.error(e);
        return 'No se pudo completar. Intente de nuevo en unos minutos.';
    },

    // ================= Sesión =================
    _esperarSesion() {
        return new Promise(ok => { const fin = FB.onAuthStateChanged(FB.auth, u => { fin(); ok(u); }); });
    },
    async _perfil(u) {
        const leer = r => FB.getDoc(r).catch(() => null);
        const adm = await leer(this._ref('admins', u.uid));
        if (adm && adm.exists() && adm.data().activo !== false) {
            const d = adm.data();
            return { uid: u.uid, rol: 'Administrador', nombre: d.nombre, correo: d.correo, cedula: u.uid, provincia: '' };
        }
        const c = await leer(this._ref('cuentas', u.uid));
        if (!c || !c.exists()) return null;
        const ced = c.data().cedula;
        const a = await leer(this._ref('afiliados', ced));
        if (!a || !a.exists()) return null;
        const d = a.data();
        if (d.uid !== u.uid || d.activo === false) return null;
        return { uid: u.uid, rol: 'Afiliado', nombre: d.nombre, cedula: ced, provincia: d.provincia || '', telefono: d.telefono || '', pendiente: d.pendiente === true };
    },
    // Sesión guardada en este equipo (para la pantalla de ingreso)
    async revisarSesion() {
        const u = await this._esperarSesion();
        if (!u) return null;
        this.yo = await this._perfil(u);
        if (!this.yo) await FB.signOut(FB.auth);
        return this.yo;
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
        await FB.signOut(FB.auth);
        this.yo = null;
    },

    async instalado() {
        const s = await FB.getDoc(this._ref('config', 'instalado'));
        return s.exists();
    },
    // Primera instalación: crea la cuenta del primer administrador (solo funciona una vez)
    async instalar({ nombre, correo, pass }) {
        let cred;
        try { cred = await FB.createUserWithEmailAndPassword(FB.auth, correo.trim().toLowerCase(), pass); }
        catch (e) { return { error: this._errAuth(e) }; }
        const uid = cred.user.uid, b = FB.writeBatch(FB.db);
        b.set(this._ref('admins', uid), { nombre, correo: correo.trim().toLowerCase(), activo: true, creada: new Date().toISOString() });
        b.set(this._ref('config', 'instalado'), { en: new Date().toISOString() });
        try { await b.commit(); }
        catch (e) {
            await FB.deleteUser(cred.user).catch(() => { });
            return { error: 'El sistema ya tiene un administrador. Ingrese con su cuenta o pida una a otro administrador.' };
        }
        await FB.setDoc(this._ref('config', 'general'), { practica_activa: true, padron: 0 }, { merge: true }).catch(() => { });
        this.yo = await this._perfil(cred.user);
        await this.log('Sistema instalado', 'Primer administrador creado');
        return this.yo;
    },
    async loginAdmin(correo, pass) {
        let cred;
        try { cred = await FB.signInWithEmailAndPassword(FB.auth, correo.trim().toLowerCase(), pass); }
        catch (e) { return { error: this._errAuth(e) }; }
        const p = await this._perfil(cred.user);
        if (!p || p.rol !== 'Administrador') { await FB.signOut(FB.auth); return { error: 'Esta cuenta no tiene permisos de administrador.' }; }
        this.yo = p;
        await this.log('Ingreso al sistema', 'Administrador');
        return p;
    },
    // ¿Cómo entra esta cédula? → 'activa' (con clave) | 'dispositivo' (ya está en un celular) | 'sin-activar'
    async estadoCedula(cedula) {
        const s = await FB.getDoc(this._ref('acceso', this._norm(cedula)));
        if (!s.exists()) return 'sin-activar';
        return s.data().tipo === 'dispositivo' ? 'dispositivo' : 'activa';
    },
    // Ajustes que se ven antes de iniciar sesión (WhatsApp de ayuda de ADEP)
    async ajustesPublicos() {
        try { const s = await FB.getDoc(this._ref('config', 'publico')); return s.exists() ? s.data() : {}; }
        catch { return {}; }
    },
    async setEnlaceApp(url) {
        await FB.setDoc(this._ref('config', 'publico'), { enlaceApp: url || '' }, { merge: true });
        this.log('Enlace de descarga de la app actualizado', url ? 'con enlace' : 'sin enlace');
    },
    async setWhatsappAyuda(numero) {
        await FB.setDoc(this._ref('config', 'publico'), { whatsappAyuda: numero || '' }, { merge: true });
        this.log('WhatsApp de ayuda actualizado', numero || 'sin número');
    },
    async loginAfiliado(cedula, pin) {
        const ced = this._norm(cedula);
        let acc;
        try { acc = await FB.getDoc(this._ref('acceso', ced)); }
        catch (e) { return { error: this._errAuth(e) }; }
        if (!acc.exists()) return { error: 'Esta cédula todavía no tiene la cuenta activada. Toque «Cambiar», escriba su cédula y luego el código de activación que le dio ADEP.', sinActivar: true };
        let cred;
        try { cred = await FB.signInWithEmailAndPassword(FB.auth, acc.data().email, this._claveAuth(pin)); }
        catch (e) { return { error: this._errAuth(e).replace('Los datos de ingreso no son correctos', 'La cédula o la clave no son correctas') }; }
        const p = await this._perfil(cred.user);
        if (!p) { await FB.signOut(FB.auth); return { error: 'Su cuenta fue desactivada o su acceso fue renovado. Comuníquese con ADEP.' }; }
        this.yo = p;
        await FB.updateDoc(this._ref('afiliados', ced), { ultimoIngreso: new Date().toISOString() }).catch(() => { });
        await this.log('Ingreso al sistema', 'Afiliado');
        return p;
    },
    // ================= Ingreso con el código general =================
    // La primera vez se crea una cuenta propia de este celular (con datos al azar que quedan guardados aquí);
    // las reglas solo la enlazan a la cédula si el código está vigente y la cédula no está en otro celular.
    _llave(ced) { try { return JSON.parse(localStorage.getItem('adep_llave_' + ced)); } catch { return null; } },
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
        try { await FB.signInWithEmailAndPassword(FB.auth, k.email, k.pass); }
        catch (e) {
            if (!String(e.code || '').includes('network')) localStorage.removeItem('adep_llave_' + ced);
            return null;
        }
        const p = await this._perfil(FB.auth.currentUser);
        if (!p) { localStorage.removeItem('adep_llave_' + ced); await FB.signOut(FB.auth); return null; }
        this.yo = p;
        if (!p.pendiente) {
            await FB.updateDoc(this._ref('afiliados', ced), { ultimoIngreso: new Date().toISOString() }).catch(() => { });
            await this.log('Ingreso al sistema', 'Afiliado (celular reconocido)');
        }
        return p;
    },
    // Aviso al administrador: alguien intentó entrar con una cédula que ya está en otro celular
    avisarIntento(cedula) {
        return FB.addDoc(this._col('alertas'), { cedula: this._norm(cedula).slice(0, 15), fecha: FB.serverTimestamp() }).catch(e => console.error(e));
    },
    async ingresarConCodigo(cedula, codigo) {
        const ced = this._norm(cedula), cod = String(codigo || '').replace(/\D/g, '');
        if (cod.length !== 6) return { error: 'El código de ingreso tiene 6 números.' };
        const llave = { email: `${ced}.${this._azar(8, 'abcdefghijkmnpqrstuvwxyz23456789')}@${this.DOMINIO}`, pass: this._azar(24, 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789') };
        let cred;
        try { cred = await FB.createUserWithEmailAndPassword(FB.auth, llave.email, llave.pass); }
        catch (e) { return { error: this._errAuth(e) }; }
        const u = cred.user;
        // Si el administrador pide aprobar cada ingreso, se prueba primero como pendiente
        for (const pendiente of [false, true]) {
            const b = FB.writeBatch(FB.db);
            b.set(this._ref('ingresos', ced), { uid: u.uid, codigo: cod, fecha: FB.serverTimestamp() });
            b.update(this._ref('afiliados', ced), { uid: u.uid, activado: true, authEmail: llave.email, ultimoIngreso: new Date().toISOString(), pendiente, dispositivo: this._dispositivo() });
            b.set(this._ref('cuentas', u.uid), { cedula: ced });
            b.set(this._ref('acceso', ced), { email: llave.email, tipo: 'dispositivo' });
            try {
                await b.commit();
                localStorage.setItem('adep_llave_' + ced, JSON.stringify(llave));
                this.yo = await this._perfil(u);
                if (this.yo && !this.yo.pendiente) await this.log('Ingreso con código general', this.yo.nombre);
                return this.yo || { error: 'No se pudo completar. Intente de nuevo.' };
            } catch (e) { if (!String(e.code || '').includes('permission')) { console.error(e); break; } }
        }
        await FB.deleteUser(u).catch(() => FB.signOut(FB.auth));
        // ¿Otro celular se adelantó con esta cédula?
        if ((await this.estadoCedula(ced).catch(() => '')) === 'dispositivo') { this.avisarIntento(ced); return { error: 'Esta cédula ya se está usando en otro celular. Si no fue usted, comuníquese con ADEP.', enUso: true }; }
        return { error: 'El código de ingreso no es correcto o ya venció. Revíselo o pídalo de nuevo a ADEP. Si su cédula no está registrada, comuníquese con ADEP.' };
    },
    // Esperando la aprobación del administrador: avisa cuando lo aprueban (true) o lo rechazan (false)
    esperarAprobacion(fn) {
        return FB.onSnapshot(this._ref('afiliados', this.yo.cedula), s => {
            const d = s.exists() ? s.data() : null;
            if (d && d.uid === this.yo.uid && d.activo !== false && d.pendiente !== true) fn(true);
        }, () => fn(false));
    },
    // Afiliado conectado: avisa (fn) en cuanto el administrador lo borra, lo desactiva o libera su cédula.
    // Si la cuenta ya no es suya (borrada o liberada) también se olvida la llave de este celular.
    vigilarCuenta(fn) {
        if (!this.yo || this.yo.rol !== 'Afiliado') return;
        const { cedula, uid } = this.yo;
        let avisado = false;
        const fuera = olvidar => {
            if (avisado) return;
            avisado = true;
            if (olvidar) try { localStorage.removeItem('adep_llave_' + cedula); } catch { }
            fn();
        };
        FB.onSnapshot(this._ref('afiliados', cedula), s => {
            const d = s.exists() ? s.data() : null;
            if (!d || d.uid !== uid) fuera(true);
            else if (d.activo === false) fuera(false);
        }, e => {
            // Las reglas niegan la lectura apenas el documento se borra o deja de ser de esta cuenta
            if (String(e.code || '').includes('permission')) fuera(true); else console.error(e);
        });
    },
    // Cierre de sesión hecho por el sistema (no deja registro: la cuenta ya no tiene permiso de escribir)
    async cerrarSesionForzada() {
        await FB.signOut(FB.auth).catch(() => { });
        this.yo = null;
    },

    // ---- Administrador ----
    ingreso() { return this._ingreso; },
    alertas() { return this._alertas; },
    genCodigoIngreso() { return this._azar(6, '0123456789'); },
    async setIngreso(cambios, accion, detalle) {
        await FB.setDoc(this._ref('config', 'ingreso'), cambios, { merge: true });
        if (accion) this.log(accion, detalle || '');
    },
    aprobarIngreso(cedula) {
        const a = this._afiliados[cedula]; if (!a) return false;
        return this._cambiarAfiliado(cedula, { pendiente: false }, 'Ingreso aprobado', `${a.nombre} (${cedula})`);
    },
    // Quita la cédula del celular donde está: ese celular queda fuera y la cédula puede entrar de nuevo
    async liberarCedula(cedula, motivo) {
        const a = this._afiliados[cedula]; if (!a) return false;
        const b = FB.writeBatch(FB.db);
        b.update(this._ref('afiliados', cedula), { uid: null, activado: false, pendiente: false, dispositivo: '' });
        if (a.uid) b.delete(this._ref('cuentas', a.uid));
        b.delete(this._ref('ingresos', cedula));
        b.delete(this._ref('acceso', cedula));
        try { await b.commit(); } catch (e) { this._falla(e); return false; }
        this.log(motivo || 'Cédula liberada', `${a.nombre} (${cedula})`);
        return true;
    },
    async borrarAlerta(id) { await FB.deleteDoc(this._ref('alertas', id)).catch(e => this._falla(e)); },

    // Primera vez: con el código de activación, el afiliado crea su propia clave de 6 números
    async activar(cedula, codigo, pin) {
        const ced = this._norm(cedula), cod = this._limpiarCodigo(codigo);
        if (cod.length !== 8) return { error: 'El código de activación tiene 8 letras y números (por ejemplo K7P2-9QXM).' };
        const email = `${ced}.${this._azar(6, 'abcdefghijkmnpqrstuvwxyz23456789')}@${this.DOMINIO}`;
        let cred;
        try { cred = await FB.createUserWithEmailAndPassword(FB.auth, email, this._claveAuth(pin)); }
        catch (e) { return { error: this._errAuth(e) }; }
        const u = cred.user, b = FB.writeBatch(FB.db);
        b.update(this._ref('activaciones', ced), { usada: true, uid: u.uid, codigo: cod, usadaEn: FB.serverTimestamp() });
        b.update(this._ref('afiliados', ced), { uid: u.uid, activado: true, authEmail: email, ultimoIngreso: new Date().toISOString() });
        b.set(this._ref('cuentas', u.uid), { cedula: ced });
        b.set(this._ref('acceso', ced), { email });
        try { await b.commit(); }
        catch (e) {
            await FB.deleteUser(u).catch(() => FB.signOut(FB.auth));
            return { error: 'La cédula o el código de activación no son correctos, o el código ya se usó. Revíselos o pida un código nuevo a ADEP.' };
        }
        this.yo = await this._perfil(u);
        await this.log('Cuenta activada', this.yo ? this.yo.nombre : ced);
        return this.yo;
    },

    // ================= Datos en tiempo real =================
    _redibujar() {
        clearTimeout(this._t);
        this._t = setTimeout(() => { if (typeof renderAll === 'function') renderAll(); }, 250);
    },
    _escuchar1(q, fn) {
        return new Promise(ok => {
            let primero = true;
            FB.onSnapshot(q, s => {
                fn(s); this._votesCache = null;
                if (primero) { primero = false; ok(); } else this._redibujar();
            }, e => { console.error(e); if (primero) { primero = false; ok(); } });
        });
    },
    _docs(s) { return s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })); },
    async _escuchar() {
        const admin = this.yo.rol === 'Administrador';
        const cargas = [
            this._escuchar1(admin ? this._col('polls') : FB.query(this._col('polls'), FB.where('publicada', '==', true)), s => {
                this._polls = this._docs(s).map(p => ({ ...p, id: Number(p.id) })).sort((a, b) => a.id - b.id);
            }),
            // Resultados en vivo: todos reciben los conteos y los votos públicos
            this._escuchar1(this._col('conteos'), s => {
                this._conteos = {}; s.docs.forEach(d => { this._conteos[d.id] = d.data(); });
            }),
            this._escuchar1(admin ? this._col('participacion') : FB.query(this._col('participacion'), FB.where('cedula', '==', this.yo.cedula)), s => {
                this._part = this._docs(s).map(r => ({ ...r, pollId: Number(r.pollId) }));
            }),
            this._escuchar1(this._col('votos'), s => {
                this._votos = this._docs(s).map(v => ({ ...v, pollId: Number(v.pollId) }));
            }),
            this._escuchar1(this._ref('config', 'general'), s => { this._config = s.exists() ? s.data() : {}; })
        ];
        if (admin) cargas.push(
            this._escuchar1(this._col('afiliados'), s => {
                this._afiliados = {}; this._docs(s).forEach(a => { this._afiliados[a.id] = { ...a, cedula: a.id }; });
                // Cantidad de afiliados activos, para que los afiliados vean el % de participación
                const n = this.padron();
                if (this._config.padron !== n) FB.setDoc(this._ref('config', 'general'), { padron: n }, { merge: true }).catch(() => { });
            }),
            this._escuchar1(this._ref('config', 'ingreso'), s => { this._ingreso = s.exists() ? s.data() : null; }),
            this._escuchar1(FB.query(this._col('alertas'), FB.orderBy('fecha', 'desc'), FB.limit(50)), s => {
                this._alertas = this._docs(s).map(a => ({ ...a, fecha: a.fecha && a.fecha.toDate ? a.fecha.toDate().toISOString() : '' }));
            }),
            this._escuchar1(this._col('admins'), s => {
                this._admins = {}; this._docs(s).forEach(a => { this._admins[a.id] = { ...a, cedula: a.id }; });
            }),
            this._escuchar1(FB.query(this._col('auditoria'), FB.orderBy('fecha', 'desc'), FB.limit(1000)), s => {
                this._audit = this._docs(s).map(a => ({ ...a, fecha: a.fecha && a.fecha.toDate ? a.fecha.toDate().toISOString() : new Date().toISOString() }));
            })
        );
        await Promise.all(cargas);
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
        FB.setDoc(this._ref('config', 'general'), { [k]: v }, { merge: true }).catch(e => this._falla(e));
    },
    // Escribe muchas operaciones en tandas (Firestore acepta hasta 500 por tanda)
    async _enTandas(ops) {
        for (let i = 0; i < ops.length; i += 400) {
            const b = FB.writeBatch(FB.db);
            ops.slice(i, i + 400).forEach(f => f(b));
            await b.commit();
        }
    },

    // ================= Bitácora =================
    log(accion, detalle = '') {
        if (!this.yo || !FB.auth.currentUser) return Promise.resolve();
        return FB.addDoc(this._col('auditoria'), {
            fecha: FB.serverTimestamp(), accion: String(accion).slice(0, 120), detalle: String(detalle).slice(0, 300),
            por: this.yo.nombre, uid: FB.auth.currentUser.uid
        }).catch(e => console.error('Bitácora', e));
    },
    auditoria() { return this._audit; },
    // Borra toda la bitácora; queda un único registro con quién la borró
    async limpiarAuditoria() {
        const s = await FB.getDocs(this._col('auditoria'));
        await this._enTandas(s.docs.map(d => b => b.delete(d.ref)));
        await this.log('Bitácora borrada', `Se eliminaron ${s.size} registro(s)`);
        return s.size;
    },

    // ================= Afiliados =================
    afiliados() { return Object.values(this._afiliados); },
    padron() {
        if (this.yo && this.yo.rol === 'Administrador') return this.afiliados().filter(a => a.activo !== false).length;
        return this._config.padron || 0;
    },
    async addAfiliado({ nombre, cedula, provincia, telefono }) {
        const key = this._norm(cedula);
        if (this._afiliados[key]) return { error: 'Ya existe un afiliado con esa cédula.' };
        await this.crearAfiliados([{ nombre, cedula: key, provincia, telefono }], false);
        this.log('Afiliado creado', `${nombre} (${key})${provincia ? ' · ' + provincia : ''}`);
        return { cedula: key };
    },
    // Crea muchos afiliados. Con conCodigo, cada uno con su código de activación personal. Devuelve [{...afiliado, codigo}]
    async crearAfiliados(lista, conCodigo = true) {
        const ahora = new Date().toISOString(), out = [], ops = [];
        for (const a of lista) {
            const ced = this._norm(a.cedula);
            ops.push(b => b.set(this._ref('afiliados', ced), { nombre: a.nombre, cedula: ced, provincia: a.provincia || '', telefono: a.telefono || '', activo: true, activado: false, uid: null, creada: ahora }));
            let codigo = '';
            if (conCodigo) {
                codigo = this.genActivacion();
                const hash = await this._huella(ced, codigo);
                ops.push(b => b.set(this._ref('activaciones', ced), { hash, usada: false, creada: ahora }));
            }
            out.push({ ...a, cedula: ced, codigo });
        }
        await this._enTandas(ops);
        return out;
    },
    // Códigos de activación nuevos: la cuenta anterior deja de funcionar. Devuelve { cédula: código }
    async nuevosCodigos(cedulas) {
        const ahora = new Date().toISOString(), out = {}, ops = [];
        for (const ced of cedulas) {
            const codigo = this.genActivacion(), hash = await this._huella(ced, codigo);
            ops.push(b => b.set(this._ref('activaciones', ced), { hash, usada: false, creada: ahora }));
            ops.push(b => b.update(this._ref('afiliados', ced), { uid: null, activado: false, pendiente: false, dispositivo: '' }));
            ops.push(b => b.delete(this._ref('acceso', ced)));
            ops.push(b => b.delete(this._ref('ingresos', ced)));
            out[ced] = codigo;
        }
        await this._enTandas(ops);
        return out;
    },
    async actualizarAfiliados(lista) {
        await this._enTandas(lista.map(a => b => b.update(this._ref('afiliados', a.cedula), a.cambios)));
    },
    _cambiarAfiliado(cedula, cambios, accion, detalle) {
        if (!this._afiliados[cedula]) return false;
        FB.updateDoc(this._ref('afiliados', cedula), cambios).catch(e => this._falla(e));
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
    setActivo(id, activo) {
        if (this._admins[id]) {
            FB.updateDoc(this._ref('admins', id), { activo }).catch(e => this._falla(e));
            this.log(activo ? 'Cuenta activada' : 'Cuenta desactivada', `${this._admins[id].nombre} (${this._admins[id].correo})`);
            return;
        }
        const a = this._afiliados[id]; if (!a) return;
        this._cambiarAfiliado(id, { activo }, activo ? 'Cuenta activada' : 'Cuenta desactivada', `${a.nombre} (${id})`);
    },
    deleteAfiliado(cedula, adminUser) {
        const a = this._afiliados[cedula]; if (!a) return;
        const b = FB.writeBatch(FB.db);
        const { uid, authEmail, ...sinCuenta } = a;
        b.set(FB.doc(this._col('eliminados')), {
            tipo: 'Afiliado', datos: sinCuenta, fecha: new Date().toLocaleString('es-CR'),
            eliminadoPor: adminUser ? adminUser.nombre : 'Administrador'
        });
        ['afiliados', 'activaciones', 'acceso', 'ingresos'].forEach(c => b.delete(this._ref(c, cedula)));
        b.commit().catch(e => this._falla(e));
        this.log('Afiliado eliminado', `${a.nombre} (${cedula})`);
    },

    // Borra a TODOS los afiliados (queda copia de cada uno en «eliminados»). Los votos ya emitidos no se tocan.
    // Quien tenga la sesión abierta sale en ese momento (ver vigilarCuenta). Devuelve cuántos se borraron.
    async borrarTodosAfiliados(adminUser) {
        const lista = this.afiliados(), fecha = new Date().toLocaleString('es-CR'), ops = [];
        lista.forEach(a => {
            const { uid, authEmail, ...sinCuenta } = a;
            ops.push(b => b.set(FB.doc(this._col('eliminados')), { tipo: 'Afiliado', datos: sinCuenta, fecha, eliminadoPor: adminUser ? adminUser.nombre : 'Administrador' }));
            ['afiliados', 'activaciones', 'acceso', 'ingresos'].forEach(c => ops.push(b => b.delete(this._ref(c, a.cedula))));
            if (uid) ops.push(b => b.delete(this._ref('cuentas', uid)));
        });
        await this._enTandas(ops);
        this.log('Todos los afiliados eliminados', `${lista.length} afiliado(s)`);
        return lista.length;
    },

    // ================= Administradores =================
    admins() { return Object.values(this._admins); },
    async addAdmin({ nombre, correo, pass }) {
        const a2 = FB.authSecundaria(), mail = correo.trim().toLowerCase();
        let cred;
        try { cred = await FB.createUserWithEmailAndPassword(a2, mail, pass); }
        catch (e) { return { error: this._errAuth(e) }; }
        const uid = cred.user.uid;
        await FB.signOut(a2).catch(() => { });
        try { await FB.setDoc(this._ref('admins', uid), { nombre, correo: mail, activo: true, creada: new Date().toISOString() }); }
        catch (e) { this._falla(e); return { error: 'No se pudo guardar el administrador.' }; }
        this.log('Administrador creado', `${nombre} (${mail})`);
        return { correo: mail };
    },
    // Su propia contraseña: se cambia aquí. La de otro administrador: se le envía un correo para cambiarla.
    async setPass(uid, pass) {
        const a = this._admins[uid]; if (!a) return { error: 'Administrador no encontrado.' };
        if (uid === this.yo.uid) {
            try { await FB.updatePassword(FB.auth.currentUser, pass); }
            catch (e) { return { error: this._errAuth(e) }; }
            this.log('Contraseña cambiada', `${a.nombre} (${a.correo})`);
            return { ok: true };
        }
        try { await FB.sendPasswordResetEmail(FB.auth, a.correo); }
        catch (e) { return { error: this._errAuth(e) }; }
        this.log('Correo para cambiar contraseña enviado', `${a.nombre} (${a.correo})`);
        return { ok: true, correo: a.correo };
    },
    deleteAdmin(uid, quien) {
        const a = this._admins[uid]; if (!a) return;
        const b = FB.writeBatch(FB.db);
        b.set(FB.doc(this._col('eliminados')), { tipo: 'Administrador', datos: a, fecha: new Date().toLocaleString('es-CR'), eliminadoPor: quien ? quien.nombre : 'Administrador' });
        b.delete(this._ref('admins', uid));
        b.commit().catch(e => this._falla(e));
        this.log('Administrador eliminado', `${a.nombre} (${a.correo})`);
    },

    // ================= Votaciones =================
    polls() { return this._polls; },
    estado(p) {
        if (!p.publicada) return 'borrador';
        const now = Date.now();
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
        const vacio = { total: 0 }; for (let i = 0; i < this.MAX_OPCIONES; i++) vacio['c' + i] = 0;
        const b = FB.writeBatch(FB.db);
        b.set(this._ref('polls', id), { ...datos, aperturaMs: this._ms(poll.apertura), cierreMs: this._ms(poll.cierre) });
        b.set(this._ref('conteos', id), vacio);
        try { await b.commit(); }
        catch (e) { this._falla(e, 'No se pudo guardar la consulta.'); return null; }
        this.log('Consulta creada', poll.titulo);
        return poll;
    },
    updatePoll(id, changes, motivo) {
        const c = { ...changes };
        if ('apertura' in c) c.aperturaMs = this._ms(c.apertura);
        if ('cierre' in c) c.cierreMs = this._ms(c.cierre);
        FB.updateDoc(this._ref('polls', id), c).catch(e => this._falla(e));
        if (motivo) this.log(motivo);
    },
    async deletePoll(id) {
        const p = this._polls.find(x => x.id === id), pid = String(id), ops = [];
        for (const c of ['participacion', 'votos', 'codigos']) {
            const s = await FB.getDocs(FB.query(this._col(c), FB.where('pollId', '==', pid)));
            s.docs.forEach(d => ops.push(b => b.delete(d.ref)));
        }
        ops.push(b => b.delete(this._ref('polls', pid)), b => b.delete(this._ref('conteos', pid)));
        try { await this._enTandas(ops); } catch (e) { this._falla(e, 'No se pudo eliminar la consulta.'); return; }
        if (p) this.log('Consulta eliminada', p.titulo);
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
        const pid = String(poll.id), ced = this.yo.cedula, codigo = this.genCode(), ahora = new Date();
        const fecha = ahora.toLocaleString('es-CR');
        const voto = { pollId: pid, cedula: ced, nombre: this.yo.nombre, opcion: v.opcion, idx, codigo, fecha };
        const armar = conFilial => {
            const b = FB.writeBatch(FB.db);
            b.update(this._ref('conteos', pid), { ['c' + idx]: FB.increment(1), total: FB.increment(1) });
            b.set(this._ref('participacion', pid + '_' + ced), { pollId: pid, cedula: ced, fecha, codigo });
            b.set(this._ref('codigos', codigo), { pollId: pid, fecha: poll.publica ? fecha : ahora.toLocaleDateString('es-CR') });
            if (poll.publica) b.set(this._ref('votos', pid + '_' + ced), conFilial ? { ...voto, filial: this.yo.provincia || '' } : voto);
            return b;
        };
        try { await armar(true).commit(); }
        catch (e) {
            // Reglas de seguridad anteriores (sin el campo filial): se intenta una vez sin la filial
            let error = e;
            if (poll.publica && String(e.code || '').includes('permission')) {
                try { await armar(false).commit(); error = null; } catch (e2) { error = e2; }
            }
            if (error) {
                console.error(error);
                return { error: 'No se pudo registrar el voto. Revise su conexión e intente de nuevo. Recuerde que solo se puede votar una vez.' };
            }
        }
        this.log('Voto emitido', `Consulta: ${poll.titulo}`.slice(0, 120));
        return { pollId: poll.id, opcion: v.opcion, hash: codigo, fecha };
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
        const pid = String(pollId), id = pid + '_' + cedula;
        const part = this._part.find(r => r.pollId === pollId && r.cedula === cedula);
        if (!part) return { error: 'Este afiliado no ha votado.' };
        let idx;
        if (poll.publica) {
            const v = this._votos.find(x => x.pollId === pollId && x.cedula === cedula);
            if (!v) return { error: 'No se encontró el voto de este afiliado.' };
            idx = v.idx;
        } else {
            idx = poll.opciones.indexOf(opcion);
            if (idx < 0 || !((this._conteos[pid] || {})['c' + idx] > 0)) return { error: 'No hay votos registrados con esa opción.' };
        }
        const b = FB.writeBatch(FB.db);
        b.update(this._ref('conteos', pid), { ['c' + idx]: FB.increment(-1), total: FB.increment(-1) });
        b.delete(this._ref('participacion', id));
        if (poll.publica) b.delete(this._ref('votos', id));
        if (part.codigo) b.delete(this._ref('codigos', part.codigo));
        try { await b.commit(); }
        catch (e) {
            if (!poll.publica && String(e.code || '').includes('permission')) return { error: 'No se pudo restaurar: la opción elegida no tiene votos. Revise con el afiliado qué opción eligió.' };
            this._falla(e); return { error: 'No se pudo restaurar el voto.' };
        }
        const a = this._afiliados[cedula];
        this.log('Voto restaurado', `${poll.titulo} · ${a ? a.nombre : cedula}`.slice(0, 120));
        return { ok: true };
    },
    async verify(code) {
        const c = String(code).trim().toUpperCase();
        if (!/^ADEP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null;
        let s;
        try { s = await FB.getDoc(this._ref('codigos', c)); } catch { return null; }
        if (!s.exists()) return null;
        const d = s.data(), poll = this._polls.find(p => p.id === Number(d.pollId));
        return { titulo: poll ? poll.titulo : 'Consulta no disponible', fecha: d.fecha };
    }
};
