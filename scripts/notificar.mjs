// Envia as notificações do dia (roda pelo GitHub Actions, todo dia às 9h de Brasília).
// Avisa: partes da Vida e Ministério e do fim de semana (7 dias antes e na véspera),
// designações mecânicas, testemunho público e dirigentes de saída de campo (na véspera).
import admin from 'firebase-admin';

const sa = process.env.FIREBASE_SA;
if (!sa) { console.log('Segredo FIREBASE_SA não configurado — nada a enviar.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();
const URL_APP = 'https://limajonata230-ops.github.io/zerobyte-nexus/';
const TESTE = process.env.TESTE_PARA || '';   // nome de uma pessoa: manda só um aviso de teste para ela

const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDias = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaSemana = d => DIAS[new Date(d + 'T12:00:00Z').getUTCDay()];
const fmt = d => d.split('-').reverse().slice(0, 2).join('/');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const nomes = v => String(v || '').split(/[,/;]| e /).map(x => x.trim()).filter(Boolean);
const lista = async c => (await db.collection(c).get()).docs.map(d => ({ id: d.id, ...d.data() }));

const [pubs, tokens, vmc, fds, desig, carr, saidas, saidasAlt] = await Promise.all(['publicadores', 'pushTokens', 'vmc', 'fds', 'designacoes', 'carrinho', 'saidas', 'saidasAlt'].map(lista));
const porNome = new Map(pubs.map(p => [norm(p.nome), p]));
const avisos = new Map(); // pubId -> [linhas]
const add = (nome, linha) => { const p = porNome.get(norm(nome)); if (!p) return; if (!avisos.has(p.id)) avisos.set(p.id, []); const l = avisos.get(p.id); if (!l.includes(linha)) l.push(linha); };

const hoje = hojeBR(), amanha = addDias(hoje, 1), semana = addDias(hoje, 7);
const quando = d => d === amanha ? 'Amanhã' : `${diaSemana(d)[0].toUpperCase() + diaSemana(d).slice(1)}, ${fmt(d)}`;

if (TESTE) add(TESTE, 'Este é um aviso de teste do ZeroByte Nexus. As notificações estão funcionando!');
else {
  for (const r of vmc) for (const d of [amanha, semana]) if (r.data === d) {
    const q = quando(d) + ' (Vida e Ministério)';
    add(r.presidente, `${q}: você é o presidente.`);
    add(r.oracaoIni, `${q}: oração inicial.`); add(r.oracaoFim, `${q}: oração final.`);
    for (const p of r.partes || []) { if (p.n) add(p.n, `${q}: ${p.t}${p.n2 ? ' (com ' + p.n2 + ')' : ''}.`); if (p.n2) add(p.n2, `${q}: ajudante em "${p.t}" (com ${p.n}).`); }
  }
  for (const r of fds) for (const d of [amanha, semana]) if (r.data === d) {
    const q = quando(d) + ' (fim de semana)';
    add(r.presidente, `${q}: você é o presidente.`); add(r.leitor, `${q}: leitor de A Sentinela.`);
    add(r.orador, `${q}: seu discurso "${r.tema || ''}".`);
  }
  for (const r of desig) if (r.data === amanha) {
    const q = 'Amanhã na reunião';
    for (const [k, nome] of [['indicadores', 'indicador'], ['som', 'áudio e vídeo'], ['microfones', 'microfone volante'], ['palco', 'palco']]) for (const n of nomes(r[k])) add(n, `${q}: ${nome}.`);
  }
  for (const r of carr) if (r.data === amanha) for (const n of r.inscritos || []) add(n, `Amanhã: testemunho público ${r.hora || ''} em ${r.local || ''}.`.replace(/\s+/g, ' '));
  const alt = saidasAlt.filter(a => a.data === amanha);
  for (const s of saidas) if (norm(s.dia) === norm(diaSemana(amanha))) {
    const a = alt.find(x => x.saida === s.id); if (a && a.tipo === 'Cancelada') continue;
    const dir = (a && a.dirigente) || s.dirigente;
    add(dir, `Amanhã você dirige a saída de campo às ${(a && a.hora) || s.hora} em ${(a && a.local) || s.local}.`);
  }
  for (const a of alt) if (!a.saida && a.dirigente) add(a.dirigente, `Amanhã você dirige a saída de campo às ${a.hora} em ${a.local}.`);
}

let enviados = 0, falhas = 0;
for (const [pub, linhas] of avisos) {
  const tks = tokens.filter(t => t.pub === pub);
  if (!tks.length) continue;
  const title = TESTE ? '🔔 ZeroByte Nexus' : linhas.length > 1 ? `Você tem ${linhas.length} designações` : 'Lembrete de designação';
  const body = linhas.join('\n');
  const res = await admin.messaging().sendEachForMulticast({
    tokens: tks.map(t => t.token),
    notification: { title, body },
    data: { url: URL_APP, title, body },
    android: { priority: 'high', notification: { color: '#1446e0', defaultSound: true } },
    webpush: { fcmOptions: { link: URL_APP }, notification: { icon: URL_APP + 'icons/icon-192.png', badge: URL_APP + 'icons/favicon-48.png' } },
    apns: { payload: { aps: { sound: 'default' } } }
  });
  enviados += res.successCount; falhas += res.failureCount;
  // apaga aparelhos que não existem mais
  await Promise.all(res.responses.map((r, i) => !r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || '') ? db.collection('pushTokens').doc(tks[i].id).delete() : null));
}
console.log(`Dia ${hoje}: ${avisos.size} pessoa(s) com aviso, ${enviados} notificação(ões) enviada(s), ${falhas} falha(s).`);
process.exit(0);
