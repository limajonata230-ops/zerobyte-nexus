/* App da Congregação — PWA (modo demonstração local ou Firebase) */
(function () {
'use strict';
const VERSAO = '1.9.0';

// ================= utilidades =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parse = s => { const [y, m, d] = (s || '').split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_L = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmt = s => s ? `${pad(parse(s).getDate())}/${pad(parse(s).getMonth() + 1)}/${parse(s).getFullYear()}` : '—';
const fmtShort = s => s ? `${DIAS[parse(s).getDay()]}, ${pad(parse(s).getDate())}/${pad(parse(s).getMonth() + 1)}` : '';
const fmtLong = s => { if (!s) return ''; const d = parse(s); return `${DIAS_L[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
const monday = s => { const d = parse(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };
const mesDe = s => (s || '').slice(0, 7);
const mesLabel = m => { const [y, mm] = m.split('-').map(Number); return `${MESES[mm - 1]} de ${y}`; };
const mesNome = m => MESES[Number(m.split('-')[1]) - 1];
const mesAtual = () => mesDe(today());
const mesAnterior = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const hm = min => `${Math.floor(min / 60) % 24}:${pad(min % 60)}`;
const toMin = h => { const [a, b] = (h || '19:30').split(':').map(Number); return a * 60 + (b || 0); };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2400); }

// ================= armazenamento =================
const COLS = ['config', 'publicadores', 'vmc', 'fds', 'designacoes', 'saidas', 'carrinho', 'relatorios', 'anuncios', 'territorios', 'atividade', 'solicitacoes', 'programas', 'saidasAlt', 'estudos', 'terrNotas'];

class LocalStore {
  constructor() { this.data = LS.get('cg_data', {}); this.subs = {}; this.demo = true; }
  _save() { LS.set('cg_data', this.data); }
  list(col) { return Object.entries(this.data[col] || {}).map(([id, v]) => ({ ...v, id })); }
  sub(col, cb) { (this.subs[col] = this.subs[col] || []).push(cb); cb(this.list(col)); }
  _emit(col) { (this.subs[col] || []).forEach(cb => cb(this.list(col))); }
  async put(col, id, obj) { id = id || uid(); const o = { ...obj }; delete o.id; (this.data[col] = this.data[col] || {})[id] = o; this._save(); this._emit(col); return id; }
  async del(col, id) { if (this.data[col]) delete this.data[col][id]; this._save(); this._emit(col); }
}
class FireStore {
  constructor(db) { this.db = db; this.demo = false; }
  sub(col, cb) { this.db.collection(col).onSnapshot(s => cb(s.docs.map(d => ({ ...d.data(), id: d.id }))), e => { console.error(e); toast('Erro ao carregar ' + col); cb([]); }); }
  async put(col, id, obj) { const o = { ...obj }; delete o.id; id = id || uid(); await this.db.collection(col).doc(id).set(o); return id; }
  async del(col, id) { await this.db.collection(col).doc(id).delete(); }
}
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
async function initStore() {
  const c = window.FIREBASE_CONFIG;
  if (!c) return new LocalStore();
  const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
  await loadScript(base + 'firebase-app-compat.js');
  await loadScript(base + 'firebase-auth-compat.js');
  await loadScript(base + 'firebase-firestore-compat.js');
  firebase.initializeApp(c);
  await firebase.auth().signInAnonymously();
  const db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
  return new FireStore(db);
}

// ================= estado =================
let store;
const D = {}; COLS.forEach(c => D[c] = []);
const S = {
  view: LS.get('cg_view', 'inicio'), param: LS.get('cg_param', null),
  me: LS.get('cg_me', null), unlocked: LS.get('cg_unlocked', false), pickPin: null,
  terrGrupo: 'Todos', terrFiltro: 'todos', relMes: mesAnterior(), solFiltro: 'pendente', open: {}
};
const cfg = () => D.config.find(c => c.id === 'app') || {};
const pubs = () => [...D.publicadores].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
const meP = () => D.publicadores.find(p => p.id === S.me);
const myName = () => (meP() || {}).nome || '';
const splitNames = n => String(n || '').toLowerCase().split(/[,/;&+]| e /).map(x => x.trim()).filter(Boolean);
const isMe = n => { const m = myName().trim().toLowerCase(); return !!m && splitNames(n).includes(m); };
const nameTag = n => isMe(n) ? `<span class="me">${esc(n)}</span>` : esc(n || '—');
const CARGOS = {
  admin: ['Administrador', 'Cadastra pessoas, define cargos e vê os PINs'],
  superintendente: ['Superintendente', 'Vê tudo no app, mas não edita nada'],
  dirigente: ['Dirigente de campo', 'Inicia e termina territórios'],
  territorios: ['Servo de territórios', 'Edita territórios e atende pedidos de território'],
  publicacoes: ['Servo de publicações', 'Atende pedidos de publicações'],
  mecanicas: ['Designações mecânicas', 'Indicadores, áudio e vídeo, microfones, palco'],
  carrinho: ['Testemunho público', 'Escala do carrinho'],
  secretario: ['Secretário', 'Relatórios, ausências e pedidos de pioneiro']
};
const CARGOS_BASE = Object.keys(CARGOS);
// funções que podem ser dadas a um cargo criado pelo admin supremo
const FUNCOES = [['terr.mover', 'Iniciar e terminar territórios'], ['terr.edit', 'Editar territórios e mapas'], ['sol.territorio', 'Atender pedidos de território'],
  ['sol.publicacoes', 'Atender pedidos de publicações'], ['designacoes', 'Editar designações mecânicas'], ['carrinho', 'Editar escala do testemunho público'],
  ['saidas', 'Editar saídas de campo'], ['vmc', 'Editar Vida e Ministério'], ['fds', 'Editar reunião de fim de semana'], ['programas', 'Editar programações'],
  ['anuncios', 'Editar anúncios e eventos'], ['relatorios', 'Ver e arquivar relatórios'], ['sol.ausencia', 'Ver pedidos de ausência'], ['sol.pioneiro', 'Ver pedidos de pioneiro auxiliar'],
  ['ver.tudo', 'Ver tudo no app (sem editar)']];
let CARGO_FN = {};
function syncCargos() {
  Object.keys(CARGOS).forEach(k => { if (!CARGOS_BASE.includes(k)) delete CARGOS[k]; }); CARGO_FN = {};
  Object.entries(cfg().cargosExtra || {}).forEach(([k, c]) => { CARGOS[k] = [c.nome, c.desc || (c.funcoes || []).map(f => (FUNCOES.find(x => x[0] === f) || [, f])[1]).join(' · ')]; CARGO_FN[k] = c.funcoes || []; });
}
// permissão -> cargos que a têm (o ancião tem todas)
const PERM = {
  'terr.mover': ['dirigente', 'territorios'], 'terr.edit': ['territorios'], 'sol.territorio': ['territorios'], 'sol.publicacoes': ['publicacoes'],
  designacoes: ['mecanicas'], carrinho: ['carrinho'], relatorios: ['secretario'], 'sol.ausencia': ['secretario'], 'sol.pioneiro': ['secretario'],
  saidas: ['territorios', 'admin'], vmc: [], fds: [], programas: [], anuncios: [], config: [], publicadores: ['admin'], 'publicadores.ver': ['admin']
};
const isElder = p => !!p && p.priv === 'Ancião';
const ADMIN_ONLY = ['publicadores'];  // só o Administrador (nem o ancião tem automaticamente)
const cargosDe = p => ((p && p.cargos) || []).filter(c => CARGOS[c]);
const isSupremo = p => !!(p && p.supremo);
const isAdm = p => isSupremo(p) || cargosDe(p).includes('admin');
const temCargo = p => isSupremo(p) || isElder(p) || cargosDe(p).length > 0;
const fnDe = p => cargosDe(p).flatMap(c => CARGO_FN[c] || []);
const can = k => { const p = meP(); if (!p) return false; if (isSupremo(p)) return true; if (ADMIN_ONLY.includes(k)) return isAdm(p); if (isElder(p)) return true; return (PERM[k] || []).some(c => cargosDe(p).includes(c)) || fnDe(p).includes(k); };
const isAdmin = () => isElder(meP());
const isSup = p => !isSupremo(p) && (cargosDe(p).includes('superintendente') || fnDe(p).includes('ver.tudo'));
// ver (sem editar): ancião e superintendente veem tudo; os demais veem o que podem editar
const VER_EXTRA = { territorios: ['dirigente', 'territorios', 'admin'] };
const ver = k => { const p = meP(); if (!p) return false; if (isSupremo(p) || isElder(p) || isSup(p)) return true; if (k === 'territorios' && (can('terr.mover') || can('terr.edit'))) return true; return can(k) || (VER_EXTRA[k] || []).some(c => cargosDe(p).includes(c)); };
const solVer = () => ['territorio', 'publicacoes', 'ausencia', 'pioneiro'].filter(t => ver('sol.' + t));
const isPioneer = p => /pioneiro/i.test((p && p.tipo) || '');
const KIND_PERM = { territorios: 'terr.edit', saidasAlt: 'saidas' };
const permOf = kind => KIND_PERM[kind] || kind;
const solPerms = () => ['territorio', 'publicacoes', 'ausencia', 'pioneiro'].filter(t => can('sol.' + t));
const genPin = (lista = D.publicadores) => { const used = new Set(lista.map(p => String(p.pin || ''))); let v; do { v = String(Math.floor(1000 + Math.random() * 9000)); } while (used.has(v)); return v; };
const cargoLabel = p => [isSupremo(p) ? 'Admin supremo' : '', isElder(p) ? 'Ancião' : '', ...cargosDe(p).map(c => CARGOS[c][0])].filter(Boolean).join(' · ');
const eventoSemana = s => { if (!s) return null; const a = monday(s), b = addDays(a, 6); return D.anuncios.find(x => x.tipo === 'Evento' && x.data >= a && x.data <= b && x.cancela); };

const TERR_IMG = n => 'img/territorio_' + n + '.jpg';
// territórios reais da congregação (registro S-13) com os mapas de satélite
function terrIniciais(put) {
  const REG = [['01', 'Michael', '2026-03-01', '2026-03-01'], ['02', 'Marcello', '2026-04-12', ''], ['03', 'Marcello', '2026-04-12', ''], ['04', 'Marcello', '2026-02-28', '2026-02-28'],
    ['05', 'Marcello', '2026-02-28', '2026-02-28'], ['06', 'Marcello', '2026-04-05', ''], ['07', 'Marcello', '2026-03-22', '2026-03-22'], ['08', 'Jonatã', '2026-03-06', '2026-03-06'],
    ['09', 'Pedro Augusto', '2026-03-29', ''], ['10'], ['11', 'Jonatã', '2026-03-13', '2026-03-20'], ['12', 'Pedro Augusto', '2026-03-14', '2026-03-21'], ['13', 'Pedro Augusto', '2026-03-14', '2026-03-21'],
    ['14', 'Pedro Augusto', '2026-06-14', '2026-08-23'], ['15', 'Michael', '2026-03-31', ''], ['16', 'Sander', '2026-02-04', ''], ['17', 'Hugo', '2026-03-12', ''], ['18', 'Gabriel', '2026-03-18', '2026-03-18'],
    ['19', 'Sander', '2026-04-15', '2026-04-15'], ['20', 'Marcello', '2026-03-11', '2026-03-11'], ['21', 'Hugo', '2026-03-22', ''], ['22', 'Hugo', '2026-03-22', ''],
    ['23'], ['24'], ['25'], ['26'], ['27'], ['28']];
  const IMGS = {}; for (let i = 1; i <= 22; i++) { const n = String(i).padStart(2, '0'); IMGS[n] = TERR_IMG(n); }
  const NOMES = { '04': 'Velha Marabá' };
  return Promise.all(REG.map(([n, dir, ini, fim]) => {
    const t = { numero: n, nome: NOMES[n] || '', grupo: '', imagem: IMGS[n] || '', historico: [] };
    if (dir) { t.dirigente = dir; t.inicio = ini; t.termino = fim || ''; if (fim) t.historico = [{ dirigente: dir, inicio: ini, termino: fim }]; }
    return put('territorios', 't' + n, t);
  }));
}
// ================= dados de demonstração =================
function seedDemo() {
  if (store.list('config').length && LS.get('cg_seedv', 1) === 12) return;
  store.data = {}; LS.set('cg_seedv', 12); S.me = null; S.unlocked = false; S.view = 'inicio';
  const put = (c, id, o) => { (store.data[c] = store.data[c] || {})[id || uid()] = o; };
  put('config', 'app', { terrCorte: today(), nome: 'Congregação Velha Marabá', horaVmc: '19:30', horaFds: '19:00', relatoriosAtivos: true });
  const P = [['Jonata Lima', 'Grupo 1', 'Pioneiro regular', 'Servo ministerial'], ['Andrey Menezes', 'Grupo 1', 'Publicador', 'Ancião'], ['Eduardo Menezes', 'Grupo 1', 'Publicador', 'Servo ministerial'], ['Amanda Silva', 'Grupo 1', 'Pioneiro auxiliar', ''],
    ['Marcello Vieira', 'Grupo 2', 'Publicador', 'Ancião'], ['Adryel dos Prazeres', 'Grupo 2', 'Publicador', 'Servo ministerial'], ['Carlos Pio', 'Grupo 2', 'Publicador', ''], ['Kátria Lima', 'Grupo 2', 'Pioneiro regular', ''],
    ['Ruan Vieira', 'Grupo 3', 'Publicador', 'Ancião'], ['Nicolas dos Anjos', 'Grupo 3', 'Publicador', ''], ['Hugo Santos', 'Grupo 3', 'Publicador', 'Servo ministerial'], ['Ana Beatriz Sousa', 'Grupo 3', 'Publicador', ''], ['Cléo Vieira', 'Grupo 3', 'Publicador', ''], ['Rafael Menezes', 'Grupo 1', 'Publicador', ''], ['Sander Souza', 'Grupo 2', 'Publicador', 'Servo ministerial'], ['Rian Ferreira', 'Grupo 3', 'Publicador', 'Servo ministerial']];
  const ROLES = { 'Andrey Menezes': [['admin'], '1111'], 'Hugo Santos': [['superintendente'], '8888'], 'Jonata Lima': [['admin', 'territorios', 'dirigente'], '2222'], 'Eduardo Menezes': [['publicacoes', 'dirigente'], '3333'], 'Rian Ferreira': [['mecanicas'], '4444'], 'Sander Souza': [['carrinho'], '5555'], 'Carlos Pio': [['dirigente'], '6666'] };
  P.forEach(([nome, grupo, tipo, priv], i) => { const r = ROLES[nome]; put('publicadores', 'p' + i, { nome, grupo, tipo, priv, superintendente: ['Andrey Menezes', 'Marcello Vieira', 'Ruan Vieira'][Number(grupo.slice(-1)) - 1], cargos: r ? r[0] : [], ...(nome === 'Jonata Lima' ? { supremo: true } : {}), pin: r ? r[1] : ({ 'Marcello Vieira': '1212', 'Ruan Vieira': '1313' })[nome] || String(7000 + i) }); });
  const seg = monday(today());
  for (let w = 0; w < 4; w++) {
    const qui = addDays(seg, 3 + 7 * w), sab = addDays(seg, 5 + 7 * w);
    put('vmc', null, { data: qui, leitura: ['LAMENTAÇÕES 1-2', 'LAMENTAÇÕES 3-5', 'EZEQUIEL 1-5', 'EZEQUIEL 6-10'][w], canticoIni: 'Cântico 28 - Quem pode ser amigo de Jeová?', canticoMeio: 'Cântico 90 - "Encorajando uns aos outros"', canticoFim: "Cântico 75 - 'Estou aqui!'",
      presidente: 'Andrey Menezes', oracaoIni: w === 0 ? 'Eduardo Menezes' : 'Jonata Lima', oracaoFim: 'Sander Souza', partes: [
        { s: 'tesouros', t: 'Uma reação compreensível diante de uma terrível perda', m: 10, n: 'Marcello Vieira' },
        { s: 'tesouros', t: 'Joias espirituais', m: 10, n: 'Adryel dos Prazeres' },
        { s: 'tesouros', t: 'Leitura da Bíblia', m: 4, n: w === 1 ? 'Jonata Lima' : 'Carlos Pio' },
        { s: 'ministerio', t: 'Iniciando conversas', m: 3, n: 'Amanda Silva & Kátria Lima' },
        { s: 'ministerio', t: 'Cultivando o interesse', m: 4, n: 'Ana Beatriz Sousa & Cléo Vieira' },
        { s: 'ministerio', t: 'O que você diria?', m: 5, n: 'Rafael Menezes' },
        { s: 'vida', t: 'Não se esqueça de nossos irmãos e irmãs inativos', m: 15, n: w === 0 ? 'Jonata Lima' : 'Hugo Santos' },
        { s: 'vida', t: 'Estudo Bíblico de Congregação', m: 30, n: 'Ruan Vieira', n2: 'Nicolas dos Anjos' }] });
    put('fds', null, { data: sab, tema: ['Você pode encarar o futuro com confiança!', 'Por que devemos confiar na Bíblia?', 'Seja corajoso e confie em Jeová', 'O que significa amar o próximo?'][w], numero: ['108', '52', '87', '160'][w], orador: ['Rodrigo Ávila', 'Paulo Henrique', 'Antônio Ferreira', 'Marcos Lima'][w], congregacao: ['Central', 'Cidade Nova', 'Nova Marabá', 'São Félix'][w], presidente: w === 1 ? 'Jonata Lima' : 'Rian Ferreira', leitor: 'Ruan Vieira', hospitalidade: w === 0 ? 'Disponível' : 'Família Menezes' });
    put('designacoes', null, { data: qui, indicadores: 'Carlos Pio, Nicolas dos Anjos', som: w === 0 ? 'Jonata Lima' : 'Rafael Menezes', microfones: 'Rian Ferreira, Sander Souza', palco: 'Eduardo Menezes', limpeza: 'Grupo ' + (w % 3 + 1) });
    put('designacoes', null, { data: sab, indicadores: w === 0 ? 'Jonata Lima, Hugo Santos' : 'Hugo Santos, Carlos Pio', som: 'Rafael Menezes', microfones: 'Nicolas dos Anjos, Rian Ferreira', palco: 'Eduardo Menezes', limpeza: 'Grupo ' + ((w + 1) % 3 + 1) });
  }
  put('saidas', 'sx1', { dia: 'Sábado', hora: '08:30', local: 'Casa da família Lima', dirigente: 'Jonata Lima', grupo: 'Grupo 1', obs: '' });
  put('saidas', null, { dia: 'Domingo', hora: '08:00', local: 'Salão do Reino', dirigente: 'Marcello Vieira', grupo: 'Todos', obs: 'Após a saída, revisitas' });
  put('saidas', null, { dia: 'Quarta', hora: '16:00', local: 'Praça da Velha Marabá', dirigente: 'Ruan Vieira', grupo: 'Grupo 3', obs: '' });
  put('saidasAlt', null, { data: nextDow(6), saida: 'sx1', tipo: 'Alterada', hora: '09:00', local: 'Casa do irmão Hugo', dirigente: '', obs: 'Só neste sábado' });
  put('carrinho', null, { data: addDays(today(), 1), hora: '07:00 – 09:00', local: 'Orla da Velha Marabá', vagas: 3, inscritos: ['Amanda Silva'] });
  put('carrinho', null, { data: addDays(today(), 1), hora: '09:00 – 11:00', local: 'Orla da Velha Marabá', vagas: 3, inscritos: [] });
  put('carrinho', null, { data: addDays(today(), 3), hora: '17:00 – 19:00', local: 'Feira da Marabá Pioneira', vagas: 2, inscritos: ['Kátria Lima', 'Cléo Vieira'] });
  put('anuncios', null, { tipo: 'Evento', sub: 'Assembleia de circuito', titulo: 'Assembleia de circuito', texto: 'Não haverá reuniões na congregação nesta semana.', data: addDays(seg, 13), ate: addDays(seg, 13), cancela: true });
  put('anuncios', null, { tipo: 'Anúncio', titulo: 'Limpeza geral do Salão', texto: 'Sábado após a saída de campo. Todos os grupos convidados.', data: addDays(today(), 6), ate: addDays(today(), 6) });
  put('anuncios', null, { tipo: 'Documento', titulo: 'Carta sobre a campanha de dezembro', texto: 'Leia a carta no quadro de anúncios do Salão.', data: addDays(today(), -2), ate: addDays(today(), 20) });
  put('programas', null, { titulo: 'Limpeza geral do Salão do Reino', data: addDays(today(), 6), texto: '07:00 – Café\n07:30 – Divisão das equipes\n08:00 – Início da limpeza\n11:00 – Encerramento' });
  put('estudos', mesAtual() + '_p0', { mes: mesAtual(), pub: 'p0', estudos: 3 });
  put('estudos', mesAnterior() + '_p0', { mes: mesAnterior(), pub: 'p0', estudos: 2 });
  put('atividade', null, { pub: 'p0', data: addDays(mesAnterior() + '-10', 0), horas: 40, minutos: 30, creditos: 5 });
  put('atividade', null, { pub: 'p0', data: addDays(today(), -1), horas: 2, minutos: 30, creditos: 0 });
  put('atividade', null, { pub: 'p0', data: addDays(today(), -3), horas: 3, minutos: 0, creditos: 1 });
  (() => { const d = parse(today()); d.setDate(1); d.setMonth(d.getMonth() - 2); const m2 = mesDe(iso(d));
    put('relatorios', m2 + '_p2', { mes: m2, pub: 'p2', nome: 'Eduardo Menezes', participou: true, estudos: 2, horas: 0, enviadoEm: iso(d) });
    put('relatorios', m2 + '_p0', { mes: m2, pub: 'p0', nome: 'Jonata Lima', participou: true, estudos: 3, horas: 52, enviadoEm: iso(d) }); })();
  put('relatorios', mesAnterior() + '_p2', { mes: mesAnterior(), pub: 'p2', nome: 'Eduardo Menezes', participou: true, estudos: 1, horas: 0, enviadoEm: today() });
  put('solicitacoes', null, { tipo: 'pioneiro', pub: 'p3', nome: 'Amanda Silva', meses: [mesAtual()], continuo: false, horas: 30, obs: '', status: 'pendente', criado: today() });
  // registro real (S-13, ano de serviço 2026): [número, dirigente, designação, conclusão]
  terrIniciais(put);
  store._save();
}

// ================= ícones =================
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = {
  inicio: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  programas: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
  mais: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  territorios: svg('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  eu: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  copy: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>')
};
const TABS_ALL = [['inicio', 'Início'], ['programas', 'Programas'], ['mais', 'Mais'], ['territorios', 'Territórios'], ['eu', 'Eu']];
const tabsFor = () => TABS_ALL.filter(([k]) => k !== 'territorios' || ver('territorios'));
let TABS = TABS_ALL;
// tela -> [título, aba-mãe]
const ROUTES = {
  inicio: ['Início'], programas: ['Programas'], mais: ['Mais'], territorios: ['Territórios'], eu: ['Eu'],
  vmcDet: ['Vida e Ministério', 'programas'], fdsDet: ['Fim de semana', 'programas'], vmcLista: ['Vida e Ministério', 'programas'], fdsLista: ['Fim de semana', 'programas'],
  campo: ['Serviço de campo', 'programas'], carrinho: ['Testemunho público', 'programas'], personalizadas: ['Programações', 'programas'],
  anuncios: ['Quadro de anúncios', 'inicio'], eventos: ['Eventos', 'inicio'],
  designacoes: ['Designações mecânicas', 'mais'], publicadores: ['Publicadores', 'mais'], solicitacoes: ['Solicitações', 'mais'], relatorios: ['Relatórios', 'mais'],
  atividade: ['Atividade de campo', 'eu'], historico: ['Histórico de campo', 'eu'], pioneiro: ['Pioneiro auxiliar', 'eu'], ausencia: ['Ausência', 'eu'], contato: ['Meu contato', 'eu'], emergencia: ['Emergência', 'eu'], grupo: ['Meu grupo', 'eu'], pedirTerr: ['Pedir território', 'eu'], publicacoes: ['Publicações', 'eu'], relatorio: ['Relatório do mês', 'eu'],
  mapaGeral: ['Mapa geral', 'territorios'], cargos: ['Cargos e funções', 'mais'],
  config: ['Configurações', 'inicio']
};

function go(v, param = null) {
  if (v === S.view && param === S.param) return;
  let w = $('#wipe'); if (!w) { w = document.createElement('div'); w.id = 'wipe'; w.className = 'wipe'; document.body.appendChild(w); }
  w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
  setTimeout(() => { S.view = v; S.param = param; LS.set('cg_view', v); LS.set('cg_param', param); render(); window.scrollTo(0, 0); }, 230);
}
let backTo = null;

// ================= render =================
function render() {
  const app = $('#app');
  if (!meP()) { app.innerHTML = loginHTML(); bindLogin(); return; }
  syncCargos(); TABS = tabsFor();
  if (!ROUTES[S.view] || ((S.view === 'territorios' || S.view === 'mapaGeral') && !ver('territorios'))) S.view = 'inicio';
  const [title, parent] = ROUTES[S.view];
  const tab = parent || S.view;
  backTo = parent ? (S.view === 'vmcDet' || S.view === 'fdsDet' ? (S._from || parent) : parent) : null;
  const body = VIEWS[S.view]();
  const idx = TABS.findIndex(t => t[0] === tab) + 1;
  app.innerHTML = `
    <header class="top"><div class="kick-row"><span class="kicker">${pad(idx)} · ${esc(TABS[idx - 1][1])}</span><span class="ver">v${VERSAO}</span></div>
      ${parent ? `<button class="back" data-back="1">‹</button>` : ''}
      <h1>${esc(S.view === 'inicio' ? (cfg().nome || 'Congregação') : title)}</h1>
      ${temCargo(meP()) ? `<span class="badge">${esc(isSupremo(meP()) ? 'Admin supremo' : isAdm(meP()) ? 'Admin' : isElder(meP()) ? 'Ancião' : isSup(meP()) ? 'Superintendente' : cargosDe(meP()).length > 1 ? 'Cargos' : CARGOS[cargosDe(meP())[0]][0])}</span>` : ''}
      ${S.view !== 'config' ? `<button class="gear" data-go="config" aria-label="Configurações">${IC.gear}</button>` : ''}
    </header>
    <main>${store.demo ? '<div class="banner">Modo demonstração: os dados ficam só neste aparelho até conectarmos o banco de dados.</div>' : ''}${body}</main>
    <nav class="tabs">${TABS.map(([k, l]) => `<button data-go="${k}" class="${tab === k ? 'on' : ''}">${IC[k]}<span>${l}</span></button>`).join('')}</nav>`;
  bind(app);
  if (ultimaLimpeza !== today() + S.me) setTimeout(limpeza, 400);
}
function bind(root) {
  root.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.stopPropagation(); if (b.dataset.from) S._from = b.dataset.from; go(b.dataset.go, b.dataset.p || null); });
  root.querySelectorAll('[data-back]').forEach(b => b.onclick = () => go(backTo || 'inicio'));
  root.querySelectorAll('[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); ACTIONS[b.dataset.act](b.dataset.id, b); });
}

// ================= login =================
const ART = `<svg class="login-art" viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><rect width="6" height="6" fill="#fff"/><rect width="2" height="6" fill="#0d0d0d"/></pattern>
  <pattern id="h2" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(70)"><rect width="1.6" height="5" fill="#0d0d0d"/></pattern></defs>
  <rect x="2" y="2" width="296" height="216" fill="#fffdf8" stroke="#0d0d0d" stroke-width="3"/>
  <circle cx="150" cy="104" r="78" fill="#1446e0" stroke="#0d0d0d" stroke-width="3"/><circle cx="150" cy="104" r="78" fill="url(#h2)" opacity=".18"/>
  <path d="M2 150 C60 128 100 160 150 142 S240 120 298 140 V218 H2Z" fill="url(#h)" stroke="#0d0d0d" stroke-width="3"/>
  <path d="M150 218 C150 196 120 186 132 170 S170 154 160 142" fill="none" stroke="#fffdf8" stroke-width="9" stroke-linecap="round"/>
  <path d="M150 218 C150 196 120 186 132 170 S170 154 160 142" fill="none" stroke="#0d0d0d" stroke-width="1.5" stroke-dasharray="5 6"/>
  <path d="M158 96 c0-16 22-16 22 0 c0 14 -11 26 -11 26 s-11 -12 -11 -26z" fill="#7fd0ff" stroke="#0d0d0d" stroke-width="3"/><circle cx="169" cy="96" r="4" fill="#0d0d0d"/>
</svg>`;
const WELCOME_ART = `<svg class="wl-art" viewBox="0 -110 400 440" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
  <defs><pattern id="wh1" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(100)"><rect width="1.7" height="6" fill="#0d0d0d"/></pattern>
  <pattern id="wh2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="1.1" height="4" fill="#0d0d0d"/></pattern>
  <pattern id="wh3" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><rect width="1" height="7" fill="#fff" fill-opacity=".35"/></pattern></defs>
  <rect y="-110" width="400" height="440" fill="#1446e0"/><rect y="-110" width="400" height="440" fill="url(#wh3)"/>
  <g class="wl-sun"><circle cx="300" cy="96" r="58" fill="#7fd0ff" stroke="#0d0d0d" stroke-width="3"/><circle cx="300" cy="96" r="58" fill="url(#wh2)" opacity=".35"/></g>
  <path d="M0 210 C70 170 140 200 210 178 S330 150 400 172 V330 H0Z" fill="#fffdf8" stroke="#0d0d0d" stroke-width="3"/>
  <path d="M0 210 C70 170 140 200 210 178 S330 150 400 172 V330 H0Z" fill="url(#wh1)" opacity=".9"/>
  <g stroke="#0d0d0d" stroke-width="3" fill="#fffdf8">
    <path d="M60 214 v-34 l24 -20 24 20 v34z"/><rect x="76" y="194" width="14" height="20" fill="#1446e0"/>
    <path d="M128 206 v-26 l18 -15 18 15 v26z"/><rect x="140" y="188" width="10" height="10" fill="#7fd0ff"/>
    <path d="M300 200 v-30 l22 -18 22 18 v30z"/><rect x="314" y="182" width="12" height="12" fill="#1446e0"/>
  </g>
  <path class="wl-road" d="M205 330 C200 290 250 270 235 240 S200 205 222 188" fill="none" stroke="#fffdf8" stroke-width="16" stroke-linecap="round"/>
  <path class="wl-road" d="M205 330 C200 290 250 270 235 240 S200 205 222 188" fill="none" stroke="#0d0d0d" stroke-width="3" stroke-dasharray="9 9"/>
  <g class="wl-pin"><path d="M222 186 c-22 -26 -32 -40 -32 -56 a32 32 0 0 1 64 0 c0 16 -10 30 -32 56z" fill="#7fd0ff" stroke="#0d0d0d" stroke-width="3.5"/><circle cx="222" cy="130" r="11" fill="#0d0d0d"/></g>
</svg>`;
function loginHTML() {
  const c = cfg();
  if (!c.nome || !D.publicadores.length) return `<div class="login">${ART}<h1>Configurar <span>o app</span></h1><p class="muted">Primeiro acesso. Defina os dados da congregação.</p>
      <div class="f"><label>Nome da congregação</label><input id="lg_nome"></div>
      <div class="f"><label>Seu nome (sua conta será o admin supremo)</label><input id="lg_me"></div>
      <button class="btn block" id="lg_setup">Começar</button></div>`;
  if (!S.pinTela) return `<div class="welcome">
      <div class="wl-top">${WELCOME_ART}</div>
      <div class="wl-bot">
        <span class="kicker">01 · Bem-vindo</span>
        <h1 class="wl-h">ZeroByte <span>Nexus</span></h1>
        <p class="wl-sub">Informações na palma da mão</p>
        <button class="btn block wl-go" id="wl_go">Começar <b>→</b></button>
      </div></div>`;
  const demo = store.demo ? `<details class="pin-demo"><summary>PINs de demonstração</summary><div>1111 Andrey (ancião + admin)<br>1212 Marcello (ancião)<br>2222 Jonata (admin supremo)<br>3333 Eduardo (servo de publicações)<br>6666 Carlos (dirigente)<br>8888 Hugo (superintendente)<br>7013 Rafael (publicador)<br>7003 Amanda (pioneira)</div></details>` : '';
  return `<div class="pinscreen">
      <header class="top pin-top"><div class="kick-row"><span class="kicker">02 · Entrar</span></div><button class="back" id="pin_back" aria-label="Voltar">‹</button><h1>Seu PIN</h1></header>
      <div class="pin-body">
        <p class="pin-lead">Digite os 4 números do seu PIN pessoal.</p>
        <div class="pin-boxes" id="pin_boxes">${'<i></i>'.repeat(4)}</div>
        <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<span></span><button data-k="0">0</button><button data-k="del" aria-label="Apagar">⌫</button></div>
        <p class="small muted pin-help">Não sabe seu PIN? Peça a um administrador da congregação.</p>
        ${/Android/i.test(navigator.userAgent) && !window.Capacitor ? '<a class="btn sm ghost-ink" style="margin-top:10px;text-decoration:none" href="https://github.com/limajonata230-ops/zerobyte-nexus/releases/download/android-latest/ZeroByte-Nexus.apk">📲 Baixar o app para Android</a>' : ''}
        ${demo}
      </div></div>`;
}
function bindLogin() {
  const b = $('#lg_setup');
  if (b) b.onclick = async () => {
    const nome = $('#lg_nome').value.trim(), me = $('#lg_me').value.trim(), padm = genPin();
    if (!nome || !me) return toast('Preencha tudo');
    await store.put('config', 'app', { ...cfg(), nome, horaVmc: '19:30', horaFds: '19:00', relatoriosAtivos: true });
    await terrIniciais((c, i, o) => store.put(c, i, o));
    const id = await store.put('publicadores', null, { nome: me, grupo: '', tipo: 'Publicador', priv: '', cargos: ['admin'], supremo: true, pin: padm });
    S.me = id; LS.set('cg_me', id); render();
    ask('Seu PIN pessoal', `<p>O app gerou seu PIN automaticamente:</p><div class="pin-big">${padm}</div><p class="small muted">Anote. É com ele que você entra no app. Como administrador, você vê o PIN de todos em Mais › Publicadores.</p>`, () => true, 'Anotei');
  };
  const wg = $('#wl_go');
  if (wg) { wg.onclick = () => { S.pinTela = true; const w = $('.welcome'); w.classList.add('out'); setTimeout(render, 260); }; return; }
  if (!$('#pin_boxes')) return;
  $('#pin_back').onclick = () => { S.pinTela = false; render(); };
  let v = '';
  const boxes = [...document.querySelectorAll('#pin_boxes i')];
  const show = () => boxes.forEach((x, i) => x.classList.toggle('on', i < v.length));
  const tentar = () => {
    if (Date.now() < (bindLogin.bloq || 0)) { toast('Aguarde alguns segundos e tente de novo'); v = ''; show(); return; }
    const p = D.publicadores.find(x => String(x.pin) === v);
    if (p) { setTimeout(limpeza, 500); S.me = p.id; LS.set('cg_me', p.id); S.view = 'inicio'; LS.set('cg_view', 'inicio'); S.pinTela = false; render(); return; }
    bindLogin.erros = (bindLogin.erros || 0) + 1; toast('PIN incorreto');
    if (bindLogin.erros >= 5) { bindLogin.bloq = Date.now() + 30000; bindLogin.erros = 0; }
    const bx = $('#pin_boxes'); bx.classList.add('err'); setTimeout(() => { bx.classList.remove('err'); v = ''; show(); }, 420);
  };
  const tecla = k => { if (k === 'del') v = v.slice(0, -1); else if (v.length < 4) v += k; show(); if (v.length === 4) setTimeout(tentar, 120); };
  document.querySelectorAll('.keypad [data-k]').forEach(b => b.onclick = () => tecla(b.dataset.k));
  document.onkeydown = e => { if (!$('#pin_boxes')) { document.onkeydown = null; return; } if (/^[0-9]$/.test(e.key)) tecla(e.key); else if (e.key === 'Backspace') tecla('del'); };
}

// ================= peças reutilizáveis =================
const VIEWS = {};
const dateBox = s => `<div class="date-box">${s ? pad(parse(s).getDate()) : '–'}<small>${s ? DIAS[parse(s).getDay()] : ''}</small></div>`;
const adminBtns = (kind, id) => can(permOf(kind)) ? `<button class="icon-btn" data-act="edit_${kind}" data-id="${esc(id)}" title="Editar">✎</button>` : '';
const fab = act => can(permOf(act.replace(/^new_/, ''))) ? `<button class="fab" data-act="${act}">+</button>` : '';
const linkRow = (go, ic, t, sub, extra = '', p = '') => `<button class="link-row" data-go="${go}" ${p ? `data-p="${esc(p)}"` : ''}><span class="lr-ic">${ic}</span><span class="sp"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</span>${extra}<span class="chev">${IC.chev}</span></button>`;
const block = (title, inner, cls = '') => `<section class="card blk ${cls}"><h3 class="blk-t">${title}</h3>${inner}</section>`;

function minhasDesignacoes(dias = 21) {
  const out = [], from = today(), to = addDays(from, dias);
  const inR = d => d >= from && d <= to;
  D.vmc.filter(x => inR(x.data) && !eventoSemana(x.data)).forEach(x => {
    if (isMe(x.presidente)) out.push([x.data, 'Presidente — Vida e Ministério', 'vmcDet', x.id]);
    if (isMe(x.oracaoIni)) out.push([x.data, 'Oração inicial', 'vmcDet', x.id]);
    if (isMe(x.oracaoFim)) out.push([x.data, 'Oração final', 'vmcDet', x.id]);
    (x.partes || []).forEach(p => { if (isMe(p.n)) out.push([x.data, p.t, 'vmcDet', x.id]); if (isMe(p.n2)) out.push([x.data, (/estudo/i.test(p.t) ? 'Leitor — ' : 'Ajudante — ') + p.t, 'vmcDet', x.id]); });
  });
  D.fds.filter(x => inR(x.data) && !eventoSemana(x.data)).forEach(x => {
    if (isMe(x.presidente)) out.push([x.data, 'Presidente — fim de semana', 'fdsDet', x.id]);
    if (isMe(x.leitor)) out.push([x.data, 'Leitor de A Sentinela', 'fdsDet', x.id]);
  });
  const DL = { indicadores: 'Indicador', som: 'Áudio e vídeo', microfones: 'Microfone volante', palco: 'Palco' };
  D.designacoes.filter(x => inR(x.data)).forEach(x => Object.keys(DL).forEach(k => { if (isMe(x[k])) out.push([x.data, DL[k], 'designacoes', null]); }));
  D.carrinho.filter(x => inR(x.data) && (x.inscritos || []).some(isMe)).forEach(x => out.push([x.data, `Carrinho ${x.hora}`, 'carrinho', null]));
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
const ebDe = m => Number((D.estudos.find(x => x.id === `${m}_${S.me}`) || {}).estudos) || 0;
const ebStepper = m => `<div class="eb-step"><span class="sp"><b>Estudos bíblicos</b><small>pessoas diferentes que você estudou em ${esc(mesNome(m))}</small></span><button class="icon-btn" data-act="ebMenos" data-id="${m}">−</button><b class="eb-n">${ebDe(m)}</b><button class="icon-btn" data-act="ebMais" data-id="${m}">+</button></div>`;
const resumoMes = m => { const at = D.atividade.filter(a => a.pub === S.me && mesDe(a.data) === m), min = somaHoras(at); return { min, horas: Math.floor(min / 60), sobra: min % 60, cred: somaCred(at), eb: ebDe(m), dias: at.length }; };
const minhaAtividade = mes => D.atividade.filter(a => a.pub === S.me && mesDe(a.data) === mes);
const somaHoras = list => list.reduce((s, a) => s + (Number(a.horas) || 0) * 60 + (Number(a.minutos) || 0), 0);
const somaCred = list => list.reduce((s, a) => s + (Number(a.creditos) || 0), 0);
const fmtH = min => min % 60 ? `${Math.floor(min / 60)}h${pad(min % 60)}` : `${min / 60}`;

// ================= INÍCIO =================
VIEWS.inicio = () => {
  const me = meP(), mA = mesAtual(), mP = mesAnterior(), c = cfg();
  const at = minhaAtividade(mA), rel = D.relatorios.find(r => r.id === `${mP}_${S.me}`), relAt = D.relatorios.find(r => r.id === `${mA}_${S.me}`);
  const prox = minhasDesignacoes(30).slice(0, 4);
  const nAn = D.anuncios.filter(a => a.tipo === 'Anúncio' && vivo(a)).length, nDoc = D.anuncios.filter(a => a.tipo === 'Documento' && vivo(a)).length;
  const evs = D.anuncios.filter(a => a.tipo === 'Evento' && a.data >= today()).sort((a, b) => a.data.localeCompare(b.data));
  return `${avisosArquivo()}<div class="hello">Olá,<em>${esc((me.nome || '').split(' ')[0])}</em></div>
  <div class="grid2">
    ${isSup(me) ? (() => { const lista = pubs().filter(p => !isSup(p)), env = lista.filter(p => D.relatorios.some(r => r.mes === mP && r.pub === p.id)).length;
      return `<section class="card blk tall"><h3 class="blk-t">Relatórios</h3><div class="mini-t">${esc(mesNome(mP))}</div><div class="kpis" style="grid-template-columns:1fr"><div><small>Enviados</small><b>${env}/${lista.length}</b></div></div><button class="btn sm" style="margin-top:10px" data-go="relatorios">Ver relatórios</button></section>`; })()
    : isPioneer(me) ? `<section class="card blk tall"><div class="row"><h3 class="blk-t sp">Relatório</h3><button class="plus" data-go="atividade" aria-label="Adicionar atividade">+</button></div>
      <div class="mini-t">${esc(mesNome(mA))}</div>
      <div class="kpis"><div><small>Horas</small><b>${fmtH(somaHoras(at))}</b></div><div><small>Cr</small><b>${somaCred(at) || '—'}</b></div><div><small>EBs</small><b>${ebDe(mA)}</b></div></div>
      <div class="mini-t" style="margin-top:12px">${esc(mesNome(mP))} ${rel ? '<span class="ok-dot">✓</span>' : '<span class="warn-dot">!</span>'}</div>
      ${c.relatoriosAtivos === false ? '<div class="small muted">Os anciãos locais não ativaram o envio de relatórios.</div>' : rel ? '<div class="small muted">Relatório enviado.</div>' : '<button class="btn sm" data-go="relatorio">Enviar relatório</button>'}
    </section>` : `<section class="card blk tall"><h3 class="blk-t">Relatório</h3>
      ${c.relatoriosAtivos === false ? '<div class="small muted">Os anciãos locais não ativaram o envio de relatórios.</div>' : [mP, mA].map(m => { const r = D.relatorios.find(x => x.id === `${m}_${S.me}`);
        return `<div class="mini-t" style="margin-top:6px">${esc(mesNome(m))} ${r ? '<span class="ok-dot">✓</span>' : ''}</div>${r ? '<div class="small muted">Fui ao campo · enviado</div>' : `<button class="btn sm" data-act="fuiCampo" data-id="${m}">Fui ao campo</button>`}`; }).join('')}
    </section>`}
    <section class="card blk tall soft"><h3 class="blk-t">Próximas</h3>
      ${prox.length ? prox.map(([d, t, v, id]) => `<button class="mini-row" data-go="${v}" ${id ? `data-p="${esc(id)}"` : ''} data-from="inicio"><b>${fmtShort(d)}</b><span>${esc(t)}</span></button>`).join('') : '<div class="muted">Nenhuma</div>'}
    </section>
  </div>
  ${block('Quadro de anúncios', `${linkRow('anuncios', '📣', 'Anúncios', '', `<span class="count">${nAn}</span>`, 'Anúncio')}${linkRow('anuncios', '📄', 'Documentos e cartas', '', `<span class="count">${nDoc}</span>`, 'Documento')}`)}
  ${block('Eventos', evs.length ? evs.slice(0, 4).map(e => linkRow('eventos', '🏛️', esc(e.titulo), fmtLong(e.data), '', e.id)).join('') : '<div class="muted">Nenhum evento marcado.</div>')}`;
};

// ================= PROGRAMAS =================
function meetingList(col, n) {
  const all = D[col].filter(x => x.data >= today()).sort((a, b) => a.data.localeCompare(b.data));
  const open = S.open[col], items = open ? all : all.slice(0, n);
  return items.map(x => { const ev = eventoSemana(x.data);
    return `<button class="link-row" data-go="${col}Det" data-p="${esc(x.id)}" data-from="programas"><span class="sp"><b class="reg">${fmtLong(x.data)}</b>${ev ? `<small>${esc(ev.titulo)}</small>` : ''}</span><span class="chev round">${IC.chev}</span></button>`; }).join('')
    + (all.length > n ? `<button class="more" data-act="toggleOpen" data-id="${col}">${open ? 'Mostrar menos' : 'Mostrar mais'} ${IC.down}</button>` : '')
    + (all.length ? '' : '<div class="muted">Nenhuma programação cadastrada.</div>')
    + (can(col) ? `<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><button class="btn sm sec2" data-act="new_${col}">+ Adicionar</button>${col === 'vmc' ? '<button class="btn sm" data-act="importar">⤓ Importar apostila</button>' : '<button class="btn sm" data-act="importarFds">⤓ Importar PDF de discursos</button>'}</div>` : '');
}
VIEWS.programas = () => {
  const carr = D.carrinho.filter(x => x.data >= today()).length;
  const prog = D.programas.filter(p => !p.data || p.data >= today());
  return block('Reunião Vida e Ministério', meetingList('vmc', 3), 'sec-vmc') +
    block('Reunião de fim de semana', meetingList('fds', 3), 'sec-fds') +
    block('Serviço de campo', (() => { const pr = proximasSaidas(7).slice(0, 3); return pr.length ? pr.map(s => `<div class="mini-row static"><b>${fmtShort(s.data)} ${esc(s.hora || '')}${s.alt ? ` · ${esc(s.extra ? 'extra' : s.alt.tipo.toLowerCase())}` : ''}</b><span>${s.alt && s.alt.tipo === 'Cancelada' ? '<s>' : ''}${esc(s.local || '')} · ${nameTag(s.dirigente)}${s.alt && s.alt.tipo === 'Cancelada' ? '</s>' : ''}</span></div>`).join('') + `<button class="more" data-go="campo">Ver todas ${IC.chev}</button>` : '<div class="muted">Nenhum</div>' + `<button class="more" data-go="campo">Ver saídas ${IC.chev}</button>`; })()) +
    block('Testemunho público', linkRow('carrinho', '🛒', 'Horários do carrinho', carr ? `${carr} horário(s) disponível(is)` : 'Nenhum horário marcado')) +
    block('Programações personalizadas', prog.length ? prog.map(p => linkRow('personalizadas', '🗓️', esc(p.titulo), p.data ? fmtLong(p.data) : '', '', p.id)).join('') : '<div class="muted">Nenhum</div>' + (can('programas') ? `<button class="btn sm sec2" style="margin-top:10px" data-act="new_programas">+ Adicionar</button>` : ''));
};

// ---------- Vida e Ministério (detalhe) ----------
const SECS = {
  tesouros: { t: 'TESOUROS DA PALAVRA DE DEUS', c: '#2b6f76', bg: '#d8ebec', ic: '◆' },
  ministerio: { t: 'FAÇA SEU MELHOR NO MINISTÉRIO', c: '#b17e0f', bg: '#fbefd3', ic: '❦' },
  vida: { t: 'NOSSA VIDA CRISTÃ', c: '#b23b2e', bg: '#f7dcd8', ic: '✦' }
};
function vmcHorarios(x) {
  let t = toMin(x.hora || cfg().horaVmc || '19:30');
  const rows = { ini: t, coment: t + 5 }; t += 6;
  const ps = (x.partes || []).map((p, i) => ({ ...p, i }));
  const out = {};
  ps.filter(p => p.s === 'tesouros').forEach(p => { out[p.i] = t; t += Number(p.m) || 0; if (/leitura/i.test(p.t)) t += 1; });
  ps.filter(p => p.s === 'ministerio').forEach(p => { out[p.i] = t; t += (Number(p.m) || 0) + 1; });
  rows.cantMeio = t; t += 4;
  ps.filter(p => p.s === 'vida').forEach(p => { out[p.i] = t; t += Number(p.m) || 0; });
  rows.revisao = t; rows.fim = t + 5; rows.final = t + 5;
  return { rows, out, ps };
}
VIEWS.vmcDet = () => {
  const x = D.vmc.find(v => v.id === S.param); if (!x) return '<div class="empty">Programação não encontrada.</div>';
  const ev = eventoSemana(x.data);
  const { rows, out, ps } = vmcHorarios(x);
  let n = 0;
  const line = (time, txt, right = '', bg = '#e3ebfb', c = '#1d3f9e') => `<div class="pr" style="--bg:${bg};--c:${c}"><span class="pt">${time}</span><span class="pd">${txt}</span>${right ? `<span class="pn">${right}</span>` : ''}</div>`;
  const sec = k => { const S2 = SECS[k], list = ps.filter(p => p.s === k);
    return `<div class="ph" style="--c:${S2.c};--bg:${S2.bg}"><span class="pi">${S2.ic}</span><span class="sp">${S2.t}</span>${k === 'vida' && x.canticoMeio ? `<span class="pc">${esc(x.canticoMeio)}</span>` : ''}</div>` +
      list.map(p => { n++; const ebc = /estudo b[ií]blico/i.test(p.t);
        const right = ebc ? `<small>Dirigente</small> ${nameTag(p.n)}${p.n2 ? ` <small>Leitor</small> ${nameTag(p.n2)}` : ''}` : nameTag(p.n) + (p.n2 ? ' & ' + nameTag(p.n2) : '');
        return line(hm(out[p.i]), `${n}. ${esc(p.t)}${p.m ? ` (${esc(p.m)} min.)` : ''}`, right, S2.bg, S2.c); }).join(''); };
  return `<div class="det-head"><b>${fmtLong(x.data)}</b><span>${esc(hm(toMin(x.hora || cfg().horaVmc || '19:30')))}</span>${adminBtns('vmc', x.id)}</div>
    ${ev ? `<div class="banner">${esc(ev.titulo)}: ${esc(ev.texto || 'sem reunião na congregação nesta semana.')}</div>` : ''}
    <div class="prog">
      <div class="pbar">${fmt(x.data)}${x.leitura ? ' | ' + esc(x.leitura) : ''}</div>
      ${line(hm(rows.ini), esc(x.canticoIni || 'Cântico'), `<small>Oração inicial</small> ${nameTag(x.oracaoIni)}`)}
      ${line(hm(rows.coment), 'Comentários iniciais (1 min.)', `<small>Presidente</small> ${nameTag(x.presidente)}`)}
      ${sec('tesouros')}${sec('ministerio')}${sec('vida')}
      ${line(hm(rows.revisao), 'Revisão / Prévia / Anúncios (3 min.)')}
      ${line(hm(rows.final), esc(x.canticoFim || 'Cântico'), `<small>Oração final</small> ${nameTag(x.oracaoFim)}`)}
    </div>
    <button class="btn sm sec2" style="margin-top:12px" data-act="copyVmc" data-id="${esc(x.id)}">${IC.copy} Copiar programação</button>`;
};

// ---------- Fim de semana (detalhe) ----------
VIEWS.fdsDet = () => {
  const x = D.fds.find(v => v.id === S.param); if (!x) return '<div class="empty">Programação não encontrada.</div>';
  const ev = eventoSemana(x.data), mec = D.designacoes.find(d => d.data === x.data);
  const kv = (k, v) => `<div class="kv"><b>${k}</b><span>${v}</span></div>`;
  return `<div class="det-head"><b>${fmtLong(x.data)}</b><span>${esc(x.hora || cfg().horaFds || '19:00')}</span>${adminBtns('fds', x.id)}</div>
    ${ev ? `<div class="banner">${esc(ev.titulo)}: ${esc(ev.texto || '')}</div>` : ''}
    <div class="sbar" style="--c:#1e3a99">DISCURSO PÚBLICO<button class="sbar-btn" data-act="copyFds" data-id="${esc(x.id)}" aria-label="Copiar">${IC.copy}</button></div>
    <div class="kvs">${kv('Título', esc(x.tema || '—') + (x.numero ? ` (${esc(x.numero)})` : ''))}${kv('Orador', esc(x.orador || '—'))}${kv('Congregação', esc(x.congregacao || '—'))}</div>
    <div class="sbar" style="--c:#4f68b5">TAREFAS DE FIM DE SEMANA</div>
    <div class="kvs">${kv('Presidente', nameTag(x.presidente))}${kv('Leitor de A Sentinela', nameTag(x.leitor))}${kv('Hospitalidade', esc(x.hospitalidade || '—'))}</div>
    <div class="sbar" style="--c:#0d0d0d">DESIGNAÇÕES MECÂNICAS</div>
    <div class="kvs">${mec ? kv('Indicadores', nameTag(mec.indicadores)) + kv('Áudio e vídeo', nameTag(mec.som)) + kv('Microfones volantes', nameTag(mec.microfones)) + kv('Palco', nameTag(mec.palco)) : '<span class="muted">Nenhum</span>'}</div>
    <div class="sbar" style="--c:#2b6f76">LIMPEZA E CUIDADOS COM O JARDIM</div>
    <div class="kvs">${mec && mec.limpeza ? kv('Responsável', esc(mec.limpeza)) : '<span class="muted">Nenhum</span>'}</div>`;
};

// ---------- campo / carrinho / personalizadas ----------
const ORD = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const ordDia = d => { const i = ORD.findIndex(x => (d || '').toLowerCase().startsWith(x.slice(0, 3))); return i < 0 ? 9 : i; };
const DOW_ORD = d => (parse(d).getDay() + 6) % 7; // 0 = segunda
function proximasSaidas(dias = 7) {
  const out = [];
  for (let k = 0; k < dias; k++) {
    const d = addDays(today(), k), alts = D.saidasAlt.filter(a => a.data === d);
    D.saidas.filter(s => ordDia(s.dia) === DOW_ORD(d)).forEach(s => { const a = alts.find(x => x.saida === s.id);
      out.push(a ? { ...s, ...(a.tipo === 'Cancelada' ? {} : Object.fromEntries(['hora', 'local', 'dirigente', 'obs'].filter(f => a[f]).map(f => [f, a[f]]))), data: d, alt: a } : { ...s, data: d }); });
    alts.filter(a => !a.saida).forEach(a => out.push({ ...a, data: d, alt: a, extra: true }));
  }
  return out.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
}
const saidaRow = x => `<div class="card ${x.alt && x.alt.tipo === 'Cancelada' ? 'cancel' : ''}"><div class="row">${dateBox(x.data)}<div class="sp"><h3>${esc(x.hora || '')} · ${esc(x.local || '')}</h3><div class="small">Dirigente: ${nameTag(x.dirigente)}</div><div class="small muted">${esc(x.grupo || '')}${x.obs ? ' · ' + esc(x.obs) : ''}</div></div>
  ${x.alt ? `<span class="pill ${x.alt.tipo === 'Cancelada' ? 'bad' : 'warn'}">${esc(x.extra ? 'Extra' : x.alt.tipo)}</span>` : ''}${x.alt ? adminBtns('saidasAlt', x.alt.id) : ''}</div></div>`;
VIEWS.campo = () => {
  const prox = proximasSaidas(7);
  return `<div class="sec">Próximos 7 dias</div>${prox.length ? prox.map(saidaRow).join('') : '<div class="empty">Nenhuma saída nos próximos dias.</div>'}
    ${can('saidas') ? '<button class="btn block sec2" data-act="new_saidasAlt" style="margin-bottom:6px">+ Mudança só para um dia</button><p class="small muted" style="margin:0 2px 8px">A mudança vale só naquela data e some sozinha depois. As saídas fixas continuam iguais.</p>' : ''}
    <div class="sec">Saídas fixas da semana</div>` + campoFixas();
};
const campoFixas = () => {
  const items = [...D.saidas].sort((a, b) => ordDia(a.dia) - ordDia(b.dia) || (a.hora || '').localeCompare(b.hora || ''));
  return (items.length ? items.map(x => `<div class="card"><div class="row"><div class="date-box" style="min-width:64px">${esc((x.dia || '').slice(0, 3))}<small>${esc(x.hora || '')}</small></div>
      <div class="sp"><h3>${esc(x.local || '')}</h3><div class="small">Dirigente: ${nameTag(x.dirigente)}</div><div class="small muted">${esc(x.grupo || '')}${x.obs ? ' · ' + esc(x.obs) : ''}</div></div>${adminBtns('saidas', x.id)}</div></div>`).join('') : '<div class="empty">Nenhuma saída cadastrada.</div>') + fab('new_saidas');
};
VIEWS.carrinho = () => {
  const items = D.carrinho.filter(x => (x.data || '') >= today()).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  return (items.length ? items.map(x => {
    const ins = x.inscritos || [], cheio = ins.length >= Number(x.vagas || 2), eu = ins.some(isMe);
    return `<div class="card"><div class="row">${dateBox(x.data)}<div class="sp"><h3>${esc(x.hora || '')}</h3><div class="small muted">${esc(x.local || '')}</div></div>${adminBtns('carrinho', x.id)}</div>
      <div style="margin:10px 0 8px" class="small">${ins.length ? ins.map(nameTag).join(', ') : '<span class="muted">Ninguém ainda</span>'} <span class="muted">(${ins.length}/${esc(x.vagas || 2)})</span></div>
      ${isSup(meP()) ? '' : eu ? `<button class="btn sm bad" data-act="cartOut" data-id="${esc(x.id)}">Sair deste horário</button>` : cheio ? '<span class="pill">Completo</span>' : `<button class="btn sm ok" data-act="cartIn" data-id="${esc(x.id)}">Quero participar</button>`}</div>`;
  }).join('') : '<div class="empty">Nenhum horário de carrinho disponível.</div>') + fab('new_carrinho');
};
VIEWS.personalizadas = () => {
  const p = D.programas.find(x => x.id === S.param);
  if (!p) return '<div class="empty">Programação não encontrada.</div>';
  return `<div class="det-head"><b>${esc(p.titulo)}</b><span>${p.data ? fmtLong(p.data) : ''}</span>${adminBtns('programas', p.id)}</div><div class="card" style="white-space:pre-wrap">${esc(p.texto || '')}</div>`;
};

// ---------- anúncios / eventos ----------
const vivo = a => (a.ate || a.data || '9999') >= today();
const anuncioCard = a => `<div class="card"><div class="row"><span class="pill ${a.tipo === 'Evento' ? '' : a.tipo === 'Documento' ? 'warn' : 'ok'}">${esc(a.tipo === 'Documento' ? 'Documento' : a.tipo || 'Anúncio')}</span><div class="sp muted small">${a.data ? fmtShort(a.data) : ''}${a.ate && can('anuncios') ? ` · até ${fmtShort(a.ate)}` : ''}</div>${adminBtns('anuncios', a.id)}</div>
  <h3 style="margin-top:8px">${esc(a.titulo || '')}</h3><div class="small" style="white-space:pre-wrap">${esc(a.texto || '')}</div></div>`;
VIEWS.anuncios = () => {
  const tipo = S.param || 'Anúncio';
  const items = D.anuncios.filter(a => a.tipo === tipo && vivo(a)).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return `<div class="seg"><button data-go="anuncios" data-p="Anúncio" class="${tipo === 'Anúncio' ? 'on' : ''}">Anúncios</button><button data-go="anuncios" data-p="Documento" class="${tipo === 'Documento' ? 'on' : ''}">Documentos e cartas</button></div>` +
    (items.length ? items.map(anuncioCard).join('') : '<div class="empty">Nada por aqui.</div>') + fab('new_anuncios');
};
VIEWS.eventos = () => {
  const items = D.anuncios.filter(a => a.tipo === 'Evento' && vivo(a)).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const sel = items.find(a => a.id === S.param);
  const rest = items.filter(a => a !== sel);
  return (sel ? anuncioCard(sel) + (rest.length ? '<div class="sec">Outros eventos</div>' : '') : '') + (rest.map(anuncioCard).join('') || (sel ? '' : '<div class="empty">Nenhum evento.</div>')) + fab('new_anuncios');
};

// ================= MAIS =================
VIEWS.mais = () => {
  const pend = D.solicitacoes.filter(s => s.status === 'pendente' && solVer().includes(s.tipo)).length;
  return block('Reuniões', linkRow('designacoes', '🎤', 'Designações mecânicas', 'Indicadores, áudio e vídeo, microfones, palco, limpeza')) +
    block('Campo', linkRow('campo', '📍', 'Saídas de campo', 'Dias, horários e dirigentes') + linkRow('carrinho', '🛒', 'Testemunho público', 'Escala do carrinho')) +
    block('Quadro', linkRow('anuncios', '📣', 'Anúncios e documentos', '') + linkRow('eventos', '🏛️', 'Eventos', 'Assembleias, congressos, visitas')) +
    (() => { const items = (ver('publicadores.ver') ? linkRow('publicadores', '👥', 'Publicadores', can('publicadores') ? `${D.publicadores.length} cadastrados · cargos e PINs` : `${D.publicadores.length} cadastrados`) : '') +
      (solVer().length ? linkRow('solicitacoes', '📥', 'Solicitações', solVer().map(t => SOL_T[t]).join(', '), pend ? `<span class="count">${pend}</span>` : '') : '') +
      (ver('relatorios') ? linkRow('relatorios', '📊', 'Relatórios da congregação', 'Quem enviou e totais') : '') +
      (isSupremo(meP()) ? linkRow('cargos', '🛡️', 'Cargos e funções', 'Criar cargos e escolher o que cada um pode fazer') : '');
      return items ? block('Responsabilidades', items) : ''; })();
};
VIEWS.designacoes = () => {
  const items = D.designacoes.filter(x => (x.data || '') >= today()).sort((a, b) => a.data.localeCompare(b.data));
  return (items.length ? items.map(x => `<div class="card"><div class="row">${dateBox(x.data)}<div class="sp"><h3>${fmtLong(x.data)}</h3></div>${adminBtns('designacoes', x.id)}</div>
    <div class="list" style="margin-top:8px">
      <div class="it"><div class="k">Indicadores</div><div class="v">${nameTag(x.indicadores)}</div></div>
      <div class="it"><div class="k">Áudio e vídeo</div><div class="v">${nameTag(x.som)}</div></div>
      <div class="it"><div class="k">Microfones</div><div class="v">${nameTag(x.microfones)}</div></div>
      <div class="it"><div class="k">Palco</div><div class="v">${nameTag(x.palco)}</div></div>
      <div class="it"><div class="k">Limpeza</div><div class="v">${esc(x.limpeza || '—')}</div></div></div></div>`).join('') : '<div class="empty">Nenhuma designação cadastrada.</div>') + fab('new_designacoes');
};
VIEWS.publicadores = () => {
  if (!ver('publicadores.ver')) return '<div class="empty">Apenas anciãos e administradores.</div>';
  const gs = {}; pubs().forEach(p => (gs[p.grupo || 'Sem grupo'] = gs[p.grupo || 'Sem grupo'] || []).push(p));
  const aus = id => D.solicitacoes.find(s => s.tipo === 'ausencia' && s.pub === id && s.status !== 'recusado' && s.fim >= today() && s.inicio <= addDays(today(), 30));
  return Object.keys(gs).sort().map(g => `<div class="sec">${esc(g)} (${gs[g].length})</div><div class="card list">${gs[g].map(p => { const a = aus(p.id);
    return `<div class="it"><div class="sp"><b>${esc(p.nome)}</b><div class="small muted">${esc(p.tipo || '')}${p.priv ? ' · ' + esc(p.priv) : ''}${p.telefone ? ' · ' + esc(p.telefone) : ''}</div>${isSupremo(p) || cargosDe(p).length ? `<div class="small"><b>${esc([isSupremo(p) ? '★ Admin supremo' : '', ...cargosDe(p).map(c => CARGOS[c][0])].filter(Boolean).join(' · '))}</b></div>` : ''}${can('publicadores') && p.pin ? `<div class="small">PIN <b class="pin-tag">${esc(p.pin)}</b></div>` : ''}${a ? `<div class="small"><span class="pill warn">Ausente ${fmtShort(a.inicio)} – ${fmtShort(a.fim)}</span></div>` : ''}</div>${adminBtns('publicadores', p.id)}</div>`; }).join('')}</div>`).join('') + fab('new_publicadores');
};
VIEWS.cargos = () => {
  if (!isSupremo(meP())) return '<div class="empty">Só o admin supremo gerencia os cargos.</div>';
  const ex = cfg().cargosExtra || {}, usa = k => D.publicadores.filter(p => (p.cargos || []).includes(k)).length;
  return `<p class="small muted">Crie cargos novos e escolha as funções de cada um. Depois, dê o cargo à pessoa em Mais › Publicadores › editar.</p>
    <div class="sec">Cargos criados por você</div>
    ${Object.keys(ex).length ? `<div class="card list">${Object.entries(ex).map(([k, c]) => `<div class="it"><div class="sp"><b>${esc(c.nome)}</b><div class="small muted">${(c.funcoes || []).map(f => esc((FUNCOES.find(x => x[0] === f) || [, f])[1])).join(' · ') || 'Nenhuma função'}</div><div class="small">${usa(k)} pessoa(s)</div></div><button class="icon-btn" data-act="cargoEdit" data-id="${esc(k)}" title="Editar">✎</button></div>`).join('')}</div>` : '<div class="empty">Nenhum cargo criado ainda.</div>'}
    <button class="btn block" data-act="cargoEdit" style="margin:12px 0 18px">+ Criar cargo</button>
    <div class="sec">Cargos do app</div>
    <div class="card list"><div class="it"><div class="sp"><b>★ Admin supremo</b><div class="small muted">Você. Acesso total, cria cargos, e ninguém pode alterar ou excluir esta conta.</div></div></div>
    ${CARGOS_BASE.map(k => `<div class="it"><div class="sp"><b>${esc(CARGOS[k][0])}</b><div class="small muted">${esc(CARGOS[k][1])}</div><div class="small">${usa(k)} pessoa(s)</div></div></div>`).join('')}</div>`;
};
function cargoEdit(id) {
  if (!isSupremo(meP())) return toast('Só o admin supremo');
  const ex = { ...(cfg().cargosExtra || {}) }, c = (id && ex[id]) || { nome: '', funcoes: [] };
  const m = abrirSheet(`<div class="row"><h2 class="sp" style="margin:0">${id ? 'Editar cargo' : 'Novo cargo'}</h2><button class="btn sm ghost-ink" data-x="1">Fechar</button></div>
    <div class="f" style="margin-top:12px"><label>Nome do cargo</label><input id="cg_nome" value="${esc(c.nome)}" placeholder="Ex.: Ajudante de territórios"></div>
    <div class="f"><label>Funções (o que esse cargo pode fazer)</label>${FUNCOES.map(([k, n]) => `<label class="chk" style="margin-bottom:8px"><input type="checkbox" class="cg_fn" value="${k}" ${(c.funcoes || []).includes(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
    <div class="row">${id ? '<button class="btn sm ghost-ink" id="cg_del">Excluir cargo</button>' : ''}<span class="sp"></span><button class="btn" id="cg_ok">Salvar</button></div>`);
  $('#cg_ok').onclick = async () => {
    const nome = $('#cg_nome').value.trim(), funcoes = $$('.cg_fn:checked', m).map(x => x.value);
    if (!nome) return toast('Dê um nome ao cargo');
    if (Object.values(CARGOS).some(([n], i) => n.toLowerCase() === nome.toLowerCase() && Object.keys(CARGOS)[i] !== id)) return toast('Já existe um cargo com esse nome');
    ex[id || 'c_' + uid().slice(0, 8)] = { nome, funcoes };
    await store.put('config', 'app', { ...cfg(), cargosExtra: ex }); closeModal(); toast('Cargo salvo');
  };
  if (id) $('#cg_del').onclick = async e => { if (!confirmInline(e.currentTarget)) return; delete ex[id];
    for (const p of D.publicadores.filter(p => (p.cargos || []).includes(id))) await store.put('publicadores', p.id, { ...p, cargos: p.cargos.filter(x => x !== id) });
    await store.put('config', 'app', { ...cfg(), cargosExtra: ex }); closeModal(); toast('Cargo excluído'); };
}
const SOL_T = { pioneiro: 'Pioneiro auxiliar', ausencia: 'Ausência', territorio: 'Território', publicacoes: 'Publicações' };
const solDesc = s => s.tipo === 'pioneiro' ? `${(s.meses || []).map(mesLabel).join(', ')}${s.continuo ? ' · contínuo' : ''} · ${s.horas || 30} h` :
  s.tipo === 'ausencia' ? `${fmt(s.inicio)} a ${fmt(s.fim)}` : s.tipo === 'territorio' ? (s.numero ? `Território ${s.numero}` : 'Qualquer território disponível') : `${esc(s.qtd || 1)}× ${esc(s.item || '')}${s.idioma ? ' · ' + esc(s.idioma) : ''}`;
VIEWS.solicitacoes = () => {
  const tipos = solVer(); if (!tipos.length) return '<div class="empty">Você não tem acesso às solicitações.</div>';
  const f = S.solFiltro;
  const items = D.solicitacoes.filter(s => tipos.includes(s.tipo) && (f === 'todas' || s.status === f)).sort((a, b) => (b.criado || '').localeCompare(a.criado || ''));
  return `<div class="seg">${[['pendente', 'Pendentes'], ['aprovado', 'Aprovadas'], ['todas', 'Todas']].map(([k, l]) => `<button data-act="solFiltro" data-id="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>` +
    (items.length ? items.map(s => `<div class="card"><div class="row"><span class="pill">${SOL_T[s.tipo]}</span><span class="sp small muted">${fmt(s.criado)}</span><span class="pill ${s.status === 'pendente' ? 'warn' : s.status === 'aprovado' ? 'ok' : 'bad'}">${esc(s.status)}</span></div>
      <h3 style="margin-top:8px">${esc(s.nome)}</h3><div class="small">${solDesc(s)}</div>${s.obs ? `<div class="small muted">${esc(s.obs)}</div>` : ''}
      ${s.status === 'pendente' && can('sol.' + s.tipo) ? `<div class="row" style="margin-top:10px"><button class="btn sm ok" data-act="solOk" data-id="${esc(s.id)}">Aprovar</button><button class="btn sm bad" data-act="solNo" data-id="${esc(s.id)}">Recusar</button></div>` : ''}</div>`).join('') : '<div class="empty">Nenhuma solicitação.</div>');
};
VIEWS.relatorios = () => {
  if (!ver('relatorios')) return '<div class="empty">Apenas anciãos e secretário.</div>';
  const m = S.relMes, rels = D.relatorios.filter(x => x.mes === m), lista = pubs().filter(p => !isSup(p));
  const env = lista.filter(p => rels.some(x => x.pub === p.id));
  const soma = k => rels.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const meses = [...new Set([mesAnterior(), mesAtual(), ...D.relatorios.map(x => x.mes)])].sort().reverse();
  return `<div class="chips">${meses.map(x => `<button data-act="relMes" data-id="${x}" class="${x === m ? 'on' : ''}">${esc(mesLabel(x))}</button>`).join('')}</div>
    <div class="grid2" style="margin-bottom:14px"><div class="stat"><b>${env.length}/${lista.length}</b><span>enviados</span></div><div class="stat"><b>${soma('estudos')}</b><span>estudos · ${soma('horas')} h</span></div></div>
    <div class="card list">${lista.map(p => { const x = rels.find(y => y.pub === p.id);
      return `<div class="it"><div class="sp"><b>${esc(p.nome)}</b><div class="small muted">${esc(p.grupo || '')} · ${esc(p.tipo || '')}</div>${x && x.obs ? `<div class="small">${esc(x.obs)}</div>` : ''}</div>
        ${x ? `<div style="text-align:right"><span class="pill ${x.participou === false ? 'bad' : 'ok'}">${x.participou === false ? 'Não participou' : 'Participou'}</span><div class="small muted">${x.estudos || 0} est.${x.horas ? ' · ' + x.horas + ' h' : ''}${x.creditos ? ' · ' + x.creditos + ' cr' : ''}</div></div>` : '<span class="pill warn">Pendente</span>'}</div>`; }).join('')}</div>`;
};

// ================= EU =================
VIEWS.eu = () => {
  const me = meP();
  return `<div class="card me-card"><div class="avatar">${esc((me.nome || '?').split(' ').map(x => x[0]).slice(0, 2).join(''))}</div><div class="sp"><h3>${esc(me.nome)}</h3><div class="small muted">${esc(me.grupo || 'Sem grupo')} · ${esc(me.tipo || 'Publicador')}${me.priv ? ' · ' + esc(me.priv) : ''}</div></div></div>` +
    (isSup(me) ? block('Congregação', linkRow('relatorios', '📊', 'Relatórios enviados', 'Ver os relatórios dos irmãos') + linkRow('grupo', '👥', 'Meu grupo de campo', esc(me.grupo || ''))) : block('Serviço de campo', linkRow('atividade', '⏱️', 'Atividade de serviço de campo', isPioneer(me) ? 'Registre suas horas' : 'Marque que foi ao campo') + (isPioneer(me) ? linkRow('relatorio', '📝', 'Relatório do mês', mesLabel(mesAnterior())) : '') + linkRow('historico', '🚪', 'Histórico de serviço de campo', '') + linkRow('pioneiro', '🙋', 'Pioneiro auxiliar', 'Fazer solicitação')) +
    block('Informações pessoais', linkRow('ausencia', '✈️', 'Ausência', 'Avise quando estiver fora') + linkRow('contato', '🪪', 'Minhas informações de contato', '') + linkRow('emergencia', '🚑', 'Meus contatos de emergência', '') + linkRow('grupo', '👥', 'Meu grupo de campo', esc(me.grupo || ''))) +
    block('Solicitações', linkRow('pedirTerr', '🗺️', 'Solicitar território', '') + linkRow('publicacoes', '📚', 'Solicitar publicações', '')));
};
VIEWS.atividade = () => {
  if (!isPioneer(meP())) {
    if (cfg().relatoriosAtivos === false) return '<div class="empty">Os anciãos locais não ativaram o envio de relatórios.</div>';
    return `<p class="small muted" style="margin:0 2px 12px">Marque os estudos bíblicos e toque em "Fui ao campo". O relatório é enviado na hora para os anciãos.</p>` + [mesAnterior(), mesAtual()].map(m => { const r = D.relatorios.find(x => x.id === `${m}_${S.me}`);
      return `<div class="card fui"><div class="mini-t" style="font-size:20px">${esc(mesLabel(m))}</div>${ebStepper(m)}
        ${r ? `<div class="fui-ok">✓ Fui ao campo</div><div class="small muted">Enviado em ${fmt(r.enviadoEm)} · ${r.estudos || 0} estudo(s)</div><button class="btn sm sec2" style="margin-top:10px" data-act="desfazCampo" data-id="${m}">Desfazer</button>`
            : `<button class="btn block" data-act="fuiCampo" data-id="${m}">Fui ao campo</button>`}</div>`; }).join('');
  }
  const m = S.param || mesAtual(), list = minhaAtividade(m).sort((a, b) => b.data.localeCompare(a.data));
  const prev = (() => { const d = parse(m + '-01'); d.setMonth(d.getMonth() - 1); return mesDe(iso(d)); })(), next = (() => { const d = parse(m + '-01'); d.setMonth(d.getMonth() + 1); return mesDe(iso(d)); })();
  return `<div class="row month-nav"><button class="icon-btn" data-go="atividade" data-p="${prev}">‹</button><b class="sp" style="text-align:center;text-transform:capitalize">${esc(mesLabel(m))}</b><button class="icon-btn" data-go="atividade" data-p="${next}" ${next > mesAtual() ? 'disabled' : ''}>›</button></div>
    <div class="grid3" style="margin-bottom:14px"><div class="stat"><b>${fmtH(somaHoras(list))}</b><span>horas</span></div><div class="stat"><b>${somaCred(list)}</b><span>créditos</span></div><div class="stat"><b>${ebDe(m)}</b><span>estudos</span></div></div>
    <div class="card">${ebStepper(m)}</div>
    <button class="btn block" data-act="addAtiv" style="margin-bottom:14px">+ Adicionar horas</button>
    ${list.length ? `<div class="card list">${list.map(a => `<div class="it">${dateBox(a.data)}<div class="sp" style="align-self:center"><b>${fmtH((Number(a.horas) || 0) * 60 + (Number(a.minutos) || 0))} h</b>${a.creditos ? ` <span class="muted small">+ ${a.creditos} cr</span>` : ''}${a.obs ? `<div class="small muted">${esc(a.obs)}</div>` : ''}</div><button class="icon-btn" data-act="delAtiv" data-id="${esc(a.id)}">✕</button></div>`).join('')}</div>` : '<div class="empty">Nenhuma atividade neste mês.</div>'}`;
};
VIEWS.relatorio = () => {
  const mes = mesAnterior(), me = meP(), c = cfg();
  if (!isPioneer(me)) return VIEWS.atividade();
  if (c.relatoriosAtivos === false) return '<div class="empty">Os anciãos locais não ativaram o envio de relatórios.</div>';
  const r = D.relatorios.find(x => x.id === `${mes}_${S.me}`) || {}, R = resumoMes(mes);
  return `<div class="card"><h3 style="text-transform:capitalize">Relatório de ${esc(mesLabel(mes))}</h3>
    <p class="small muted" style="margin-top:0">Preenchido com a sua atividade de campo. É só conferir e enviar.</p>
    <div class="grid3" style="margin:12px 0"><div class="stat"><b>${R.horas}</b><span>horas</span></div><div class="stat"><b>${R.cred}</b><span>créditos</span></div><div class="stat"><b>${R.eb}</b><span>estudos</span></div></div>
    ${R.sobra ? `<p class="small muted">${R.sobra} min a mais não entram nas horas do relatório.</p>` : ''}
    <div class="f"><label>Observações (opcional)</label><textarea id="rp_obs">${esc(r.obs || '')}</textarea></div>
    <button class="btn block" data-act="sendRel">${r.enviadoEm ? 'Enviar de novo' : 'Enviar relatório'}</button>
    ${r.enviadoEm ? `<p class="muted small" style="text-align:center">Enviado em ${fmt(r.enviadoEm)}: ${r.horas || 0} h · ${r.creditos || 0} cr · ${r.estudos || 0} estudos</p>` : ''}
    <button class="btn sm sec2" style="margin-top:6px" data-go="atividade" data-p="${mes}">Corrigir na atividade de campo</button></div>`;
};
VIEWS.historico = () => {
  const meus = D.relatorios.filter(r => r.pub === S.me);
  const meses = [...new Set([...meus.map(r => r.mes), ...D.atividade.filter(a => a.pub === S.me).map(a => mesDe(a.data))])].sort().reverse();
  return meses.length ? `<div class="card list">${meses.map(m => { const r = meus.find(x => x.mes === m), at = D.atividade.filter(a => a.pub === S.me && mesDe(a.data) === m);
    return `<div class="it"><div class="sp"><b style="text-transform:capitalize">${esc(mesLabel(m))}</b><div class="small muted">${fmtH(somaHoras(at))} h registradas${somaCred(at) ? ' · ' + somaCred(at) + ' cr' : ''}${r ? ` · ${r.estudos || 0} EBs` : ''}</div></div><span class="pill ${r ? 'ok' : 'warn'}">${r ? 'Enviado' : 'Sem relatório'}</span></div>`; }).join('')}</div>` : '<div class="empty">Sem histórico ainda.</div>';
};
const minhasSol = tipo => D.solicitacoes.filter(s => s.pub === S.me && s.tipo === tipo).sort((a, b) => (b.criado || '').localeCompare(a.criado || ''));
const solList = tipo => { const l = minhasSol(tipo); return l.length ? `<div class="sec">Minhas solicitações</div><div class="card list">${l.map(s => `<div class="it"><div class="sp small">${solDesc(s)}<div class="muted">${fmt(s.criado)}</div></div><span class="pill ${s.status === 'pendente' ? 'warn' : s.status === 'aprovado' ? 'ok' : 'bad'}">${esc(s.status)}</span>${s.status === 'pendente' ? `<button class="icon-btn" data-act="delSol" data-id="${esc(s.id)}">✕</button>` : ''}</div>`).join('')}</div>` : ''; };
VIEWS.pioneiro = () => {
  const base = new Date(); const ms = [0, 1, 2, 3].map(k => { const d = new Date(base.getFullYear(), base.getMonth() + k, 1); return mesDe(iso(d)); });
  return `<div class="card"><p class="small muted" style="margin-top:0">Escolha o(s) mês(es) em que deseja servir como pioneiro auxiliar.</p>
    ${ms.map(m => `<div class="f"><label class="chk"><input type="checkbox" class="pa_m" value="${m}"> <span style="text-transform:capitalize">${esc(mesLabel(m))}</span></label></div>`).join('')}
    <div class="f"><label class="chk"><input type="checkbox" id="pa_cont"> Até novo aviso (contínuo)</label></div>
    <div class="f"><label>Meta de horas</label><select id="pa_h"><option>30</option><option>15</option></select></div>
    <div class="f"><label>Observações</label><textarea id="pa_obs"></textarea></div>
    <button class="btn block" data-act="sendPio">Enviar solicitação</button></div>${solList('pioneiro')}`;
};
VIEWS.ausencia = () => `<div class="card"><p class="small muted" style="margin-top:0">Avise os anciãos quando for viajar ou ficar ausente, para ajustarem as designações.</p>
  <div class="grid2"><div class="f"><label>De</label><input id="au_i" type="date" value="${today()}"></div><div class="f"><label>Até</label><input id="au_f" type="date" value="${addDays(today(), 7)}"></div></div>
  <div class="f"><label>Observação</label><textarea id="au_obs" placeholder="Opcional"></textarea></div>
  <button class="btn block" data-act="sendAus">Registrar ausência</button></div>${solList('ausencia')}`;
VIEWS.contato = () => { const p = meP();
  return `<div class="card"><div class="f"><label>Telefone / WhatsApp</label><input id="ct_tel" type="tel" value="${esc(p.telefone || '')}"></div>
    <div class="f"><label>E-mail</label><input id="ct_email" type="email" value="${esc(p.email || '')}"></div>
    <div class="f"><label>Endereço</label><textarea id="ct_end">${esc(p.endereco || '')}</textarea></div>
    <button class="btn block" data-act="saveContato">Salvar</button><p class="small muted">Visível para os anciãos da congregação.</p></div>`; };
VIEWS.emergencia = () => { const l = meP().emergencia || [];
  return `<div class="card"><div id="em_list">${(l.length ? l : [{}]).map(emRow).join('')}</div>
    <button class="btn sm sec2" data-act="addEm">+ Outro contato</button><button class="btn block" style="margin-top:12px" data-act="saveEm">Salvar</button></div>`; };
const emRow = e => `<div class="em-row"><div class="f"><label>Nome</label><input class="em_n" value="${esc(e.nome || '')}"></div><div class="grid2"><div class="f"><label>Parentesco</label><input class="em_p" value="${esc(e.parentesco || '')}"></div><div class="f"><label>Telefone</label><input class="em_t" type="tel" value="${esc(e.telefone || '')}"></div></div></div>`;
VIEWS.grupo = () => { const me = meP(); const g = me.grupo; if (!g) return '<div class="empty">Você ainda não está em um grupo.</div>';
  const membros = pubs().filter(p => p.grupo === g); const sup = membros[0] && membros[0].superintendente;
  const saidas = D.saidas.filter(s => s.grupo === g || s.grupo === 'Todos');
  const terrs = D.territorios.filter(t => t.grupo === g);
  return `<div class="card"><h3>${esc(g)}</h3>${sup ? `<div class="small">Superintendente: <b>${nameTag(sup)}</b></div>` : ''}<div class="small muted">${membros.length} publicadores · ${terrs.length} territórios</div></div>
    <div class="sec">Publicadores</div><div class="card list">${membros.map(p => `<div class="it"><div class="sp">${nameTag(p.nome)}<div class="small muted">${esc(p.tipo || '')}</div></div></div>`).join('')}</div>
    ${saidas.length ? `<div class="sec">Saídas</div><div class="card list">${saidas.map(s => `<div class="it"><div class="k">${esc(s.dia)} ${esc(s.hora)}</div><div class="v">${esc(s.local)}</div></div>`).join('')}</div>` : ''}`; };
VIEWS.pedirTerr = () => { const disp = D.territorios.filter(t => !(t.inicio && !t.termino)).sort((a, b) => (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0));
  return `<div class="card"><div class="f"><label>Território</label><select id="pt_n"><option value="">Qualquer disponível</option>${disp.map(t => `<option value="${esc(t.numero)}">Território ${esc(t.numero)} · ${esc(t.grupo || '')}</option>`).join('')}</select></div>
    <div class="f"><label>Observação</label><textarea id="pt_obs" placeholder="Ex.: prefiro perto de casa"></textarea></div>
    <button class="btn block" data-act="sendTerr">Solicitar</button></div>${solList('territorio')}`; };
VIEWS.publicacoes = () => `<div class="card"><div class="f"><label>Publicação</label><input id="pb_item" placeholder="Ex.: Bíblia, Seja Feliz para Sempre, revistas"></div>
  <div class="grid2"><div class="f"><label>Quantidade</label><input id="pb_q" type="number" min="1" value="1"></div><div class="f"><label>Idioma</label><input id="pb_i" value="Português"></div></div>
  <div class="f"><label>Observação</label><textarea id="pb_obs"></textarea></div><button class="btn block" data-act="sendPub">Solicitar</button></div>${solList('publicacoes')}`;

['atividade', 'relatorio', 'historico', 'pioneiro', 'ausencia', 'contato', 'emergencia', 'pedirTerr', 'publicacoes'].forEach(v => { const f = VIEWS[v]; VIEWS[v] = (...a) => isSup(meP()) ? '<div class="empty">O superintendente só acompanha o app. Não envia relatórios nem faz solicitações.</div>' : f(...a); });
// ================= TERRITÓRIOS =================
function terrStatus(t) { return t.inicio && !t.termino ? 'andamento' : 'disponivel'; }
VIEWS.territorios = () => {
  const grupos = ['Todos', ...[...new Set(D.territorios.map(t => t.grupo || 'Sem grupo'))].sort()];
  let items = [...D.territorios].sort((a, b) => (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0));
  if (S.terrGrupo !== 'Todos') items = items.filter(t => (t.grupo || 'Sem grupo') === S.terrGrupo);
  const nAnd = items.filter(t => terrStatus(t) === 'andamento').length;
  if (S.terrFiltro !== 'todos') items = items.filter(t => terrStatus(t) === S.terrFiltro);
  return `${terrDue() ? avisosArquivo() : ''}<button class="btn block ghost-ink" data-go="mapaGeral" style="margin-bottom:12px">🗺️ Mapa geral dos territórios</button><div class="chips">${grupos.map(g => `<button data-act="terrGrupo" data-id="${esc(g)}" class="${g === S.terrGrupo ? 'on' : ''}">${esc(g)}</button>`).join('')}</div>
    <div class="seg"><button data-act="terrFiltro" data-id="todos" class="${S.terrFiltro === 'todos' ? 'on' : ''}">Todos</button><button data-act="terrFiltro" data-id="andamento" class="${S.terrFiltro === 'andamento' ? 'on' : ''}">Em andamento (${nAnd})</button><button data-act="terrFiltro" data-id="disponivel" class="${S.terrFiltro === 'disponivel' ? 'on' : ''}">Disponíveis</button></div>
    ${items.length ? items.map(terrCard).join('') : '<div class="empty">Nenhum território aqui.</div>'}${fab('new_territorios')}`;
};
// ---------- mapas: geo, marcações, GPS, anotações ----------
const geoOf = t => { const n = String(t.numero || '').padStart(2, '0'); const g = (window.TERR_GEO || {})[n]; return g && t.imagem && t.imagem === TERR_IMG(n) ? g : null; };
const geoUV = (g, lat, lng) => [g.A[0][0] * lng + g.A[0][1] * lat + g.A[0][2], g.A[1][0] * lng + g.A[1][1] * lat + g.A[1][2]];
const rotaURL = c => `https://www.google.com/maps/dir/?api=1&destination=${c[0]},${c[1]}&travelmode=driving`;
const notasDe = id => D.terrNotas.filter(n => n.terr === id).sort((a, b) => (b.criado || '').localeCompare(a.criado || ''));
const kmEntre = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const noPoly = (p, poly) => { let d = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [yi, xi] = poly[i], [yj, xj] = poly[j]; if ((yi > p[0]) !== (yj > p[0]) && p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi) d = !d; } return d; };
function feitoSVG(t, live) {
  const st = (t.feito || []).map(f => `<polyline points="${f.p.map(q => q.join(',')).join(' ')}"/>`).join('');
  return `<svg class="feito" viewBox="0 0 1 1" preserveAspectRatio="none">${st}${live ? '<polyline id="mz_live" points=""/>' : ''}</svg>`;
}
function terrTools(t) {
  const g = geoOf(t), nn = notasDe(t.id).length, nf = (t.feito || []).length;
  return `<div class="terr-tools">
    ${t.imagem ? `<button class="btn sm ghost-ink" data-act="terrMapa" data-id="${esc(t.id)}">✏️ Mapa${nf ? ` · ${nf} marcaç${nf > 1 ? 'ões' : 'ão'}` : ''}</button>` : ''}
    <button class="btn sm ghost-ink" data-act="terrNotas" data-id="${esc(t.id)}">📝 Anotações${nn ? ` (${nn})` : ''}</button>
    ${g ? `<a class="btn sm" href="${rotaURL(g.c)}" target="_blank" rel="noopener">🧭 Como chegar</a>` : ''}
  </div>`;
}
let gpsWatch = null;
function gpsStop() { if (gpsWatch !== null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; } }
function gpsStart(onPos) {
  if (!navigator.geolocation) { toast('Este aparelho não tem GPS disponível'); return; }
  gpsStop(); toast('Procurando sua localização…');
  gpsWatch = navigator.geolocation.watchPosition(p => onPos([p.coords.latitude, p.coords.longitude], p.coords.accuracy),
    e => { toast(e.code === 1 ? 'Permita o acesso à localização para usar o GPS' : 'Não consegui pegar sua localização'); gpsStop(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
function abrirSheet(html, onClose) {
  const m = $('#modal'); m.innerHTML = `<div class="sheet big">${html}</div>`; m.classList.remove('hidden');
  const fechar = () => { gpsStop(); onClose && onClose(); closeModal(); };
  m.onclick = e => { if (e.target === m) fechar(); };
  m.querySelectorAll('[data-x]').forEach(b => b.onclick = fechar);
  return m;
}
function terrMapa(id) {
  const t0 = D.territorios.find(x => x.id === id); if (!t0) return;
  const g = geoOf(t0), pode = can('terr.mover') && !isSup(meP());
  let feito = (t0.feito || []).map(f => ({ ...f })), modo = false, live = null, mudou = false;
  const m = abrirSheet(`<div class="row"><h2 class="sp" style="margin:0">Território ${esc(t0.numero)}</h2><button class="btn sm" data-x="1">Fechar</button></div>
    <p class="small muted" id="mz_dica" style="margin:6px 0 10px">${pode ? 'Toque em <b>Marcar o que foi feito</b> e passe o dedo sobre as ruas já trabalhadas.' : 'As marcações em azul mostram o que já foi trabalhado.'}</p>
    <div class="mapwrap"><div class="mapbox big" id="mz_box"><img src="${esc(t0.imagem)}" alt="">${feitoSVG({ feito }, true)}<div class="gps-dot hidden" id="mz_gps"></div></div></div>
    <div class="terr-tools">
      ${pode ? `<button class="btn sm" id="mz_draw">✏️ Marcar o que foi feito</button><button class="btn sm" id="mz_undo">↶ Desfazer</button><button class="btn sm" id="mz_clear">🗑️ Limpar</button>` : ''}
      ${g ? `<button class="btn sm" id="mz_me">📍 Onde estou</button><a class="btn sm" href="${rotaURL(g.c)}" target="_blank" rel="noopener">🧭 Como chegar</a>` : ''}
    </div>`, async () => { if (mudou) await store.put('territorios', id, { ...D.territorios.find(x => x.id === id), feito }); });
  const box = $('#mz_box'), svg = box.querySelector('svg');
  const redraw = () => { svg.innerHTML = feito.map(f => `<polyline points="${f.p.map(q => q.join(',')).join(' ')}"/>`).join('') + '<polyline id="mz_live" points=""/>'; };
  const salvar = async () => { mudou = false; await store.put('territorios', id, { ...D.territorios.find(x => x.id === id), feito }); };
  const uv = e => { const r = box.getBoundingClientRect(); return [Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1e4) / 1e4, Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1e4) / 1e4]; };
  if (pode) {
    const bd = $('#mz_draw');
    bd.onclick = () => { modo = !modo; box.classList.toggle('drawing', modo); bd.classList.toggle('ok', modo); bd.textContent = modo ? '✔ Concluir marcação' : '✏️ Marcar o que foi feito'; if (!modo && mudou) salvar().then(() => toast('Marcações salvas')); };
    $('#mz_undo').onclick = () => { if (!feito.length) return; feito.pop(); redraw(); mudou = true; salvar(); };
    $('#mz_clear').onclick = e => { if (!feito.length || !confirmInline(e.currentTarget)) return; feito = []; redraw(); mudou = true; salvar(); };
    box.addEventListener('pointerdown', e => { if (!modo) return; e.preventDefault(); box.setPointerCapture(e.pointerId); live = [uv(e)]; });
    box.addEventListener('pointermove', e => { if (!modo || !live) return; const p = uv(e), q = live[live.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.004) { live.push(p); $('#mz_live').setAttribute('points', live.map(v => v.join(',')).join(' ')); } });
    const fim = () => { if (!live) return; if (live.length > 1) { feito.push({ p: live, por: myName(), data: today() }); mudou = true; } live = null; redraw(); };
    box.addEventListener('pointerup', fim); box.addEventListener('pointercancel', fim);
  } else box.onclick = null;
  if (g) $('#mz_me').onclick = () => gpsStart((ll, acc) => {
    const [u, v] = geoUV(g, ll[0], ll[1]), dot = $('#mz_gps'); if (!dot) return gpsStop();
    if (u < 0 || u > 1 || v < 0 || v > 1) { dot.classList.add('hidden'); toast(`Você está fora deste mapa, a ${kmEntre(ll, g.c).toFixed(1).replace('.', ',')} km do território`); return; }
    dot.style.left = (u * 100) + '%'; dot.style.top = (v * 100) + '%'; dot.classList.remove('hidden');
    $('#mz_dica').innerHTML = noPoly(ll, g.poly) ? '📍 Você está <b>dentro</b> do território (ponto azul).' : '📍 Você está perto, mas <b>fora</b> do limite vermelho (ponto azul).';
  });
}
async function fotoComprimida(file, max = 900) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url); return c.toDataURL('image/jpeg', 0.62);
}
function terrNotas(id) {
  const t = D.territorios.find(x => x.id === id); if (!t) return;
  const pode = can('terr.mover') && !isSup(meP()); let fotos = [];
  const lista = () => { const ns = notasDe(id); return ns.length ? ns.map(n => `<div class="nota"><div class="small muted">${esc(n.por || '')} · ${fmt(n.data)}${pode && (n.por === myName() || can('terr.edit')) ? ` <button class="lnk" data-del="${esc(n.id)}">apagar</button>` : ''}</div>${n.texto ? `<p>${esc(n.texto).replace(/\n/g, '<br>')}</p>` : ''}${(n.fotos || []).length ? `<div class="fotos">${n.fotos.map(f => `<img src="${f}" alt="Foto da anotação" data-big="1">`).join('')}</div>` : ''}</div>`).join('') : '<div class="empty">Nenhuma anotação ainda.</div>'; };
  const m = abrirSheet(`<div class="row"><h2 class="sp" style="margin:0">Anotações · ${esc(t.numero)}</h2><button class="btn sm" data-x="1">Fechar</button></div>
    ${pode ? `<div class="f" style="margin-top:12px"><label>Nova anotação</label><textarea id="nt_txt" rows="3" placeholder="Ex.: Paramos na esquina da Benjamin Constant com a Treze de Maio. Casa 245 pediu revisita."></textarea></div>
      <div class="row"><label class="btn sm" style="cursor:pointer">📷 Anexar fotos<input id="nt_foto" type="file" accept="image/*" multiple hidden></label><span class="sp small muted" id="nt_n"></span><button class="btn sm ok" id="nt_ok">Salvar</button></div><div class="fotos" id="nt_prev"></div>` : ''}
    <div id="nt_lista" style="margin-top:14px">${lista()}</div>`);
  const bindLista = () => {
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = async e => { if (!confirmInline(e.currentTarget)) return; await store.del('terrNotas', b.dataset.del); $('#nt_lista').innerHTML = lista(); bindLista(); });
    m.querySelectorAll('img[data-big]').forEach(i => i.onclick = () => { const v = document.createElement('div'); v.className = 'foto-full'; v.innerHTML = `<img src="${i.src}" alt="">`; v.onclick = () => v.remove(); document.body.appendChild(v); });
  };
  bindLista();
  if (!pode) return;
  $('#nt_foto').onchange = async e => { for (const f of [...e.target.files].slice(0, 4 - fotos.length)) { try { fotos.push(await fotoComprimida(f)); } catch (x) { toast('Não consegui abrir uma das fotos'); } }
    $('#nt_prev').innerHTML = fotos.map(f => `<img src="${f}" alt="">`).join(''); $('#nt_n').textContent = fotos.length ? `${fotos.length} foto(s)${fotos.length >= 4 ? ' · máximo' : ''}` : ''; e.target.value = ''; };
  $('#nt_ok').onclick = async () => { const texto = $('#nt_txt').value.trim(); if (!texto && !fotos.length) return toast('Escreva algo ou anexe uma foto');
    try { await store.put('terrNotas', null, { terr: id, numero: t.numero, texto, fotos, por: myName(), data: today(), criado: new Date().toISOString() }); } catch (x) { return toast('Não deu para salvar (fotos grandes demais?)'); }
    fotos = []; $('#nt_txt').value = ''; $('#nt_prev').innerHTML = ''; $('#nt_n').textContent = ''; $('#nt_lista').innerHTML = lista(); bindLista(); toast('Anotação salva'); };
}
// ---------- mapa geral ----------
const COR_TERR = { andamento: '#ffd21f', recente: '#2fd27a', parado: '#ff3b3b' };
function corTerr(t) { if (terrStatus(t) === 'andamento') return 'andamento'; const fim = t.termino || t.ultimoTermino; return fim && daysBetween(fim, today()) <= 120 ? 'recente' : 'parado'; }
function ovXY(o, lat, lng) { const s = 256 * 2 ** o.Z, x = (lng + 180) / 360 * s, sl = Math.sin(lat * Math.PI / 180), y = (0.5 - Math.log((1 + sl) / (1 - sl)) / (4 * Math.PI)) * s; return [(x - o.X0) * o.K, (y - o.Y0) * o.K]; }
VIEWS.mapaGeral = () => {
  const G = window.TERR_GEO || {}, o = G._overview;
  if (!o) return '<div class="empty">Mapa geral indisponível.</div>';
  const ts = D.territorios.map(t => ({ t, g: G[String(t.numero).padStart(2, '0')] })).filter(x => x.g);
  const cont = { andamento: 0, recente: 0, parado: 0 }; ts.forEach(x => cont[corTerr(x.t)]++);
  const polys = ts.map(({ t, g }) => { const c = COR_TERR[corTerr(t)], pts = g.poly.map(p => ovXY(o, p[0], p[1]).map(v => v.toFixed(1)).join(',')).join(' '), [cx, cy] = ovXY(o, g.c[0], g.c[1]);
    return `<g class="ovt" data-act="terrMapa" data-id="${esc(t.id)}"><polygon points="${pts}" fill="${c}" fill-opacity=".28" stroke="${c}" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="21" fill="#0d0d0d" stroke="${c}" stroke-width="3"/><text x="${cx}" y="${cy + 8}" text-anchor="middle">${esc(t.numero)}</text></g>`; }).join('');
  setTimeout(() => { const sc = $('.ov-scroll'); if (sc && !sc.dataset.ok) { sc.dataset.ok = 1; sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) * 0.4; sc.scrollTop = (sc.scrollHeight - sc.clientHeight) * 0.62; } }, 60);
  const sem = D.territorios.filter(t => !G[String(t.numero).padStart(2, '0')]).map(t => t.numero);
  return `<div class="ov-legend"><span><i style="background:${COR_TERR.andamento}"></i>Em andamento (${cont.andamento})</span><span><i style="background:${COR_TERR.recente}"></i>Feito há menos de 4 meses (${cont.recente})</span><span><i style="background:${COR_TERR.parado}"></i>Precisa trabalhar (${cont.parado})</span></div>
    <div class="ov-scroll"><div class="ov-box"><img src="${esc(TERR_OV)}" alt="Mapa geral"><svg viewBox="0 0 ${o.W} ${o.H}">${polys}<g id="ov_me"></g></svg></div></div><div class="small muted" style="margin-top:4px">Arraste para ver o mapa todo.</div>
    <div class="row" style="margin-top:10px"><span class="sp small muted" id="ov_info">Toque num território para abrir o mapa dele.</span><button class="btn sm" data-act="ovGps">📍 Onde estou</button></div>
    ${sem.length ? `<p class="small muted">Sem mapa ainda: ${sem.map(esc).join(', ')}.</p>` : ''}
    <p class="small muted">Imagens ©2026 Google, Airbus, Maxar</p>`;
};
const TERR_OV = 'img/visao_geral.jpg';
function ovGps() {
  const G = window.TERR_GEO || {}, o = G._overview;
  gpsStart((ll, acc) => {
    const g = $('#ov_me'); if (!g) return gpsStop();
    const [x, y] = ovXY(o, ll[0], ll[1]);
    if (x < 0 || y < 0 || x > o.W || y > o.H) { g.innerHTML = ''; $('#ov_info').textContent = 'Você está fora da área dos territórios.'; return; }
    g.innerHTML = `<circle cx="${x}" cy="${y}" r="26" fill="#1e88ff" fill-opacity=".25"/><circle cx="${x}" cy="${y}" r="11" fill="#1e88ff" stroke="#fff" stroke-width="4"/>`;
    const dentro = D.territorios.find(t => { const q = G[String(t.numero).padStart(2, '0')]; return q && noPoly(ll, q.poly); });
    $('#ov_info').innerHTML = dentro ? `📍 Você está no <b>Território ${esc(dentro.numero)}</b>.` : '📍 Você não está dentro de nenhum território.';
  });
}
function terrCard(t) {
  const st = terrStatus(t);
  return `<div class="card">
    <div class="row"><div class="date-box" style="min-width:48px;font-size:22px">${esc(t.numero)}</div><div class="sp"><h3>Território ${esc(t.numero)}${t.nome ? ' · ' + esc(t.nome) : ''}</h3><div class="small muted">${esc(t.grupo || 'Sem grupo')}</div></div>
    <span class="pill ${st === 'andamento' ? 'warn' : 'ok'}">${st === 'andamento' ? 'Em andamento' : 'Disponível'}</span>${adminBtns('territorios', t.id)}</div>
    ${t.imagem ? `<div class="mapwrap"><div class="mapbox" data-act="terrMapa" data-id="${esc(t.id)}"><img src="${esc(t.imagem)}" alt="Mapa do território ${esc(t.numero)}" loading="lazy">${feitoSVG(t)}</div></div>` : '<div class="terr-noimg">Mapa ainda não cadastrado</div>'}
    ${terrTools(t)}
    <div class="list">
      <div class="it"><div class="k">Dirigente</div><div class="v">${t.dirigente ? nameTag(t.dirigente) : '—'}</div></div>
      <div class="it"><div class="k">Data de início</div><div class="v">${fmt(t.inicio)}</div></div>
      <div class="it"><div class="k">Data de término</div><div class="v">${fmt(t.termino)}</div></div>
      ${st === 'disponivel' && (t.termino || t.ultimoTermino) ? `<div class="it"><div class="k">Parado há</div><div class="v">${daysBetween(t.termino || t.ultimoTermino, today())} dias</div></div>` : ''}
    </div>
    <div class="row" style="margin-top:10px">
      ${st === 'andamento' ? `<span class="small muted sp">Há ${daysBetween(t.inicio, today())} dias</span>${can('terr.mover') ? `<button class="btn ok" data-act="terrEnd" data-id="${esc(t.id)}">Terminei</button>` : ''}` : can('terr.mover') ? `<span class="sp"></span><button class="btn" data-act="terrStart" data-id="${esc(t.id)}">Iniciei este território</button>` : `<span class="sp small muted">Disponível · peça ao dirigente ou em Eu › Solicitar território</span>`}
    </div>
    ${(t.historico || []).length ? `<details style="margin-top:10px"><summary class="small muted">Histórico (${t.historico.length})</summary><div class="list small">${t.historico.slice().reverse().map(h => `<div class="it"><div class="k">${esc(h.dirigente || '')}</div><div class="v">${fmt(h.inicio)} → ${fmt(h.termino)}</div></div>`).join('')}</div></details>` : ''}
  </div>`;
}

