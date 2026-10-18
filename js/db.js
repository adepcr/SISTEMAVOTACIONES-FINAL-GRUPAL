/* db.js - versión Firestore (datos en la nube, sesión local por dispositivo) */
const DB = {
    _cache: {},
    _local: ['session'], // solo estas claves se quedan en el dispositivo

    // Descarga todo de Firestore y deja escuchando cambios de otros dispositivos
    async init() {
        const col = fs.collection(db, 'adep');
        const snap = await fs.getDocs(col);
        snap.forEach(d => { this._cache[d.id] = d.data().v; });
        fs.onSnapshot(col, s => {
            s.docChanges().forEach(c => {
                if (c.doc.metadata.hasPendingWrites) return;
                if (c.type === 'removed') delete this._cache[c.doc.id];
                else this._cache[c.doc.id] = c.doc.data().v;
            });
        });
    },
    _get(k, d) {
        try {
            if (this._local.includes(k)) return JSON.parse(localStorage.getItem('adep_' + k)) ?? d;
            const raw = this._cache[k];
            return raw === undefined ? d : (JSON.parse(raw) ?? d);
        } catch { return d; }
    },
    _set(k, v) {
        if (this._local.includes(k)) { localStorage.setItem('adep_' + k, JSON.stringify(v)); return; }
        const str = JSON.stringify(v);
        this._cache[k] = str;
        fs.setDoc(fs.doc(db, 'adep', k), { v: str }).catch(e => console.error('Error al guardar', k, e));
    },

    MAX_INTENTOS: 5,
    BLOQUEO_MIN: 15,

    // ---- Utilidades de seguridad ----
    async hash(id, pass) {
        const data = new TextEncoder().encode('adep|' + id + '|' + pass);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    },
    genPin() {
        const a = new Uint32Array(6); crypto.getRandomValues(a);
        return Array.from(a, n => n % 10).join('');
    },
    genCode() {
        const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const a = new Uint8Array(8); crypto.getRandomValues(a);
        const s = Array.from(a, n => c[n % c.length]).join('');
        return `ADEP-${s.slice(0, 4)}-${s.slice(4)}`;
    },

    // ---- Bitácora de auditoría ----
    log(accion, detalle = '') {
        const s = this._get('session', null);
        const l = this._get('auditoria', []);
        l.push({ fecha: new Date().toISOString(), accion, detalle, por: s ? s.nombre : 'Sistema' });
        this._set('auditoria', l.slice(-500));
    },
    auditoria() { return this._get('auditoria', []).slice().reverse(); },
    // Borra toda la bitácora; queda un único registro con quién la borró
    limpiarAuditoria() {
        const n = this._get('auditoria', []).length;
        this._set('auditoria', []);
        this.log('Bitácora borrada', `Se eliminaron ${n} registro(s)`);
        return n;
    },

    // ---- Usuarios y sesión ----
    async seedDemo() {
        if (Object.keys(this._get('users', {})).length) return;
        const passHash = await this.hash('admin@adep.cr', '123');
        const users = this._get('users', {});
        if (!users['admin@adep.cr']) {
            users['admin@adep.cr'] = {
                correo: 'admin@adep.cr', cedula: 'admin@adep.cr', nombre: 'Administrador ADEP',
                passHash, rol: 'Administrador', provincia: '', activo: true
            };
            this._set('users', users);
        }
    },
    _norm(id) { return String(id).toLowerCase().replace(/[\s-]/g, ''); },
    _startSession(u) {
        const { pass, passHash, claveTemporal, ...safe } = u;
        this._set('session', safe);
        return safe;
    },
    async login(id, pass) {
        await this.seedDemo();
        const key = this._norm(id);
        const intentos = this._get('intentos', {});
        const reg = intentos[key] || { n: 0, hasta: 0 };

        if (reg.hasta > Date.now()) {
            const min = Math.ceil((reg.hasta - Date.now()) / 60000);
            return { error: `Demasiados intentos. Espere ${min} minuto(s) o llame a ADEP.` };
        }

        const users = this._get('users', {});
        const u = users[key];
        let ok = false;
        if (u) {
            if (u.passHash) ok = u.passHash === await this.hash(key, pass);
            else if (u.pass !== undefined && u.pass === pass) {
                ok = true; u.passHash = await this.hash(key, pass); delete u.pass;
            }
        }

        if (!ok) {
            reg.n += 1;
            let msg = 'La cédula o la clave no son correctas. Revise e intente de nuevo.';
            if (reg.n >= this.MAX_INTENTOS) {
                reg.hasta = Date.now() + this.BLOQUEO_MIN * 60000;
                reg.n = 0;
                msg = `Demasiados intentos. Espere ${this.BLOQUEO_MIN} minutos o llame a ADEP.`;
                intentos[key] = reg; this._set('intentos', intentos);
                this.log('Cuenta bloqueada temporalmente', key);
                return { error: msg };
            }
            intentos[key] = reg; this._set('intentos', intentos);
            return { error: msg };
        }
        if (u.activo === false) return { error: 'Su cuenta está desactivada. Comuníquese con ADEP.' };

        delete intentos[key]; this._set('intentos', intentos);
        // Clave temporal entregada por ADEP: el afiliado debe crear su clave personal antes de entrar
        if (u.claveTemporal) return { cambiarClave: true, cedula: key, nombre: u.nombre };
        u.ultimoIngreso = new Date().toISOString();
        this._set('users', users);
        const s = this._startSession(u);
        this.log('Ingreso al sistema', s.rol);
        return s;
    },
    session() {
        const s = this._get('session', null);
        if (!s) return null;
        const u = this._get('users', {})[s.cedula];
        if (!u || u.activo === false) { localStorage.removeItem('adep_session'); return null; }
        return s;
    },
    // Clave temporal → clave personal (la elige el afiliado; ADEP ya no la conoce)
    async crearClavePersonal(id, temporal, nueva) {
        const key = this._norm(id);
        const users = this._get('users', {});
        const u = users[key];
        if (!u || !u.claveTemporal || u.passHash !== await this.hash(key, temporal)) return { error: 'La clave temporal no es correcta. Ingrese de nuevo.' };
        if (!/^\d{6}$/.test(nueva)) return { error: 'La clave debe tener 6 números.' };
        if (nueva === temporal) return { error: 'La clave nueva debe ser distinta a la que le entregó ADEP.' };
        if (/^(\d)\1{5}$/.test(nueva) || '0123456789'.includes(nueva) || '9876543210'.includes(nueva)) return { error: 'Esa clave es muy fácil de adivinar. Elija otros números.' };
        u.passHash = await this.hash(key, nueva);
        delete u.claveTemporal;
        u.ultimoIngreso = new Date().toISOString();
        this._set('users', users);
        const s = this._startSession(u);
        this.log('Clave personal creada', s.nombre);
        return s;
    },
    logout() { this.log('Cierre de sesión'); localStorage.removeItem('adep_session'); },

    // ---- Afiliados ----
    afiliados() { return Object.values(this._get('users', {})).filter(u => u.rol === 'Afiliado'); },
    padron() { return this.afiliados().filter(a => a.activo !== false).length; },
    async addAfiliado({ nombre, cedula, provincia }) {
        const key = this._norm(cedula);
        const pass = this.genPin();
        const passHash = await this.hash(key, pass);
        const users = this._get('users', {});
        if (users[key]) return { error: 'Ya existe un afiliado con esa cédula.' };
        users[key] = { nombre, cedula: key, correo: '', passHash, claveTemporal: true, rol: 'Afiliado', provincia: provincia || '', activo: true, creada: new Date().toISOString() };
        this._set('users', users);
        this.log('Afiliado creado', `${nombre} (${key})${provincia ? ' · ' + provincia : ''}`);
        return { cedula: key, pass };
    },
    // Cambiar la filial (provincia) de un afiliado ya registrado
    setFilial(cedula, provincia) {
        const users = this._get('users', {});
        if (!users[cedula] || users[cedula].rol !== 'Afiliado') return false;
        users[cedula].provincia = provincia || '';
        this._set('users', users);
        this.log('Filial actualizada', `${users[cedula].nombre} (${cedula})${provincia ? ' · ' + provincia : ' · sin filial'}`);
        return true;
    },
    async resetPass(cedula) {
        const pass = this.genPin();
        const passHash = await this.hash(cedula, pass);
        const users = this._get('users', {});
        if (!users[cedula]) return null;
        users[cedula].passHash = passHash; delete users[cedula].pass;
        if (users[cedula].rol === 'Afiliado') users[cedula].claveTemporal = true;
        this._set('users', users);
        const intentos = this._get('intentos', {}); delete intentos[cedula]; this._set('intentos', intentos);
        this.log('Nueva clave generada', `${users[cedula].nombre} (${cedula})`);
        return pass;
    },
    setActivo(cedula, activo) {
        const users = this._get('users', {});
        if (users[cedula]) {
            users[cedula].activo = activo; this._set('users', users);
            this.log(activo ? 'Cuenta activada' : 'Cuenta desactivada', `${users[cedula].nombre} (${cedula})`);
        }
    },
    deleteAfiliado(cedula, adminUser) {
        const users = this._get('users', {});
        if (users[cedula] && users[cedula].rol === 'Afiliado') {
            const eliminados = this._get('afiliados_eliminados', []);
            const { pass, passHash, ...sinClave } = users[cedula];
            eliminados.push({
                afiliado: sinClave,
                eliminadoPor: { nombre: adminUser ? adminUser.nombre : 'Administrador', cedula: adminUser ? adminUser.cedula : 'Sin cédula' },
                fecha: new Date().toLocaleString('es-CR')
            });
            this._set('afiliados_eliminados', eliminados);
            this.log('Afiliado eliminado', `${sinClave.nombre} (${cedula})`);
            delete users[cedula];
            this._set('users', users);
        }
    },

    // ---- Administradores ----
    admins() { return Object.values(this._get('users', {})).filter(u => u.rol === 'Administrador'); },
    async addAdmin({ nombre, correo, pass }) {
        const key = this._norm(correo);
        const passHash = await this.hash(key, pass);
        const users = this._get('users', {});
        if (users[key]) return { error: 'Ya existe un usuario con ese correo.' };
        users[key] = { nombre, correo: correo.trim().toLowerCase(), cedula: key, passHash, rol: 'Administrador', provincia: '', activo: true, creada: new Date().toISOString() };
        this._set('users', users);
        this.log('Administrador creado', `${nombre} (${users[key].correo})`);
        return { correo: users[key].correo };
    },
    async setPass(key, pass) {
        const passHash = await this.hash(key, pass);
        const users = this._get('users', {});
        if (!users[key]) return false;
        users[key].passHash = passHash; delete users[key].pass;
        this._set('users', users);
        const intentos = this._get('intentos', {}); delete intentos[key]; this._set('intentos', intentos);
        this.log('Contraseña cambiada', `${users[key].nombre} (${key})`);
        return true;
    },
    deleteAdmin(key, quien) {
        const users = this._get('users', {});
        if (!users[key] || users[key].rol !== 'Administrador') return;
        const log = this._get('admins_eliminados', []);
        const { pass, passHash, ...sinClave } = users[key];
        log.push({ admin: sinClave, eliminadoPor: quien ? quien.nombre : 'Administrador', fecha: new Date().toLocaleString('es-CR') });
        this._set('admins_eliminados', log);
        this.log('Administrador eliminado', `${sinClave.nombre} (${sinClave.correo})`);
        delete users[key];
        this._set('users', users);
    },

    // ---- Votaciones ----
    polls() { return this._get('polls', []); },
    estado(p) {
        if (!p.publicada) return 'borrador';
        const now = Date.now();
        if (p.apertura && now < new Date(p.apertura).getTime()) return 'programada';
        if (p.cierre && now >= new Date(p.cierre).getTime()) return 'cerrada';
        return 'abierta';
    },
    addPoll(p) {
        const polls = this.polls();
        const poll = { id: Date.now(), publicada: false, publica: false, apertura: '', cierre: '', ...p, creada: new Date().toISOString() };
        polls.push(poll); this._set('polls', polls);
        this.log('Consulta creada', poll.titulo);
        return poll;
    },
    updatePoll(id, changes, motivo) {
        this._set('polls', this.polls().map(p => p.id === id ? { ...p, ...changes } : p));
        if (motivo) this.log(motivo);
    },
    deletePoll(id) {
        const p = this.polls().find(x => x.id === id);
        this._set('polls', this.polls().filter(x => x.id !== id));
        this._set('votes', this.votes().filter(v => v.pollId !== id));
        this._set('voters', this.voters().filter(v => v.pollId !== id));
        if (p) this.log('Consulta eliminada', p.titulo);
    },

    // ---- Votos ----
    votes() { return this._get('votes', []); },
    voters() { return this._get('voters', []); },
    hasVoted(pollId, cedula) {
        return this.voters().some(v => v.pollId === pollId && v.cedula === cedula)
            || this.votes().some(v => v.pollId === pollId && v.cedula === cedula);
    },
    addVote(v) {
        const poll = this.polls().find(p => p.id === v.pollId);
        if (!poll || this.estado(poll) !== 'abierta') return { error: 'Esta consulta no está abierta para votar.' };
        if (!poll.opciones.includes(v.opcion)) return { error: 'La opción elegida no es válida.' };
        if (this.hasVoted(v.pollId, v.cedula)) return { error: 'Ya emitió su voto en esta consulta.' };

        const ahora = new Date();
        const fechaCompleta = ahora.toLocaleString('es-CR');
        const hash = this.genCode();
        const vote = { pollId: v.pollId, opcion: v.opcion, hash, publica: !!poll.publica };
        const all = this.votes();

        if (poll.publica) {
            vote.cedula = v.cedula; vote.nombre = v.nombre; vote.fecha = fechaCompleta;
            all.push(vote);
        } else {
            vote.fecha = ahora.toLocaleDateString('es-CR');
            const padron = this.voters(); padron.push({ pollId: v.pollId, cedula: v.cedula, fecha: fechaCompleta, codigo: hash });
            delete vote.hash;
            this._set('voters', padron);
            all.splice(Math.floor(Math.random() * (all.length + 1)), 0, vote);
        }
        this._set('votes', all);
        this.log('Voto emitido', `Consulta: ${poll.titulo}`.slice(0, 120));
        return { ...vote, hash, fecha: fechaCompleta };
    },
    asegurarCodigo(pollId, cedula) {
        const padron = this.voters();
        const r = padron.find(x => x.pollId === pollId && x.cedula === cedula);
        if (!r) return '';
        if (!r.codigo) { r.codigo = this.genCode(); this._set('voters', padron); }
        return r.codigo;
    },
    // Restaurar un voto por equivocación: el afiliado podrá votar de nuevo.
    // Voto público: se quita su voto directamente.
    // Voto secreto: no se guarda quién eligió qué, así que se quita un voto de la opción que el afiliado indica.
    restaurarVoto(pollId, cedula, opcion) {
        const poll = this.polls().find(p => p.id === pollId);
        if (!poll) return { error: 'Consulta no encontrada.' };
        if (this.estado(poll) !== 'abierta') return { error: 'Solo se puede restaurar un voto mientras la consulta está abierta.' };
        const votes = this.votes();
        if (poll.publica) {
            const i = votes.findIndex(v => v.pollId === pollId && v.cedula === cedula);
            if (i < 0) return { error: 'No se encontró el voto de este afiliado.' };
            votes.splice(i, 1);
        } else {
            if (!this.voters().some(r => r.pollId === pollId && r.cedula === cedula)) return { error: 'Este afiliado no ha votado.' };
            const i = votes.findIndex(v => v.pollId === pollId && v.opcion === opcion && !v.cedula);
            if (i < 0) return { error: 'No hay votos registrados con esa opción.' };
            votes.splice(i, 1);
        }
        this._set('votes', votes);
        this._set('voters', this.voters().filter(r => !(r.pollId === pollId && r.cedula === cedula)));
        const a = this._get('users', {})[cedula];
        this.log('Voto restaurado', `${poll.titulo} · ${a ? a.nombre : cedula}`.slice(0, 120));
        return { ok: true };
    },
    verify(code) {
        const c = String(code).trim().toUpperCase();
        const v = this.votes().find(x => x.hash === c) || this.voters().find(x => x.codigo === c);
        if (!v) return null;
        const poll = this.polls().find(p => p.id === v.pollId);
        return { titulo: poll ? poll.titulo : 'Consulta eliminada', fecha: v.fecha };
    }
};