// ================= CONFIGURAÇÕES =================
VIEWS.config = () => {
  const c = cfg();
  return `<div class="card"><h3>Você</h3><div class="muted small">${esc(myName())}</div><div class="row" style="margin-top:10px"><button class="btn sm bad" data-act="sair">Sair</button></div></div>
    <div class="card"><h3>Seus cargos</h3>${temCargo(meP()) ? `<div class="small"><b>${esc(cargoLabel(meP()))}</b></div><div class="small muted">${[isElder(meP()) ? 'Ancião: acesso a todo o app (menos cargos e PINs).' : '', ...cargosDe(meP()).map(c => esc(CARGOS[c][1]))].filter(Boolean).join('<br>')}</div>
      <div class="small muted" style="margin-top:8px">Seu PIN pessoal foi gerado automaticamente. Se esquecer, peça a um administrador.</div>` : '<div class="small muted">Nenhum cargo. Os administradores definem os cargos em Mais › Publicadores.</div>'}</div>
    ${can('config') ? `<div class="card"><h3>Congregação</h3>
      <div class="f"><label>Nome</label><input id="cf_nome" value="${esc(c.nome || '')}"></div>
      <div class="grid2"><div class="f"><label>Horário meio de semana</label><input id="cf_hv" type="time" value="${esc(c.horaVmc || '19:30')}"></div><div class="f"><label>Horário fim de semana</label><input id="cf_hf" type="time" value="${esc(c.horaFds || '19:00')}"></div></div>
      <div class="f"><label>Dia da reunião do meio de semana</label><select id="cf_dv">${['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].map((d, i) => `<option value="${i}" ${Number(c.diaVmc ?? 3) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="f"><label class="chk"><input type="checkbox" id="cf_rel" ${c.relatoriosAtivos !== false ? 'checked' : ''}> Envio de relatórios ativado</label></div>
      <button class="btn" data-act="saveCfg">Salvar</button></div>` : ''}
    <div class="card"><h3>Instalar no celular</h3><div class="small muted"><b>Android (Chrome):</b> menu ⋮ → "Instalar app" ou "Adicionar à tela inicial".<br><b>iPhone (Safari):</b> botão Compartilhar → "Adicionar à Tela de Início".</div></div>
    ${store.demo ? '<div class="card"><h3>Demonstração</h3><div class="small muted">Apaga os dados deste aparelho e recomeça com os exemplos.</div><button class="btn sm bad" style="margin-top:10px" data-act="resetDemo">Recomeçar do zero</button></div>' : ''}
    <p class="small muted" style="text-align:center">Versão ${VERSAO}</p>`;
};

// ================= formulários =================
const FORMS = {
  vmc: { title: 'Vida e Ministério', fields: [['data', 'Data', 'date'], ['hora', 'Horário (vazio = padrão)', 'time'], ['leitura', 'Leitura semanal (ex.: LAMENTAÇÕES 1-2)', 'text'], ['canticoIni', 'Cântico inicial', 'text'], ['presidente', 'Presidente', 'pub'], ['oracaoIni', 'Oração inicial', 'pub'], ['partes', 'Partes', 'parts'], ['canticoMeio', 'Cântico do meio', 'text'], ['canticoFim', 'Cântico final', 'text'], ['oracaoFim', 'Oração final', 'pub']] },
  fds: { title: 'Fim de semana', fields: [['data', 'Data', 'date'], ['hora', 'Horário (vazio = padrão)', 'time'], ['tema', 'Título do discurso', 'text'], ['numero', 'Número do esboço', 'text'], ['orador', 'Orador', 'text'], ['congregacao', 'Congregação do orador', 'text'], ['presidente', 'Presidente', 'pub'], ['leitor', 'Leitor de A Sentinela', 'pub'], ['hospitalidade', 'Hospitalidade', 'text']] },
  designacoes: { title: 'Designações mecânicas', fields: [['data', 'Data', 'date'], ['indicadores', 'Indicadores', 'pub'], ['som', 'Áudio e vídeo', 'pub'], ['microfones', 'Microfones volantes', 'pub'], ['palco', 'Palco', 'pub'], ['limpeza', 'Limpeza e jardim (grupo)', 'text']] },
  saidas: { title: 'Saída de campo', fields: [['dia', 'Dia da semana', 'select', ORD.map(d => d[0].toUpperCase() + d.slice(1))], ['hora', 'Horário', 'time'], ['local', 'Local', 'text'], ['dirigente', 'Dirigente', 'pub'], ['grupo', 'Grupo', 'grupo'], ['obs', 'Observação', 'text']] },
  saidasAlt: { title: 'Mudança na saída (só um dia)', fields: [['data', 'Data', 'date'], ['saida', 'Qual saída', 'select', () => [['', 'Nova saída extra neste dia'], ...[...D.saidas].sort((a, b) => ordDia(a.dia) - ordDia(b.dia)).map(x => [x.id, `${x.dia} ${x.hora} · ${x.local}`])]], ['tipo', 'O que muda', 'select', ['Alterada', 'Cancelada']], ['hora', 'Novo horário (vazio = mantém)', 'time'], ['local', 'Novo local (vazio = mantém)', 'text'], ['dirigente', 'Dirigente (vazio = mantém)', 'pub'], ['obs', 'Observação', 'text']] },
  carrinho: { title: 'Horário do carrinho', fields: [['data', 'Data', 'date'], ['hora', 'Horário (ex.: 07:00 – 09:00)', 'text'], ['local', 'Local', 'text'], ['vagas', 'Vagas', 'number'], ['inscritos', 'Inscritos (separados por vírgula)', 'csv']] },
  anuncios: { title: 'Quadro de anúncios', fields: [['tipo', 'Tipo', 'select', ['Anúncio', 'Documento', 'Evento']], ['titulo', 'Título', 'text'], ['texto', 'Texto', 'textarea'], ['data', 'Data do evento / anúncio', 'date'], ['ate', 'Mostrar até (depois é apagado sozinho)', 'date'], ['cancela', 'Evento substitui as reuniões da semana (assembleia, congresso)', 'check']] },
  programas: { title: 'Programação personalizada', fields: [['titulo', 'Título', 'text'], ['data', 'Data', 'date'], ['texto', 'Programação (uma linha por item)', 'textarea']] },
  publicadores: { title: 'Publicador', fields: [['nome', 'Nome', 'text'], ['grupo', 'Grupo', 'grupo'], ['superintendente', 'Superintendente do grupo', 'pub'], ['tipo', 'Tipo', 'select', ['Publicador', 'Pioneiro auxiliar', 'Pioneiro regular', 'Publicador não batizado']], ['priv', 'Privilégio', 'select', ['', 'Servo ministerial', 'Ancião']], ['cargos', 'Cargos no app', 'cargos'], ['pin', 'PIN pessoal', 'pinview'], ['telefone', 'Telefone', 'text']] },
  territorios: { title: 'Território', fields: [['numero', 'Número', 'text'], ['nome', 'Bairro / nome', 'text'], ['grupo', 'Grupo', 'grupo'], ['imagem', 'Imagem do mapa', 'image'], ['dirigente', 'Dirigente', 'pub'], ['inicio', 'Data de início', 'date'], ['termino', 'Data de término', 'date']] }
};
const nextDow = (dow) => { const d = parse(today()); while (d.getDay() !== dow) d.setDate(d.getDate() + 1); return iso(d); };
const DEFAULTS = {
  vmc: () => ({ data: nextDow((Number(cfg().diaVmc ?? 3) + 1) % 7), partes: [{ s: 'tesouros', t: '', m: 10 }, { s: 'tesouros', t: 'Joias espirituais', m: 10 }, { s: 'tesouros', t: 'Leitura da Bíblia', m: 4 }, { s: 'ministerio', t: 'Iniciando conversas', m: 3 }, { s: 'ministerio', t: 'Cultivando o interesse', m: 4 }, { s: 'ministerio', t: '', m: 5 }, { s: 'vida', t: '', m: 15 }, { s: 'vida', t: 'Estudo Bíblico de Congregação', m: 30 }] }),
  fds: () => ({ data: nextDow(6) }), carrinho: () => ({ vagas: 2 }), anuncios: () => ({ tipo: S.view === 'eventos' ? 'Evento' : S.param === 'Documento' ? 'Documento' : 'Anúncio', data: today(), ate: addDays(today(), 14) }), publicadores: () => ({ tipo: 'Publicador' }), programas: () => ({ data: today() }), saidasAlt: () => ({ data: today(), tipo: 'Alterada' })
};
const partRow = p => `<div class="prow"><div class="row"><select class="p_s">${Object.entries(SECS).map(([k, v]) => `<option value="${k}" ${p.s === k ? 'selected' : ''}>${({ tesouros: 'Tesouros', ministerio: 'Ministério', vida: 'Vida cristã' })[k]}</option>`).join('')}</select><input class="p_m" type="number" min="0" inputmode="numeric" value="${esc(p.m ?? '')}" placeholder="min"><button type="button" class="icon-btn rm">✕</button></div>
  <input class="p_t" placeholder="Título da parte" value="${esc(p.t || '')}"><div class="row"><input class="p_n" placeholder="Designado / dirigente" list="dl_pubs" value="${esc(p.n || '')}"><input class="p_n2" placeholder="Ajudante / leitor" list="dl_pubs" value="${esc(p.n2 || '')}"></div></div>`;

function openForm(col, item) {
  const F = FORMS[col], v = item || (DEFAULTS[col] ? DEFAULTS[col]() : {});
  const grupos = [...new Set(D.publicadores.map(p => p.grupo).concat(D.territorios.map(t => t.grupo)).filter(Boolean))].sort();
  const field = ([k, label, type, opts]) => {
    const val = v[k] ?? '';
    if (type === 'parts') return `<div class="f parts"><label>${label}</label><div id="ff_parts">${(v.partes || []).map(partRow).join('')}</div><button type="button" class="btn sm sec2" id="ff_addpart">+ Parte</button></div>`;
    if (type === 'select') { const list = typeof opts === 'function' ? opts() : opts; return `<div class="f"><label>${label}</label><select id="ff_${k}">${list.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}" ${o[0] === val ? 'selected' : ''}>${esc(o[1])}</option>` : `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`; }
    if (type === 'textarea') return `<div class="f"><label>${label}</label><textarea id="ff_${k}">${esc(val)}</textarea></div>`;
    if (type === 'cargos') return `<div class="f"><label>${label}</label>${v.supremo ? '<div class="small" style="margin-bottom:8px"><b>★ Admin supremo</b>: tem acesso total e ninguém pode alterar esta conta.</div>' : ''}${Object.entries(CARGOS).map(([k, [n, d]]) => `<label class="chk" style="margin-bottom:6px"><input type="checkbox" class="ff_cargo" value="${k}" ${(v.cargos || []).includes(k) ? 'checked' : ''} ${k === 'admin' && !isSupremo(meP()) ? 'disabled' : ''}> <span>${esc(n)}<br><span class="small muted">${esc(d)}</span></span></label>`).join('')}<div class="small muted">Anciãos (pelo campo Privilégio) já têm acesso a tudo, menos cargos e PINs, que são só do Administrador.</div></div>`;
    if (type === 'pinview') return `<div class="f"><label>${label}</label>${val ? `<div class="pin-big">${esc(val)}</div>` : '<div class="small muted">Será gerado automaticamente ao salvar.</div>'}<div class="small muted">Gerado pelo app. Não pode ser alterado.</div></div>`;
    if (type === 'check') return `<div class="f"><label class="chk"><input type="checkbox" id="ff_${k}" ${val ? 'checked' : ''}> ${label}</label></div>`;
    if (type === 'image') return `<div class="f"><label>${label}</label>${val ? `<img class="terr-img" id="ff_imgprev" src="${esc(val)}">` : '<img class="terr-img hidden" id="ff_imgprev">'}<input type="file" accept="image/*" id="ff_imgfile"></div>`;
    const t = ['pub', 'grupo', 'csv'].includes(type) ? 'text' : type;
    const list = type === 'pub' || type === 'csv' ? 'dl_pubs' : type === 'grupo' ? 'dl_grupos' : '';
    return `<div class="f"><label>${label}</label><input id="ff_${k}" type="${t}" ${list ? `list="${list}"` : ''} value="${esc(Array.isArray(val) ? val.join(', ') : val)}" ${type === 'number' ? 'inputmode="numeric"' : ''}></div>`;
  };
  const m = $('#modal');
  m.innerHTML = `<div class="sheet"><h2>${item ? 'Editar' : 'Novo'}: ${F.title}</h2>${F.fields.map(field).join('')}
    <datalist id="dl_pubs">${pubs().map(p => `<option value="${esc(p.nome)}">`).join('')}</datalist><datalist id="dl_grupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    <div class="row" style="margin-top:6px">${item ? '<button class="btn bad" id="ff_del">Excluir</button>' : ''}<span class="sp"></span><button class="btn sec2" id="ff_cancel">Cancelar</button><button class="btn" id="ff_save">Salvar</button></div></div>`;
  m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); };
  $('#ff_cancel').onclick = closeModal;
  const ap = $('#ff_addpart'); if (ap) ap.onclick = () => $('#ff_parts').insertAdjacentHTML('beforeend', partRow({ s: 'vida' }));
  $$('.parts', m).forEach(p => p.onclick = e => { if (e.target.classList.contains('rm')) e.target.closest('.prow').remove(); });
  let newImg = null;
  const fi = $('#ff_imgfile'); if (fi) fi.onchange = async () => { if (!fi.files[0]) return; newImg = await resizeImage(fi.files[0], 1000); const pv = $('#ff_imgprev'); pv.src = newImg; pv.classList.remove('hidden'); };
  if (item) $('#ff_del').onclick = async () => { if (col === 'publicadores' && isSupremo(item)) return toast('A conta do admin supremo não pode ser excluída'); if (col === 'publicadores' && isAdm(item) && D.publicadores.filter(isAdm).length <= 1) return toast('Não dá para excluir o único administrador'); if (!confirmInline($('#ff_del'))) return; await store.del(col, item.id); closeModal(); toast('Excluído'); if (['vmcDet', 'fdsDet', 'personalizadas'].includes(S.view)) go('programas'); };
  $('#ff_save').onclick = async () => {
    const o = { ...(item || {}) }; delete o.id;
    F.fields.forEach(([k, , type]) => {
      if (type === 'parts') o.partes = $$('.prow', m).map(r => ({ s: $('.p_s', r).value, t: $('.p_t', r).value.trim(), m: Number($('.p_m', r).value) || 0, n: $('.p_n', r).value.trim(), n2: $('.p_n2', r).value.trim() })).filter(p => p.t || p.n);
      else if (type === 'image') { if (newImg) o.imagem = newImg; }
      else if (type === 'csv') o[k] = $('#ff_' + k).value.split(',').map(s => s.trim()).filter(Boolean);
      else if (type === 'number') o[k] = Number($('#ff_' + k).value) || 0;
      else if (type === 'check') o[k] = $('#ff_' + k).checked;
      else if (type === 'pinview') { /* gerado automaticamente */ }
      else if (type === 'cargos') o[k] = $$('.ff_cargo:checked', m).map(x => x.value);
      else o[k] = $('#ff_' + k).value.trim();
    });
    if (col === 'territorios') { if (!o.numero) return toast('Informe o número'); o.historico = o.historico || []; }
    if (col === 'publicadores' && !o.nome) return toast('Informe o nome');
    if (col === 'publicadores' && !o.pin) o.pin = genPin();
    if (col === 'publicadores' && item && isSupremo(item) && !isSupremo(meP())) return toast('Só o admin supremo pode alterar esta conta');
    if (col === 'publicadores') { o.supremo = !!(item && item.supremo); const tinha = !!(item && (item.cargos || []).includes('admin')), tem = (o.cargos || []).includes('admin');
      if (tinha !== tem && !isSupremo(meP())) return toast('Só o admin supremo pode dar ou tirar o cargo de Administrador'); }
    if (col === 'publicadores' && item && isAdm(item) && !isAdm(o) && D.publicadores.filter(isAdm).length <= 1) return toast('Precisa existir pelo menos um administrador');
    if (!can(permOf(col))) return toast('Sem permissão');
    if (['vmc', 'fds', 'designacoes', 'carrinho', 'saidasAlt'].includes(col) && !o.data) return toast('Informe a data');
    if (col === 'anuncios') { if (!o.ate) o.ate = o.tipo === 'Evento' && o.data ? o.data : addDays(today(), 14); if (o.tipo === 'Evento' && o.data && o.ate < o.data) o.ate = o.data; }
    if (col === 'saidasAlt') { if (o.data < today()) return toast('Escolha hoje ou uma data futura'); if (!o.saida) { o.tipo = 'Extra'; if (!o.hora || !o.local) return toast('Saída extra precisa de horário e local'); }
      else { const fx = D.saidas.find(x => x.id === o.saida); if (fx && ordDia(fx.dia) !== DOW_ORD(o.data)) return toast(`Essa saída é de ${fx.dia}. Escolha uma data nesse dia da semana.`); } }
    await store.put(col, item && item.id, o); closeModal();
    if (col === 'publicadores' && !item) ask('Pessoa cadastrada', `<p><b>${esc(o.nome)}</b> recebeu o PIN pessoal:</p><div class="pin-big">${esc(o.pin)}</div><p class="small muted">Passe para a pessoa. Você pode consultar depois em Mais › Publicadores.</p>`, () => true, 'Ok'); else toast('Salvo');
  };
}
function confirmInline(btn) { if (btn.dataset.sure) return true; btn.dataset.sure = 1; btn.textContent = 'Toque de novo para confirmar'; return false; }
function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; render(); }
function resizeImage(file, max) {
  return new Promise(ok => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.75)); }; im.src = r.result; }; r.readAsDataURL(file); });
}
function ask(title, html, onOk, okLabel = 'Confirmar', info = ['Ok', 'Anotei', 'Fechar'].includes(okLabel)) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet"><h2>${title}</h2>${html}<datalist id="dl_pubs">${pubs().map(p => `<option value="${esc(p.nome)}">`).join('')}</datalist><div class="row" style="margin-top:6px"><span class="sp"></span><button class="btn sec2 ${info ? 'hidden' : ''}" id="ak_c">Cancelar</button><button class="btn" id="ak_ok">${okLabel}</button></div></div>`;
  m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); };
  $('#ak_c').onclick = closeModal; $('#ak_ok').onclick = async () => { if (await onOk() !== false) closeModal(); };
}
async function copy(txt) { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch (e) { ask('Copiar', `<textarea style="width:100%;min-height:200px">${esc(txt)}</textarea>`, () => true, 'Fechar'); } }
async function solicitar(tipo, dados) { if (isSup(meP())) return; await store.put('solicitacoes', null, { tipo, pub: S.me, nome: myName(), status: 'pendente', criado: today(), ...dados }); toast('Solicitação enviada'); }



// ================= limpeza automática e arquivo em PDF =================
const terrDue = () => { const c = cfg(); return can('terr.edit') && c.terrCorte && daysBetween(c.terrCorte, today()) >= 60; };
const relAntigos = () => D.relatorios.filter(r => r.mes && r.mes < mesAnterior());
const relDue = () => can('relatorios') && (relAntigos().length > 0 || D.atividade.some(a => mesDe(a.data) < mesAnterior()));
const avisosArquivo = () => (terrDue() ? `<div class="card warnc"><h3>Registro de territórios: hora de arquivar</h3><div class="small">A cada 2 meses o registro é apagado para o app não ficar pesado. Baixe o PDF antes.</div><button class="btn sm" style="margin-top:10px" data-act="arqTerr">Baixar PDF e limpar</button></div>` : '') +
  (relDue() ? `<div class="card warnc"><h3>Relatórios antigos: hora de arquivar</h3><div class="small">Todo mês os relatórios anteriores são apagados. Baixe o PDF antes.</div><button class="btn sm" style="margin-top:10px" data-act="arqRel">Baixar PDF e limpar</button></div>` : '');
let ultimaLimpeza = '';
async function limpeza() {
  const hoje = today(); if (!meP() || ultimaLimpeza === hoje + S.me) return; ultimaLimpeza = hoje + S.me;
  const del = async (col, perm, cond) => { if (!can(perm)) return; for (const x of D[col].filter(cond)) { try { await store.del(col, x.id); } catch (e) { console.warn(e); } } };
  await del('vmc', 'vmc', x => x.data && x.data < hoje);
  await del('fds', 'fds', x => x.data && x.data < hoje);
  await del('designacoes', 'designacoes', x => x.data && x.data < hoje);
  await del('carrinho', 'carrinho', x => x.data && x.data < hoje);
  await del('programas', 'programas', x => x.data && x.data < hoje);
  await del('saidasAlt', 'saidas', x => x.data && x.data < hoje);
  await del('anuncios', 'anuncios', x => (x.ate || x.data) && (x.ate || x.data) < hoje);
  if (can('terr.edit') && !cfg().terrCorte) await store.put('config', 'app', { ...cfg(), terrCorte: hoje });
}
async function pdfLib() {
  if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
}
async function gerarPDF(arquivo, titulo, sub, secoes) {
  await pdfLib();
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(16); doc.text(titulo, 14, 18); doc.setFontSize(10); doc.text(sub, 14, 25);
  let y = 32;
  secoes.forEach(sc => {
    if (y > 260) { doc.addPage(); y = 20; }
    if (sc.titulo) { doc.setFontSize(12); doc.text(sc.titulo, 14, y); y += 2; }
    doc.autoTable({ startY: y + 2, head: [sc.head], body: sc.body.length ? sc.body : [sc.head.map((h, i) => i ? '' : 'Nenhum registro')], styles: { fontSize: 9 }, headStyles: { fillColor: [20, 70, 224] }, margin: { left: 14, right: 14 } });
    y = doc.lastAutoTable.finalY + 10;
  });
  doc.save(arquivo);
}
async function arquivoTerritorios() {
  const c = cfg(), de = c.terrCorte || '', ts = [...D.territorios].sort((a, b) => (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0));
  const body = [];
  ts.forEach(t => { (t.historico || []).forEach(h => body.push([t.numero, t.grupo || '', h.dirigente || '', fmt(h.inicio), fmt(h.termino)]));
    if (t.inicio && !t.termino) body.push([t.numero, t.grupo || '', t.dirigente || '', fmt(t.inicio), 'em andamento']); });
  await gerarPDF(`registro-territorios-${today()}.pdf`, 'Registro de designação de territórios', `${c.nome || ''} · período ${fmt(de)} a ${fmt(today())}`, [{ head: ['Nº', 'Grupo', 'Dirigente', 'Início', 'Término'], body }]);
}
async function limparTerritorios() {
  for (const t of D.territorios) {
    const o = { ...t, historico: [] };
    if (!(t.inicio && !t.termino)) { if (t.termino) o.ultimoTermino = t.termino; o.dirigente = ''; o.inicio = ''; o.termino = ''; o.feito = []; for (const n of notasDe(t.id)) await store.del('terrNotas', n.id); }
    await store.put('territorios', t.id, o);
  }
  await store.put('config', 'app', { ...cfg(), terrCorte: today() });
}
async function arquivoRelatorios() {
  const meses = [...new Set([...relAntigos().map(r => r.mes), ...D.atividade.filter(a => mesDe(a.data) < mesAnterior()).map(a => mesDe(a.data))])].sort();
  const secoes = meses.map(m => { const rs = D.relatorios.filter(r => r.mes === m);
    const body = pubs().filter(p => !isSup(p)).map(p => { const r = rs.find(x => x.pub === p.id); const at = D.atividade.filter(a => a.pub === p.id && mesDe(a.data) === m);
      const horas = r && r.horas ? r.horas : (at.length ? Math.round(somaHoras(at) / 60) : '');
      return [p.nome, p.grupo || '', p.tipo || '', r ? (r.participou === false ? 'Não' : 'Sim') : 'Não enviou', r ? (r.estudos || 0) : '', horas || '', somaCred(at) || '', (r && r.obs) || '']; });
    return { titulo: mesLabel(m), head: ['Nome', 'Grupo', 'Tipo', 'Participou', 'EBs', 'Horas', 'Créd.', 'Obs.'], body }; });
  await gerarPDF(`relatorios-${meses[0] || ''}-a-${meses[meses.length - 1] || ''}.pdf`, 'Relatórios de serviço de campo', `${cfg().nome || ''} · ${meses.map(mesLabel).join(', ')}`, secoes);
}
async function limparRelatorios() {
  for (const r of relAntigos()) await store.del('relatorios', r.id);
  for (const a of D.atividade.filter(a => mesDe(a.data) < mesAnterior())) await store.del('atividade', a.id);
  for (const e of D.estudos.filter(e => e.mes < mesAnterior())) await store.del('estudos', e.id);
}
function fluxoArquivo(gerar, limpar, nome) {
  ask(`Arquivar ${nome}`, `<p>1. Toque em <b>Baixar PDF</b> e guarde o arquivo.</p><p>2. Depois toque em <b>Apagar registros</b>.</p><button class="btn block sec2" id="arq_pdf">Baixar PDF</button><p class="small muted" id="arq_st"></p>`,
    async () => { if (!$('#arq_pdf').dataset.ok) { toast('Baixe o PDF primeiro'); return false; } await limpar(); toast('Registros apagados'); }, 'Apagar registros');
  $('#arq_pdf').onclick = async () => { $('#arq_st').textContent = 'Gerando PDF…';
    try { await gerar(); $('#arq_pdf').dataset.ok = 1; $('#arq_st').textContent = 'PDF gerado. Confira se ele foi salvo no aparelho.'; } catch (e) { console.error(e); $('#arq_st').textContent = 'Não consegui gerar o PDF aqui. Nada foi apagado.'; } };
}


// ================= importar PDF de discursos (fim de semana) =================
const MES3 = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
function acharData(txt) {
  let m = txt.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);
  if (m) { const d = +m[1], mo = +m[2] - 1; if (d < 1 || d > 31 || mo < 0 || mo > 11) return null;
    if (m[3]) { let y = +m[3]; if (y < 100) y += 2000; return iso(new Date(y, mo, d)); } return nearestDate(d, mo, today()); }
  m = txt.match(/\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s*(?:de\s+)?(\d{4}))?/i);
  if (m) { const d = +m[1], mo = MES3[m[2].toLowerCase()]; return m[3] ? iso(new Date(+m[3], mo, d)) : nearestDate(d, mo, today()); }
  return null;
}
async function pdfRows(buf) {
  if (!window.pdfjsLib) { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'); pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }
  const doc = await pdfjsLib.getDocument({ data: buf }).promise; const rows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent(); const byY = {};
    tc.items.filter(i => i.str && i.str.trim()).forEach(i => { const y = Math.round(i.transform[5] / 3); (byY[y] = byY[y] || []).push({ x: i.transform[4], w: i.width || i.str.length * 4, t: i.str }); });
    Object.keys(byY).map(Number).sort((a, b) => b - a).forEach(y => {
      const its = byY[y].sort((a, b) => a.x - b.x), cells = [];
      its.forEach(i => { const last = cells[cells.length - 1]; if (last && i.x - (last.x + last.w) < 7) { last.t += (i.x - (last.x + last.w) > 1.5 ? ' ' : '') + i.t; last.w = i.x + i.w - last.x; } else cells.push({ ...i }); });
      rows.push(cells.map(c => ({ x: c.x, t: c.t.replace(/\s+/g, ' ').trim() })).filter(c => c.t));
    });
  }
  return rows;
}
const FDS_CAMPOS = [['', 'Ignorar'], ['tema', 'Tema do discurso'], ['numero', 'Número do esboço'], ['orador', 'Orador'], ['congregacao', 'Congregação'], ['presidente', 'Presidente'], ['leitor', 'Leitor de A Sentinela'], ['hospitalidade', 'Hospitalidade']];
const HEAD_RE = { tema: /tema|t[íi]tulo|discurso/i, numero: /^n[º°o.]?$|esbo[çc]o|n[úu]mero/i, orador: /orador/i, congregacao: /congrega/i, presidente: /presid/i, leitor: /leitor/i, hospitalidade: /hospital/i };
function montarRegistros(rows) {
  const regs = []; let head = null;
  rows.forEach(r => {
    const di = r.findIndex(c => acharData(c.t));
    if (di < 0) { if (!regs.length && r.filter(c => Object.values(HEAD_RE).some(re => re.test(c.t))).length >= 2) head = r;
      else if (regs.length) regs[regs.length - 1].extra.push(...r); return; }
    const data = acharData(r[di].t), resto = r.filter((c, i) => i !== di);
    const sobra = r[di].t.replace(/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/, '').replace(/\b\d{1,2}\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(\s*(de\s+)?\d{4})?/i, '').replace(/^(s[áa]b(ado)?|dom(ingo)?)[\s,.\-–]*/i, '').trim();
    if (sobra.length > 2) resto.unshift({ x: r[di].x + 40, t: sobra });
    regs.push({ data, cells: resto, extra: [] });
  });
  // colunas por posição x
  const xs = []; regs.forEach(g => g.cells.forEach(c => xs.push(c.x))); xs.sort((a, b) => a - b);
  const cols = []; xs.forEach(x => { const c = cols.find(k => Math.abs(k.x - x) < 25); if (c) { c.n++; c.x = (c.x * (c.n - 1) + x) / c.n; } else cols.push({ x, n: 1 }); });
  cols.sort((a, b) => a.x - b.x);
  const colOf = x => { let best = 0; cols.forEach((c, i) => { if (Math.abs(c.x - x) < Math.abs(cols[best].x - x)) best = i; }); return best; };
  regs.forEach(g => { g.vals = cols.map(() => ''); g.cells.forEach(c => { const i = colOf(c.x); g.vals[i] = (g.vals[i] ? g.vals[i] + ' ' : '') + c.t; });
    g.extra.forEach(c => { if (!cols.length) return; const i = colOf(c.x); if (Math.abs(cols[i].x - c.x) < 40) g.vals[i] = (g.vals[i] ? g.vals[i] + ' ' : '') + c.t; }); });
  // mapeamento automático
  const map = cols.map(() => '');
  if (head) head.forEach(h => { const k = Object.keys(HEAD_RE).find(k => HEAD_RE[k].test(h.t)); if (k && !map.includes(k) && cols.length) map[colOf(h.x)] = map[colOf(h.x)] || k; });
  if (!map.some(Boolean)) {
    const avg = i => regs.reduce((s, g) => s + (g.vals[i] || '').length, 0) / Math.max(1, regs.length);
    const num = cols.findIndex((c, i) => regs.filter(g => /^\d{1,3}$/.test(g.vals[i])).length > regs.length / 2); if (num >= 0) map[num] = 'numero';
    const free = cols.map((c, i) => i).filter(i => !map[i]);
    const tema = free.sort((a, b) => avg(b) - avg(a))[0]; if (tema != null) map[tema] = 'tema';
    const ordem = ['orador', 'congregacao', 'presidente', 'leitor', 'hospitalidade'];
    cols.forEach((c, i) => { if (!map[i] && ordem.length && avg(i) > 0) map[i] = ordem.shift(); });
  }
  return { regs: regs.filter(g => g.data), cols, map };
}
function abrirImportarFds() {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet"><h2>Importar discursos (PDF)</h2>
    <p class="small muted" style="margin-top:0">Escolha o PDF com a programação dos discursos públicos. O app lê as datas, os temas e os oradores. Antes de importar, você confere tudo.</p>
    <input type="file" id="fp_file" accept="application/pdf,.pdf"><div id="fp_res"></div>
    <div class="row" style="margin-top:10px"><span class="sp"></span><button class="btn sec2" id="fp_close">Fechar</button></div></div>`;
  m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); };
  $('#fp_close').onclick = closeModal;
  const res = $('#fp_res');
  $('#fp_file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; res.innerHTML = '<div class="banner">Lendo o PDF…</div>';
    let R; try { R = montarRegistros(await pdfRows(await f.arrayBuffer())); } catch (er) { console.error(er); res.innerHTML = '<div class="banner">Não consegui ler esse PDF.</div>'; return; }
    if (!R.regs.length) { res.innerHTML = '<div class="banner">Não encontrei datas nesse PDF. Mande o arquivo para ajustarmos a leitura.</div>'; return; }
    const draw = () => {
      res.innerHTML = `<div class="sec">Colunas encontradas</div><div class="card">${R.cols.map((c, i) => `<div class="f"><label>Coluna ${i + 1}: <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc((R.regs.find(g => g.vals[i]) || { vals: [] }).vals[i] || '—')}</span></label><select class="fp_map" data-i="${i}">${FDS_CAMPOS.map(([k, l]) => `<option value="${k}" ${R.map[i] === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}</div>
        <div class="sec">${R.regs.length} semana(s)</div><div class="card list">${R.regs.map((g, j) => { const v = k => { const i = R.map.indexOf(k); return i >= 0 ? g.vals[i] : ''; };
          return `<label class="it" style="cursor:pointer"><input type="checkbox" class="fp_chk" value="${j}" checked style="width:20px;height:20px;accent-color:var(--red)"><div class="sp"><b>${fmtShort(g.data)}</b> · ${esc(v('tema') || '—')}${v('numero') ? ` (${esc(v('numero'))})` : ''}<div class="small muted">${esc(v('orador') || '')}${v('congregacao') ? ' · ' + esc(v('congregacao')) : ''}${v('presidente') ? ' · Pres.: ' + esc(v('presidente')) : ''}${v('leitor') ? ' · Leitor: ' + esc(v('leitor')) : ''}</div></div></label>`; }).join('')}</div>
        <button class="btn block" id="fp_go">Importar selecionadas</button>`;
      $$('.fp_map', res).forEach(sel => sel.onchange = () => { R.map[+sel.dataset.i] = sel.value; draw(); });
      $('#fp_go').onclick = async () => { const sel = $$('.fp_chk:checked', res).map(x => R.regs[+x.value]); if (!sel.length) return toast('Nada selecionado');
        let n = 0, a = 0;
        for (const g of sel) { const ex = D.fds.find(x => x.data >= monday(g.data) && x.data <= addDays(monday(g.data), 6));
          const o = { ...(ex || {}), data: ex ? ex.data : g.data }; delete o.id;
          R.map.forEach((k, i) => { if (k && g.vals[i]) o[k] = g.vals[i]; });
          await store.put('fds', ex && ex.id, o); ex ? a++ : n++; }
        closeModal(); toast(`${n} nova(s), ${a} atualizada(s)`); };
    };
    draw();
  };
}

// ================= importar apostila (Vida e Ministério) =================
const MES_IDX = { janeiro: 0, fevereiro: 1, 'março': 2, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11 };
const DATE_RE = /^(\d{1,2})(?:\s*(?:de\s+)?([a-zçã]+))?\s*[-–—]\s*(\d{1,2})(?:\s*(?:de\s+)?([a-zçã]+))(?:\s+de\s+(\d{4}))?/i;
function nearestDate(day, month, ref) {
  const r = parse(ref); let best = null;
  [r.getFullYear() - 1, r.getFullYear(), r.getFullYear() + 1].forEach(y => { const d = new Date(y, month, day); if (!best || Math.abs(d - r) < Math.abs(best - r)) best = d; });
  return iso(best);
}
function secOf(line) {
  const u = line.toUpperCase();
  if (u.includes('TESOUROS DA PALAVRA')) return 'tesouros';
  if (u.includes('FAÇA SEU MELHOR') || u.includes('FACA SEU MELHOR') || u.includes('EMPENHE-SE NO MINIST')) return 'ministerio';
  if (u.includes('NOSSA VIDA CRIST')) return 'vida';
  return null;
}
function parseApostila(text, ref = today()) {
  const lines = String(text).replace(/\r/g, '').split(/\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const weeks = []; let w = null, sec = null, next = 1;
  const minIn = i => { for (let k = i; k < Math.min(i + 3, lines.length); k++) { const m = lines[k].match(/\((\d{1,2})\s*min/i); if (m) return Number(m[1]); if (k > i && /^\d{1,2}\.\s/.test(lines[k])) break; } return 0; };
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i], dm = L.length < 60 && L.match(DATE_RE);
    if (dm && MES_IDX[(dm[4] || '').toLowerCase()] !== undefined) {
      const mEnd = MES_IDX[dm[4].toLowerCase()], mStart = dm[2] && MES_IDX[dm[2].toLowerCase()] !== undefined ? MES_IDX[dm[2].toLowerCase()] : mEnd;
      const start = dm[5] ? iso(new Date(Number(dm[5]) - (mStart > mEnd ? 1 : 0), mStart, Number(dm[1]))) : nearestDate(Number(dm[1]), mStart, ref);
      w = { semana: monday(start), titulo: L, leitura: '', canticos: [], partes: [] }; weeks.push(w); sec = null; next = 1;
      const nx = lines[i + 1] || '';
      if (nx.length < 45 && /\d/.test(nx) && !/c[âa]ntico|^\d{1,2}\.\s/i.test(nx) && !secOf(nx)) { w.leitura = nx.toUpperCase(); i++; }
      continue;
    }
    if (!w) continue;
    const s2 = secOf(L); if (s2) { sec = s2; continue; }
    (L.match(/c[âa]ntico\s+(\d{1,3})/gi) || []).forEach(c => w.canticos.push(c.match(/\d+/)[0]));
    const pm = sec && L.match(/^(\d{1,2})\.\s*(.+)$/);
    if (pm && Number(pm[1]) === next) {
      const t = pm[2].replace(/\s*\(\d{1,2}\s*min\.?\).*$/i, '').trim();
      w.partes.push({ s: sec, t, m: minIn(i) }); next++;
    }
  }
  const byWeek = {};
  weeks.filter(x => x.partes.length >= 3).forEach(x => { if (!byWeek[x.semana] || byWeek[x.semana].partes.length < x.partes.length) byWeek[x.semana] = x; });
  return Object.values(byWeek).sort((a, b) => a.semana.localeCompare(b.semana));
}
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('p,h1,h2,h3,h4,h5,li,header,section,div,br,tr').forEach(el => el.insertAdjacentText('beforebegin', '\n'));
  return doc.body ? doc.body.textContent : '';
}
async function parseEpub(buf, ref) {
  if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter(n => /\.x?html?$/i.test(n)).sort();
  let txt = '';
  for (const n of names) txt += '\n' + htmlToText(await zip.files[n].async('string'));
  return parseApostila(txt, ref);
}
const issueOf = s => { const d = parse(s); let m = d.getMonth() + 1; if (m % 2 === 0) m -= 1; return `${d.getFullYear()}${pad(m)}`; };
const issueLabel = k => { const y = k.slice(0, 4), m = Number(k.slice(4)); return `${MESES[m - 1]}–${MESES[m]} de ${y}`; };
async function baixarApostila(issue) {
  const api = `https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS?output=json&pub=mwb&fileformat=EPUB&alllangs=0&langwritten=T&txtCMSLang=T&issue=${issue}`;
  const r = await fetch(api); if (!r.ok) throw new Error('api ' + r.status);
  const j = await r.json();
  const f = (((j.files || {}).T || {}).EPUB || [])[0]; if (!f) throw new Error('sem EPUB');
  const e = await fetch(f.file.url); if (!e.ok) throw new Error('epub ' + e.status);
  return parseEpub(await e.arrayBuffer(), `${issue.slice(0, 4)}-${issue.slice(4)}-15`);
}
function vmcDate(semana) { return addDays(semana, Number(cfg().diaVmc ?? 3)); }
async function aplicarSemanas(weeks) {
  let novos = 0, atual = 0;
  for (const w of weeks) {
    const data = vmcDate(w.semana);
    const ex = D.vmc.find(x => x.data >= w.semana && x.data <= addDays(w.semana, 6));
    const old = ex ? ex.partes || [] : [];
    const ebc = p => /estudo b[ií]blico/i.test(p.t || '');
    const pos = {};
    const partes = w.partes.map(p => {
      let o;
      if (ebc(p)) o = old.find(ebc);
      else { const same = old.filter(x => x.s === p.s && !ebc(x)); const k = pos[p.s] = (pos[p.s] || 0); o = same[k]; pos[p.s]++; }
      o = o || {}; return { s: p.s, t: p.t, m: p.m, n: o.n || '', n2: o.n2 || '' }; });
    const c = w.canticos;
    const keep = (prev, num) => prev && num && prev.match(/\d+/) && prev.match(/\d+/)[0] === num ? prev : (num ? 'Cântico ' + num : prev || '');
    const o = { ...(ex || {}), data: ex ? ex.data : data, leitura: w.leitura || (ex && ex.leitura) || '', canticoIni: keep(ex && ex.canticoIni, c[0]), canticoMeio: keep(ex && ex.canticoMeio, c[1]), canticoFim: keep(ex && ex.canticoFim, c.length >= 3 ? c[c.length - 1] : ''), partes, importado: today() };
    delete o.id; await store.put('vmc', ex && ex.id, o); ex ? atual++ : novos++;
  }
  return [novos, atual];
}
function abrirImportar() {
  const iss = [...new Set([issueOf(today()), issueOf(addDays(today(), 62))])];
  const m = $('#modal');
  m.innerHTML = `<div class="sheet"><h2>Importar apostila</h2>
    <p class="small muted" style="margin-top:0">Preenche os temas, a leitura da semana, os cânticos e o tempo de cada parte da reunião Vida e Ministério. As designações que já estiverem preenchidas são mantidas.</p>
    <div class="card"><h3>1. Baixar do jw.org</h3><div class="row"><select id="ap_iss" style="flex:1;border:2px solid var(--ink);padding:9px;background:#fff">${iss.map(k => `<option value="${k}">${esc(issueLabel(k))}</option>`).join('')}</select><button class="btn sm" id="ap_down">Baixar</button></div></div>
    <div class="card"><h3>2. Arquivo EPUB da apostila</h3><p class="small muted" style="margin:0 0 8px">No jw.org: Biblioteca › Apostila Vida e Ministério › baixar em EPUB.</p><input type="file" id="ap_file" accept=".epub,application/epub+zip"></div>
    <div class="card"><h3>3. Colar texto do JW Library</h3><p class="small muted" style="margin:0 0 8px">Abra a semana na apostila, selecione todo o texto, copie e cole aqui.</p><textarea id="ap_txt" style="width:100%;min-height:110px;border:2px solid var(--ink);padding:8px" placeholder="23-29 DE NOVEMBRO&#10;LAMENTAÇÕES 1-2&#10;Cântico 28 e oração..."></textarea><button class="btn sm sec2" id="ap_read" style="margin-top:8px">Ler texto</button></div>
    <div id="ap_res"></div>
    <div class="row" style="margin-top:6px"><span class="sp"></span><button class="btn sec2" id="ap_close">Fechar</button></div></div>`;
  m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); };
  $('#ap_close').onclick = closeModal;
  const res = $('#ap_res');
  const show = weeks => {
    if (!weeks.length) { res.innerHTML = '<div class="banner">Não encontrei nenhuma semana nesse conteúdo. Confira se é a apostila Vida e Ministério.</div>'; return; }
    res.innerHTML = `<div class="sec">Encontrei ${weeks.length} semana(s)</div><div class="card list">${weeks.map((w, i) => `<label class="it" style="cursor:pointer"><input type="checkbox" class="ap_chk" value="${i}" checked style="width:20px;height:20px;accent-color:var(--red)"><div class="sp"><b>${fmtShort(vmcDate(w.semana))}</b> · ${esc(w.leitura || w.titulo)}<div class="small muted">${w.partes.length} partes · cânticos ${esc(w.canticos.join(', '))}</div></div></label>`).join('')}</div>
      <button class="btn block" id="ap_go">Importar selecionadas</button>`;
    $('#ap_go').onclick = async () => { const sel = $$('.ap_chk:checked').map(x => weeks[Number(x.value)]); if (!sel.length) return toast('Nada selecionado');
      const [n, a] = await aplicarSemanas(sel); closeModal(); toast(`${n} nova(s), ${a} atualizada(s)`); };
  };
  const busy = t => { res.innerHTML = `<div class="banner">${t}</div>`; };
  $('#ap_down').onclick = async () => { busy('Baixando a apostila do jw.org…');
    try { show(await baixarApostila($('#ap_iss').value)); } catch (e) { console.error(e); res.innerHTML = '<div class="banner">Não consegui baixar direto por aqui. Baixe o arquivo EPUB no jw.org e use a opção 2, ou cole o texto na opção 3.</div>'; } };
  $('#ap_file').onchange = async e => { const f = e.target.files[0]; if (!f) return; busy('Lendo o arquivo…');
    try { show(await parseEpub(await f.arrayBuffer(), today())); } catch (er) { console.error(er); res.innerHTML = '<div class="banner">Não consegui ler esse arquivo. Ele precisa ser o EPUB da apostila.</div>'; } };
  $('#ap_read').onclick = () => show(parseApostila($('#ap_txt').value, today()));
}

// ================= ações =================
const ACTIONS = {
  toggleOpen: id => { S.open[id] = !S.open[id]; render(); },
  arqTerr: () => can('terr.edit') ? fluxoArquivo(arquivoTerritorios, limparTerritorios, 'registro de territórios') : null,
  arqRel: () => can('relatorios') ? fluxoArquivo(arquivoRelatorios, limparRelatorios, 'relatórios') : null,
  importarFds: () => can('fds') ? abrirImportarFds() : toast('Sem permissão'),
  importar: () => can('vmc') ? abrirImportar() : toast('Sem permissão'),
  terrGrupo: id => { S.terrGrupo = id; render(); },
  terrFiltro: id => { S.terrFiltro = id; render(); },
  relMes: id => { S.relMes = id; render(); },
  solFiltro: id => { S.solFiltro = id; render(); },
  cartIn: async id => { if (isSup(meP())) return; const x = D.carrinho.find(c => c.id === id); const ins = [...(x.inscritos || [])]; if (ins.length >= Number(x.vagas || 2)) return toast('Horário completo'); ins.push(myName()); await store.put('carrinho', id, { ...x, inscritos: ins }); toast('Inscrito!'); },
  cartOut: async id => { const x = D.carrinho.find(c => c.id === id); await store.put('carrinho', id, { ...x, inscritos: (x.inscritos || []).filter(n => !isMe(n)) }); toast('Você saiu do horário'); },
  sendRel: async () => { if (isSup(meP())) return;
    const mes = mesAnterior(), R = resumoMes(mes);
    await store.put('relatorios', `${mes}_${S.me}`, { mes, pub: S.me, nome: myName(), participou: R.horas > 0 || R.dias > 0 || R.eb > 0, estudos: R.eb, horas: R.horas, creditos: R.cred, obs: $('#rp_obs').value.trim(), enviadoEm: today() });
    toast('Relatório enviado!');
  },
  fuiCampo: async m => { if (isSup(meP())) return; await store.put('relatorios', `${m}_${S.me}`, { mes: m, pub: S.me, nome: myName(), participou: true, estudos: ebDe(m), horas: 0, obs: '', enviadoEm: today() }); toast('Enviado: fui ao campo'); },
  ebMais: m => ACTIONS._eb(m, 1), ebMenos: m => ACTIONS._eb(m, -1),
  _eb: async (m, d) => { const n = Math.max(0, ebDe(m) + d); await store.put('estudos', `${m}_${S.me}`, { mes: m, pub: S.me, estudos: n });
    const r = D.relatorios.find(x => x.id === `${m}_${S.me}`); if (r && !isPioneer(meP())) await store.put('relatorios', r.id, { ...r, estudos: n }); },
  desfazCampo: async (m, b) => { if (!confirmInline(b)) return; await store.del('relatorios', `${m}_${S.me}`); toast('Desfeito'); },
  addAtiv: () => ask('Adicionar atividade', `<div class="f"><label>Data</label><input id="av_d" type="date" value="${today()}" max="${today()}"></div>
      <div class="grid2"><div class="f"><label>Horas</label><input id="av_h" type="number" min="0" inputmode="numeric" value="1"></div><div class="f"><label>Minutos</label><select id="av_m">${[0, 15, 30, 45].map(x => `<option>${x}</option>`).join('')}</select></div></div>
      <div class="f"><label>Créditos (horas)</label><input id="av_c" type="number" min="0" inputmode="numeric" value="0"></div><div class="f"><label>Observação</label><input id="av_o" placeholder="Opcional"></div>`,
    async () => { const h = Number($('#av_h').value) || 0, mi = Number($('#av_m').value) || 0, cr = Number($('#av_c').value) || 0; if (!h && !mi && !cr) { toast('Informe o tempo'); return false; }
      await store.put('atividade', null, { pub: S.me, data: $('#av_d').value || today(), horas: h, minutos: mi, creditos: cr, obs: $('#av_o').value.trim() }); toast('Atividade registrada'); }, 'Salvar'),
  delAtiv: async (id, b) => { if (!confirmInline(b)) return; await store.del('atividade', id); },
  sendPio: async () => { const ms = $$('.pa_m:checked').map(x => x.value); if (!ms.length && !$('#pa_cont').checked) return toast('Escolha um mês'); await solicitar('pioneiro', { meses: ms, continuo: $('#pa_cont').checked, horas: Number($('#pa_h').value), obs: $('#pa_obs').value.trim() }); },
  sendAus: async () => { const i = $('#au_i').value, f = $('#au_f').value; if (!i || !f || f < i) return toast('Confira as datas'); await solicitar('ausencia', { inicio: i, fim: f, obs: $('#au_obs').value.trim() }); },
  sendTerr: async () => solicitar('territorio', { numero: $('#pt_n').value, obs: $('#pt_obs').value.trim() }),
  sendPub: async () => { const it = $('#pb_item').value.trim(); if (!it) return toast('Informe a publicação'); await solicitar('publicacoes', { item: it, qtd: Number($('#pb_q').value) || 1, idioma: $('#pb_i').value.trim(), obs: $('#pb_obs').value.trim() }); },
  delSol: async (id, b) => { if (!confirmInline(b)) return; await store.del('solicitacoes', id); },
  solOk: async id => { const s = D.solicitacoes.find(x => x.id === id); if (!can('sol.' + s.tipo)) return toast('Sem permissão');
    if (s.tipo === 'territorio') { const t = s.numero ? D.territorios.find(x => x.numero === s.numero) : D.territorios.find(x => !(x.inicio && !x.termino));
      if (t && !(t.inicio && !t.termino)) { await store.put('territorios', t.id, { ...t, dirigente: s.nome, inicio: today(), termino: '' }); s.numero = t.numero; toast(`Território ${t.numero} entregue a ${s.nome}`); } }
    await store.put('solicitacoes', id, { ...s, status: 'aprovado', resolvido: today() }); },
  solNo: async id => { const s = D.solicitacoes.find(x => x.id === id); if (!can('sol.' + s.tipo)) return toast('Sem permissão'); await store.put('solicitacoes', id, { ...s, status: 'recusado', resolvido: today() }); },
  saveContato: async () => { await store.put('publicadores', S.me, { ...meP(), telefone: $('#ct_tel').value.trim(), email: $('#ct_email').value.trim(), endereco: $('#ct_end').value.trim() }); toast('Salvo'); },
  addEm: () => $('#em_list').insertAdjacentHTML('beforeend', emRow({})),
  saveEm: async () => { const l = $$('.em-row').map(r => ({ nome: $('.em_n', r).value.trim(), parentesco: $('.em_p', r).value.trim(), telefone: $('.em_t', r).value.trim() })).filter(e => e.nome || e.telefone); await store.put('publicadores', S.me, { ...meP(), emergencia: l }); toast('Salvo'); },
  copyFds: id => { const x = D.fds.find(v => v.id === id); copy(`Reunião de fim de semana — ${fmtLong(x.data)} ${x.hora || cfg().horaFds || ''}\nDiscurso: ${x.tema || ''}${x.numero ? ' (' + x.numero + ')' : ''}\nOrador: ${x.orador || ''} (${x.congregacao || ''})\nPresidente: ${x.presidente || ''}\nLeitor: ${x.leitor || ''}`); },
  copyVmc: id => { const x = D.vmc.find(v => v.id === id); const { rows, out, ps } = vmcHorarios(x); let n = 0;
    const L = [`Vida e Ministério — ${fmtLong(x.data)}${x.leitura ? ' | ' + x.leitura : ''}`, `${hm(rows.ini)} ${x.canticoIni || 'Cântico'} — Oração: ${x.oracaoIni || ''}`, `${hm(rows.coment)} Comentários iniciais — Presidente: ${x.presidente || ''}`];
    ['tesouros', 'ministerio', 'vida'].forEach(k => { L.push('', SECS[k].t); ps.filter(p => p.s === k).forEach(p => { n++; L.push(`${hm(out[p.i])} ${n}. ${p.t} (${p.m} min.) — ${p.n || ''}${p.n2 ? ' / ' + p.n2 : ''}`); }); });
    L.push('', `${hm(rows.final)} ${x.canticoFim || 'Cântico final'} — Oração: ${x.oracaoFim || ''}`); copy(L.join('\n')); },
  terrStart: id => {
    if (!can('terr.mover')) return toast('Só dirigentes podem iniciar territórios');
    const t = D.territorios.find(x => x.id === id);
    ask(`Iniciar território ${esc(t.numero)}`, `<div class="f"><label>Dirigente</label><input id="ts_dir" list="dl_pubs" value="${esc(myName())}"></div><div class="f"><label>Data de início</label><input id="ts_data" type="date" value="${today()}"></div>`,
      async () => { const dir = $('#ts_dir').value.trim(); if (!dir) { toast('Informe o dirigente'); return false; } await store.put('territorios', id, { ...t, dirigente: dir, inicio: $('#ts_data').value || today(), termino: '' }); toast('Território iniciado'); }, 'Iniciei');
  },
  terrEnd: id => {
    if (!can('terr.mover')) return toast('Só dirigentes podem terminar territórios');
    const t = D.territorios.find(x => x.id === id);
    ask(`Terminar território ${esc(t.numero)}`, `<p class="small muted">Iniciado por ${esc(t.dirigente)} em ${fmt(t.inicio)}.</p><div class="f"><label>Data de término</label><input id="te_data" type="date" value="${today()}"></div>${(t.feito || []).length || notasDe(id).length ? `<div class="f"><label class="chk"><input type="checkbox" id="te_lp" checked> Apagar as marcações do mapa e as anotações (começa limpo na próxima vez)</label></div>` : ''}`,
      async () => { const fim = $('#te_data').value || today(); const h = [...(t.historico || []), { dirigente: t.dirigente, inicio: t.inicio, termino: fim }]; const lp = !$('#te_lp') || $('#te_lp').checked;
        await store.put('territorios', id, { ...t, historico: h, termino: fim, ...(lp ? { feito: [] } : {}) });
        if (lp) for (const n of notasDe(id)) await store.del('terrNotas', n.id);
        toast('Território concluído!'); }, 'Terminei');
  },
  cargoEdit: id => cargoEdit(id), terrMapa: id => terrMapa(id), terrNotas: id => terrNotas(id), ovGps: () => ovGps(),
  zoom: id => { const t = D.territorios.find(x => x.id === id); const m = $('#modal'); m.innerHTML = `<div class="sheet"><h2>Território ${esc(t.numero)}</h2><img src="${esc(t.imagem)}" style="width:100%"><button class="btn block" style="margin-top:10px" id="zz">Fechar</button></div>`; m.classList.remove('hidden'); $('#zz').onclick = closeModal; m.onclick = e => { if (e.target === m) closeModal(); }; },
  trocar: () => { S.me = null; LS.set('cg_me', null); render(); },
  sair: () => { S.me = null; LS.set('cg_me', null); render(); },
  saveCfg: async () => { await store.put('config', 'app', { ...cfg(), nome: $('#cf_nome').value.trim(), horaVmc: $('#cf_hv').value || '19:30', horaFds: $('#cf_hf').value || '19:00', relatoriosAtivos: $('#cf_rel').checked, diaVmc: Number($('#cf_dv').value) }); toast('Salvo'); },
  resetDemo: (id, btn) => { if (!confirmInline(btn)) return; try { ['cg_data', 'cg_me', 'cg_unlocked', 'cg_view', 'cg_param', 'cg_seedv'].forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); }
};
Object.keys(FORMS).forEach(c => {
  ACTIONS['new_' + c] = () => openForm(c);
  ACTIONS['edit_' + c] = id => openForm(c, D[c].find(x => x.id === id));
});

// ================= início =================
async function start() {
  $('#app').innerHTML = '<div class="empty" style="margin:40vh 20px 0">Carregando…</div>';
  try { store = await initStore(); } catch (e) { console.error(e); store = new LocalStore(); toast('Sem conexão com o banco; usando dados locais'); }
  if (store.demo) seedDemo();
  let pending = COLS.length, t;
  const seen = {};
  COLS.forEach(c => store.sub(c, items => {
    D[c] = items;
    if (!seen[c]) { seen[c] = 1; pending--; if (pending > 0) return; setTimeout(() => meP() && limpeza(), 500); }
    if ($('#modal').classList.contains('hidden')) {
      const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (typing) return;
      clearTimeout(t); t = setTimeout(render, 30);
    }
  }));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
})();
