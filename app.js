/* =============================================
   FitPlan — Core Logic
   ============================================= */

// ── State ─────────────────────────────────────────
const state = {
  genre: 'male',
  age: null, taille: null, poids: null,
  activite: 1.55,
  objectif: null,
  jours: 4,
};

// ── View management ───────────────────────────────
function showView(name) {
  ['loading', 'onboarding', 'dashboard', 'profile'].forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== name);
  });

  const navProg = document.getElementById('nav-programme');
  const navProf = document.getElementById('nav-profil');
  if (navProg && navProf) {
    navProg.classList.toggle('active', name === 'dashboard');
    navProf.classList.toggle('active', name === 'profile');
  }

  if (name === 'dashboard') history.replaceState(null, '', '#dashboard');
  else if (name === 'profile') history.replaceState(null, '', '#profile');
  else history.replaceState(null, '', location.pathname);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goHome() {
  if (state.objectif) showView('dashboard');
  else goToOnboardingStep(1);
}

function editProgram() {
  goToOnboardingStep(1);
  showView('onboarding');
}

// ── Onboarding steps ──────────────────────────────
function goToOnboardingStep(n) {
  showView('onboarding');
  document.getElementById('step-1').classList.toggle('hidden', n !== 1);
  document.getElementById('step-2').classList.toggle('hidden', n !== 2);

  const dot1 = document.getElementById('dot-1');
  const dot2 = document.getElementById('dot-2');
  const line1 = document.getElementById('line-1');

  dot1.classList.toggle('active', n === 1);
  dot1.classList.toggle('done',   n > 1);
  dot2.classList.toggle('active', n === 2);
  line1.classList.toggle('done',  n > 1);
}

function goToStep2() {
  const age    = parseFloat(document.getElementById('age').value);
  const taille = parseFloat(document.getElementById('taille').value);
  const poids  = parseFloat(document.getElementById('poids').value);
  const err    = document.getElementById('step1-error');

  if (!age    || age < 15    || age > 80)     return showErr(err, 'Âge valide requis (15–80 ans).');
  if (!taille || taille < 140 || taille > 220) return showErr(err, 'Taille valide requise (140–220 cm).');
  if (!poids  || poids < 40  || poids > 200)   return showErr(err, 'Poids valide requis (40–200 kg).');

  err.classList.add('hidden');
  state.age     = age;
  state.taille  = taille;
  state.poids   = poids;
  state.activite = parseFloat(document.getElementById('activite').value);

  goToOnboardingStep(2);
}

function showErr(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Genre toggle ──────────────────────────────────
document.querySelectorAll('.genre-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.genre = btn.dataset.value;
  });
});

// ── Objectif + jours ──────────────────────────────
const DAYS_DESC = {
  perte:   { 2:'2 Full Body — idéal si ton emploi du temps est chargé.', 3:'3 Full Body — le classique pour perdre du gras.', 4:'3 Full Body + 1 Cardio — combinaison optimale.', 5:'3 Full Body + 2 Cardio — accélère la perte.', 6:'4 Full Body + 2 Cardio — programme intensif.' },
  maintien:{ 2:'2 Full Body — parfait pour maintenir ses acquis.', 3:'3 Full Body — efficace pour la recomposition.', 4:'Upper / Lower × 2 — meilleure répartition du volume.', 5:'PPL + 2 — le sweet spot pour la recompo.', 6:'PPL × 2 — volume élevé.' },
  masse:   { 2:'2 Full Body lourd — faisable avec peu de temps.', 3:'3 Full Body composés — bonne base.', 4:'Upper / Lower × 2 — excellent pour le volume.', 5:'PPL + Push / Pull — le plus efficace pour la masse.', 6:'PPL × 2 — volume maximal.' },
};

function selectObjectif(card) {
  document.querySelectorAll('.objectif-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  state.objectif = card.dataset.value;
  document.getElementById('days-section').classList.remove('hidden');
  setJours(state.jours || 4);

  document.querySelectorAll('.days-btn').forEach(btn => {
    btn.onclick = () => setJours(parseInt(btn.dataset.days));
  });
}

function setJours(n) {
  state.jours = n;
  document.querySelectorAll('.days-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.days) === n));
  document.getElementById('days-desc').textContent = DAYS_DESC[state.objectif]?.[n] ?? '';
}

function showDaysSection() {
  const section = document.getElementById('days-section');
  if (!section) return;
  section.classList.remove('hidden');
  setJours(state.jours || 4);
  document.querySelectorAll('.days-btn').forEach(btn => {
    btn.onclick = () => setJours(parseInt(btn.dataset.days));
  });
}

// ── Generate & go to dashboard ────────────────────
function generateAndGo() {
  if (!state.objectif) return showErr(document.getElementById('step2-error'), 'Veuillez sélectionner un objectif.');
  document.getElementById('step2-error').classList.add('hidden');
  renderDashboard();
  renderProfile();
  showView('dashboard');
  document.getElementById('main-nav')?.classList.remove('hidden');
  // saveProfile() est appelé par l'intercepteur dans auth.js
}

// ── Calculations ──────────────────────────────────
function calcBMR(genre, poids, taille, age) {
  const base = 10 * poids + 6.25 * taille - 5 * age;
  return genre === 'male' ? base + 5 : base - 161;
}
function calcTDEE(bmr, activite)          { return Math.round(bmr * activite); }
function calcTargetCals(tdee, objectif)   {
  return objectif === 'perte' ? tdee - 500 : objectif === 'masse' ? tdee + 300 : tdee;
}
function calcMacros(calories, poids, objectif) {
  const protRatio = objectif === 'perte' ? 2.2 : objectif === 'masse' ? 2.0 : 1.8;
  const lipRatio  = objectif === 'masse' ? 0.28 : 0.25;
  const proteines = Math.round(poids * protRatio);
  const lipides   = Math.round(calories * lipRatio / 9);
  const glucides  = Math.round((calories - proteines * 4 - lipides * 9) / 4);
  return { proteines, lipides, glucides };
}

// ── Exercise database ─────────────────────────────
const EX = {
  pec:     [{ nom:'Développé couché barre', sets:'4×6–8', muscle:'Pectoraux' },{ nom:'Développé incliné haltères', sets:'3×10–12', muscle:'Pectoraux haut' },{ nom:'Écarté poulie basse', sets:'3×12–15', muscle:'Pectoraux' },{ nom:'Pompes lestées', sets:'3×max', muscle:'Pectoraux' }],
  dos:     [{ nom:'Tractions / Lat pulldown', sets:'4×8–10', muscle:'Grand dorsal' },{ nom:'Rowing barre', sets:'4×8–10', muscle:'Dos épais' },{ nom:'Rowing haltère 1 bras', sets:'3×10–12', muscle:'Grand dorsal' },{ nom:'Face pull poulie', sets:'3×15', muscle:'Trapèzes / Rotateurs' }],
  epaules: [{ nom:'Développé militaire barre', sets:'4×6–8', muscle:'Épaules' },{ nom:'Élévations latérales', sets:'4×12–15', muscle:'Deltoïdes latéraux' },{ nom:'Élévations frontales', sets:'3×12', muscle:'Deltoïdes antérieurs' },{ nom:'Oiseau poulie', sets:'3×15', muscle:'Deltoïdes postérieurs' }],
  biceps:  [{ nom:'Curl barre EZ', sets:'3×10–12', muscle:'Biceps' },{ nom:'Curl haltères marteau', sets:'3×12', muscle:'Brachial / Biceps' }],
  triceps: [{ nom:'Dips lestés / Barre au front', sets:'4×8–10', muscle:'Triceps' },{ nom:'Pushdown poulie', sets:'3×12–15', muscle:'Triceps' }],
  jambesQ: [{ nom:'Squat barre', sets:'4×6–8', muscle:'Quadriceps / Fessiers' },{ nom:'Presse à cuisses', sets:'3×10–12', muscle:'Quadriceps' },{ nom:'Fentes marchées', sets:'3×12/j', muscle:'Quadriceps / Fessiers' },{ nom:'Mollets debout', sets:'4×15–20', muscle:'Mollets' }],
  jambesI: [{ nom:'Soulevé de terre roumain', sets:'4×8–10', muscle:'Ischio / Fessiers' },{ nom:'Leg curl couché', sets:'3×12–15', muscle:'Ischio-jambiers' },{ nom:'Hip thrust barre', sets:'3×12', muscle:'Fessiers' },{ nom:'Mollets assis', sets:'4×15–20', muscle:'Soléaire' }],
  cardio:  [{ nom:'Tapis de course — LISS', sets:'30 min, 65% FC max', muscle:'' },{ nom:'Vélo elliptique', sets:'25 min, intensité modérée', muscle:'' },{ nom:'HIIT — Intervalles', sets:'20 min (30s sprint/90s repos)', muscle:'' },{ nom:'Corde à sauter', sets:'4×3 min', muscle:'' }],
};

const fbA = [EX.jambesQ[0], EX.pec[0], EX.dos[0], EX.epaules[0], EX.biceps[0], EX.triceps[0]];
const fbB = [EX.jambesI[0], EX.pec[1], EX.dos[1], EX.epaules[1], EX.biceps[1], EX.triceps[1]];
const fbC = [EX.jambesQ[1], EX.pec[2], EX.dos[2], EX.epaules[0], EX.biceps[0], EX.triceps[1]];
const fbD = [EX.jambesI[2], EX.pec[3], EX.dos[3], EX.epaules[1], EX.biceps[1], EX.triceps[0]];

const upperA = [EX.pec[0], EX.dos[0], EX.epaules[0], EX.dos[1], EX.biceps[0], EX.triceps[0]];
const upperB = [EX.pec[1], EX.dos[2], EX.epaules[1], EX.dos[3], EX.biceps[1], EX.triceps[1]];
const lowerA = [...EX.jambesQ];
const lowerB = [...EX.jambesI];

const push  = [...EX.pec.slice(0,3), EX.epaules[0], EX.epaules[1], EX.triceps[0], EX.triceps[1]];
const pull  = [...EX.dos, EX.biceps[0], EX.biceps[1]];
const legs  = [...EX.jambesQ.slice(0,2), ...EX.jambesI.slice(0,2), EX.jambesQ[3]];
const push2 = [EX.pec[3], EX.pec[1], EX.epaules[2], EX.epaules[3], EX.triceps[1]];
const pull2 = [EX.dos[1], EX.dos[2], EX.dos[3], EX.biceps[1]];
const legs2 = [EX.jambesI[0], EX.jambesQ[2], EX.jambesI[1], EX.jambesI[2], EX.jambesI[3]];

// Séances disponibles pour jours de repos
const CUSTOM_SESSIONS = [
  { key:'push',  label:'Push',      icon:'🫸', exercices: push  },
  { key:'pull',  label:'Pull',      icon:'🫷', exercices: pull  },
  { key:'legs',  label:'Legs',      icon:'🦵', exercices: legs  },
  { key:'upper', label:'Upper',     icon:'💪', exercices: upperA},
  { key:'fb',    label:'Full Body', icon:'🏋️', exercices: fbA   },
  { key:'cardio',label:'Cardio',    icon:'🔥', exercices: EX.cardio},
];

const D = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const REST  = j => ({ jour:j, type:'rest',     label:'Repos',  exercices:[] });
const CARD  = (j,ex) => ({ jour:j, type:'cardio',  label:'Cardio', exercices:ex });
const TRAIN = (j,l,ex) => ({ jour:j, type:'training', label:l,     exercices:ex });

function buildProgramme(objectif, jours) {
  const p = {
    perte: {
      2:[TRAIN(D[0],'Full Body A',fbA),REST(D[1]),REST(D[2]),TRAIN(D[3],'Full Body B',fbB),REST(D[4]),CARD(D[5],[EX.cardio[0]]),REST(D[6])],
      3:[TRAIN(D[0],'Full Body A',fbA),REST(D[1]),TRAIN(D[2],'Full Body B',fbB),REST(D[3]),TRAIN(D[4],'Full Body C',fbC),REST(D[5]),REST(D[6])],
      4:[TRAIN(D[0],'Full Body A',fbA),CARD(D[1],[EX.cardio[2],EX.cardio[3]]),REST(D[2]),TRAIN(D[3],'Full Body B',fbB),REST(D[4]),TRAIN(D[5],'Full Body C',fbC),REST(D[6])],
      5:[TRAIN(D[0],'Full Body A',fbA),CARD(D[1],[EX.cardio[0]]),TRAIN(D[2],'Full Body B',fbB),REST(D[3]),TRAIN(D[4],'Full Body C',fbC),CARD(D[5],[EX.cardio[1],EX.cardio[3]]),REST(D[6])],
      6:[TRAIN(D[0],'Full Body A',fbA),CARD(D[1],[EX.cardio[2]]),TRAIN(D[2],'Full Body B',fbB),CARD(D[3],[EX.cardio[0]]),TRAIN(D[4],'Full Body C',fbC),TRAIN(D[5],'Full Body D',fbD),REST(D[6])],
    },
    maintien: {
      2:[TRAIN(D[0],'Full Body A',fbA),REST(D[1]),REST(D[2]),TRAIN(D[3],'Full Body B',fbB),REST(D[4]),REST(D[5]),REST(D[6])],
      3:[TRAIN(D[0],'Full Body A',fbA),REST(D[1]),TRAIN(D[2],'Full Body B',fbB),REST(D[3]),TRAIN(D[4],'Full Body C',fbC),REST(D[5]),REST(D[6])],
      4:[TRAIN(D[0],'Upper A — Pec/Dos/Bras',upperA),TRAIN(D[1],'Lower A — Quadriceps',lowerA),REST(D[2]),TRAIN(D[3],'Upper B — Épaules/Dos/Bras',upperB),TRAIN(D[4],'Lower B — Ischio/Fessiers',lowerB),REST(D[5]),REST(D[6])],
      5:[TRAIN(D[0],'Push — Pec/Épaules/Triceps',push),TRAIN(D[1],'Pull — Dos/Biceps',pull),TRAIN(D[2],'Legs',legs),REST(D[3]),TRAIN(D[4],'Push (variation)',push2),TRAIN(D[5],'Pull (variation)',pull2),REST(D[6])],
      6:[TRAIN(D[0],'Push',push),TRAIN(D[1],'Pull',pull),TRAIN(D[2],'Legs',legs),REST(D[3]),TRAIN(D[4],'Push (variation)',push2),TRAIN(D[5],'Pull (variation)',pull2),TRAIN(D[6],'Legs (variation)',legs2)],
    },
    masse: {
      2:[TRAIN(D[0],'Full Body A — Lourd',fbA),REST(D[1]),REST(D[2]),TRAIN(D[3],'Full Body B — Lourd',fbB),REST(D[4]),REST(D[5]),REST(D[6])],
      3:[TRAIN(D[0],'Full Body A',fbA),REST(D[1]),TRAIN(D[2],'Full Body B',fbB),REST(D[3]),TRAIN(D[4],'Full Body C',fbC),REST(D[5]),REST(D[6])],
      4:[TRAIN(D[0],'Upper A',upperA),TRAIN(D[1],'Lower A — Quadriceps',lowerA),REST(D[2]),TRAIN(D[3],'Upper B',upperB),TRAIN(D[4],'Lower B — Ischio/Fessiers',lowerB),REST(D[5]),REST(D[6])],
      5:[TRAIN(D[0],'Push',push),TRAIN(D[1],'Pull',pull),TRAIN(D[2],'Legs',legs),REST(D[3]),TRAIN(D[4],'Push (variation)',push2),TRAIN(D[5],'Pull (variation)',pull2),REST(D[6])],
      6:[TRAIN(D[0],'Push',push),TRAIN(D[1],'Pull',pull),TRAIN(D[2],'Legs',legs),REST(D[3]),TRAIN(D[4],'Push (variation)',push2),TRAIN(D[5],'Pull (variation)',pull2),TRAIN(D[6],'Legs (variation)',legs2)],
    },
  };
  return p[objectif]?.[jours] ?? p[objectif]?.[4] ?? [];
}

// ── Dashboard renderer ────────────────────────────
function renderDashboard() {
  const { genre, age, taille, poids, activite, objectif, jours } = state;
  if (!objectif) return;

  const bmr    = calcBMR(genre, poids, taille, age);
  const tdee   = calcTDEE(bmr, activite);
  const cibles = calcTargetCals(tdee, objectif);
  const macros = calcMacros(cibles, poids, objectif);
  const programme = buildProgramme(objectif, jours);

  const splitNames = {
    perte:   {2:'Full Body 2×',3:'Full Body 3×',4:'Full Body 3× + Cardio',5:'Full Body 3× + Cardio 2×',6:'Full Body 4× + Cardio 2×'},
    maintien:{2:'Full Body 2×',3:'Full Body 3×',4:'Upper / Lower 4×',5:'Push / Pull / Legs 5×',6:'Push / Pull / Legs 6×'},
    masse:   {2:'Full Body 2× lourd',3:'Full Body 3× lourd',4:'Upper / Lower 4×',5:'Push / Pull / Legs 5×',6:'Push / Pull / Legs 6×'},
  };
  document.getElementById('split-label').textContent = splitNames[objectif]?.[jours] ?? '';

  // ── Bannière aujourd'hui
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayProg = programme[todayIdx];
  const objLabel = { perte:'Perte de poids', maintien:'Maintien / Recomposition', masse:'Prise de masse' }[objectif];
  const banner = document.getElementById('today-banner');
  const isRest = todayProg.type === 'rest';
  banner.innerHTML = `
    <div class="today-left">
      <div class="today-meta">${objLabel} · ${jours} jours/semaine</div>
      <div class="today-day">${isRest ? '💤 Aujourd\'hui : Repos' : `Aujourd'hui — ${todayProg.label}`}</div>
      ${isRest ? '<div class="today-sub">Récupération active : étirements, marche légère.</div>' : `<div class="today-sub">${todayProg.exercices.length} exercices · Bonne séance 💪</div>`}
    </div>
    <button class="today-btn" onclick="startSession()">
      ${isRest ? '+ Séance libre' : '▶ Démarrer la séance'}
    </button>`;

  // ── Grille semaine (7 colonnes)
  document.getElementById('week-grid').innerHTML = programme.map((day, i) => {
    const isToday = i === todayIdx;
    const exHTML = day.exercices.map(ex => `
      <div class="exercise-item">
        <div style="flex:1;min-width:0">
          <div class="exercise-name">${ex.nom}</div>
          ${ex.muscle ? `<div style="font-size:10px;color:#6b7280;margin-top:1px">${ex.muscle}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span class="exercise-sets" style="font-size:11px">${ex.sets}</span>
          <button class="demo-btn" onclick="openDemo('${ex.nom.replace(/'/g,"\\'")}')">▶</button>
        </div>
      </div>`).join('');

    const headerBg = isToday ? 'background:rgba(249,115,22,0.2);border-bottom:2px solid #f97316'
      : day.type === 'cardio' ? 'background:rgba(20,184,166,0.08)' : day.type === 'rest' ? 'background:#0d1117' : 'background:rgba(249,115,22,0.06)';

    return `
      <div class="day-card${isToday ? ' today-highlight' : ''}${day.type === 'rest' && !isToday ? ' rest-day' : ''}">
        <div class="day-header" style="${headerBg}">
          <span class="day-name">${day.jour.slice(0,3)}</span>
          <span class="day-type ${day.type}">${day.type === 'rest' ? 'Repos' : day.label.split('—')[0].split('(')[0].trim()}</span>
        </div>
        <div class="exercise-list">
          ${day.exercices.length === 0 ? '<div style="padding:10px 0;color:#4b5563;font-size:12px">Récupération</div>' : exHTML}
        </div>
      </div>`;
  }).join('');

  // ── Nutrition
  const macroTotal = macros.proteines * 4 + macros.lipides * 9 + macros.glucides * 4;
  const pPct = Math.round(macros.proteines * 4 / macroTotal * 100);
  const lPct = Math.round(macros.lipides * 9 / macroTotal * 100);
  const gPct = 100 - pPct - lPct;
  document.getElementById('dash-nutrition').innerHTML = `
    <div class="calorie-stat" style="margin-bottom:16px;text-align:left;display:flex;align-items:center;gap:12px;background:rgba(249,115,22,0.08);border-radius:10px;padding:14px 16px">
      <div><div class="value" style="font-size:32px">${cibles}</div><div class="unit">kcal / jour</div></div>
    </div>
    <div class="macro-bars">
      ${[['🥩 Protéines','#f97316',pPct,macros.proteines,'g'],['🫒 Lipides','#a78bfa',lPct,macros.lipides,'g'],['🍚 Glucides','#34d399',gPct,macros.glucides,'g']].map(([label,color,pct,val]) => `
        <div class="macro-row">
          <div class="macro-label" style="font-size:12px">${label}</div>
          <div class="macro-bar-bg"><div class="macro-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="macro-value" style="font-size:12px">${val}g</div>
        </div>`).join('')}
    </div>`;

  // ── Conseils (3 max sur le dashboard)
  const conseils = getConseils(objectif, poids, macros.proteines, jours).slice(0, 3);
  document.getElementById('dash-conseils').innerHTML = conseils.map(c => `
    <div class="conseil-item" style="font-size:13px">
      <span class="conseil-icon" style="font-size:16px">${c.icon}</span>
      <span>${c.text}</span>
    </div>`).join('');
}

// ── Profile renderer ──────────────────────────────
function renderProfile() {
  const { genre, age, taille, poids, activite, objectif, jours } = state;
  if (!objectif) return;

  const bmr    = calcBMR(genre, poids, taille, age);
  const tdee   = calcTDEE(bmr, activite);
  const cibles = calcTargetCals(tdee, objectif);
  const macros = calcMacros(cibles, poids, objectif);

  const imc = (poids / ((taille / 100) ** 2)).toFixed(1);
  const imcLabel = imc < 18.5 ? 'Insuffisance pondérale' : imc < 25 ? 'Poids normal' : imc < 30 ? 'Surpoids' : 'Obésité';
  const actLabels = { 1.2:'Sédentaire', 1.375:'Légèrement actif', 1.55:'Modérément actif', 1.725:'Très actif', 1.9:'Extrêmement actif' };
  const splitNames = {
    perte:{2:'Full Body 2×',3:'Full Body 3×',4:'Full Body 3× + Cardio',5:'Full Body 3× + Cardio 2×',6:'Full Body 4× + Cardio 2×'},
    maintien:{2:'Full Body 2×',3:'Full Body 3×',4:'Upper / Lower 4×',5:'Push / Pull / Legs 5×',6:'Push / Pull / Legs 6×'},
    masse:{2:'Full Body 2×',3:'Full Body 3×',4:'Upper / Lower 4×',5:'Push / Pull / Legs 5×',6:'Push / Pull / Legs 6×'},
  };
  const objLabel = { perte:'🔥 Perte de poids', maintien:'⚖️ Maintien / Recomposition', masse:'💪 Prise de masse' }[objectif];

  const row = (label, val) => `<div class="profile-row"><span class="profile-row-label">${label}</span><span class="profile-row-val">${val}</span></div>`;

  document.getElementById('profile-identity').innerHTML =
    row('Genre',    genre === 'male' ? 'Homme' : 'Femme') +
    row('Âge',      `${age} ans`) +
    row('Taille',   `${taille} cm`) +
    row('Poids',    `${poids} kg`) +
    row('IMC',      `${imc} — ${imcLabel}`) +
    row('Activité', actLabels[activite] ?? '');

  document.getElementById('profile-program').innerHTML =
    row('Objectif',  objLabel) +
    row('Jours/sem', `${jours} jours`) +
    row('Split',     splitNames[objectif]?.[jours] ?? '') +
    row('BMR',        `${Math.round(bmr)} kcal/j`) +
    row('TDEE',       `${tdee} kcal/j`) +
    row('Cible cal.', `${cibles} kcal/j`);

  document.getElementById('profile-nutrition').innerHTML =
    row('Calories',  `${cibles} kcal/j`) +
    row('Protéines', `${macros.proteines} g/j`) +
    row('Lipides',   `${macros.lipides} g/j`) +
    row('Glucides',  `${macros.glucides} g/j`) +
    row('Eau',       `${Math.round(poids * 0.035)} L/j`);
}

// ── Conseils ──────────────────────────────────────
function getConseils(objectif, poids, proteines, jours) {
  const base = [
    { icon:'💧', text:`Bois ${Math.round(poids * 0.035)} L d'eau/j. Essentiel pour la performance.` },
    { icon:'😴', text:'Dors 7–9 h/nuit. Le muscle se construit pendant le sommeil.' },
    { icon:'🥩', text:`Vise ${proteines} g de protéines par jour : poulet, œufs, fromage blanc, poisson.` },
    { icon:'📈', text:'Surcharge progressive chaque semaine : plus de poids ou plus de reps.' },
  ];
  const extra = {
    perte:   [{ icon:'⏰', text:'Un déficit de 500 kcal/j suffit. La constance prime.' },{ icon:'🥗', text:'Légumes, blancs d\'œufs, yaourt grec 0% — fort volume, peu de calories.' }],
    masse:   [{ icon:'⏰', text:'4–6 repas/j pour maintenir un apport constant en acides aminés.' },{ icon:'🥜', text:'Lait, shakers, beurre de cacahuète si tu as du mal à atteindre tes calories.' }],
    maintien:[{ icon:'⏰', text:'Maintiens ton poids stable 8–12 semaines avant d\'ajuster.' },{ icon:'🔄', text:'Déload toutes les 6–8 semaines : semaine à 60% des charges.' }],
  };
  return [...base, ...(extra[objectif] ?? [])];
}

// ── Demo modal — images statiques wger.de ─────────
// L'API wger.de a changé (exercise_base supprimé, filtres cassés).
// On utilise un mapping direct nom → URLs d'images stables depuis leur CDN.
const W = 'https://wger.de/media/exercise-images/';
const EXERCISE_IMAGES = {
  'Développé couché barre':         [W+'192/Bench-press-1.png'],
  'Développé incliné haltères':     [W+'41/Incline-bench-press-1.png', W+'16/Incline-press-1.png'],
  'Écarté poulie basse':           [W+'71/Cable-crossover-2.png', W+'122/Incline-cable-flyes-1.png'],
  'Pompes lestées':                [W+'31/92f6451b-f89d-49d6-9531-8970ea420d97.png'],
  'Tractions / Lat pulldown':      [W+'181/Chin-ups-2.png'],
  'Rowing barre':                  [W+'110/Reverse-grip-bent-over-rows-1.png', W+'106/T-bar-row-1.png'],
  'Rowing haltère 1 bras':         [W+'143/Cable-seated-rows-2.png'],
  'Face pull poulie':              [W+'109/Barbell-rear-delt-row-1.png'],
  'Développé militaire barre':     [W+'119/seated-barbell-shoulder-press-large-1.png'],
  'Élévations latérales':         [W+'148/lateral-dumbbell-raises-large-2.png'],
  'Élévations frontales':         [W+'123/dumbbell-shoulder-press-large-1.png'],
  'Oiseau poulie':                 [W+'109/Barbell-rear-delt-row-1.png'],
  'Curl barre EZ':                 [W+'81/Biceps-curl-1.png', W+'129/Standing-biceps-curl-1.png'],
  'Curl haltères marteau':         [W+'86/Bicep-hammer-curl-1.png', W+'138/Hammer-curls-with-rope-1.png'],
  'Dips lestés / Barre au front':  [W+'83/Bench-dips-1.png', W+'84/Lying-close-grip-triceps-press-to-chin-1.png'],
  'Pushdown poulie':               [W+'84/Lying-close-grip-triceps-press-to-chin-1.png'],
  'Squat barre':                   [W+'191/Front-squat-1-857x1024.png'],
  'Presse à cuisses':             [W+'130/Narrow-stance-hack-squats-1-1024x721.png'],
  'Soulevé de terre roumain':     [W+'161/Dead-lifts-2.png'],
  'Fentes marchées':               [W+'113/Walking-lunges-1.png'],
  'Leg curl couché':               [W+'154/lying-leg-curl-machine-large-1.png'],
  'Mollets debout':                [W+'129/Standing-biceps-curl-1.png'],
  'Hip thrust barre':              [W+'128/Hyperextensions-1.png'],
  'Mollets assis':                 [W+'117/seated-leg-curl-large-1.png'],
};

function openDemo(nom) {
  const modal  = document.getElementById('demo-modal');
  const title  = document.getElementById('modal-title');
  const body   = document.getElementById('modal-body');
  const ytLink = document.getElementById('modal-yt-link');

  title.textContent = nom;
  ytLink.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`comment faire ${nom} musculation tutoriel`)}`;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const imgs = EXERCISE_IMAGES[nom];
  if (imgs?.length) {
    body.innerHTML = `
      <div class="modal-images">
        ${imgs.map(src => `<img src="${src}" alt="${nom}" loading="lazy" onerror="this.style.display='none'"/>`).join('')}
      </div>
      <p class="modal-source">Source : wger.de</p>`;
  } else {
    body.innerHTML = `
      <div class="modal-fallback">
        <div style="font-size:52px;margin-bottom:12px">🏋️</div>
        <p style="font-weight:600;margin-bottom:6px">${nom}</p>
        <p style="color:#6b7280;font-size:13px">Clique sur YouTube ci-dessous pour voir le tutoriel vidéo.</p>
      </div>`;
  }
}

function closeModal() {
  document.getElementById('demo-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeRestModal(); } });

// ── Utils ─────────────────────────────────────────
function printPage() { window.print(); }

function copyToClipboard() {
  if (!state.objectif) return;
  const bmr    = calcBMR(state.genre, state.poids, state.taille, state.age);
  const cibles = calcTargetCals(calcTDEE(bmr, state.activite), state.objectif);
  const macros = calcMacros(cibles, state.poids, state.objectif);
  const labels = { perte:'Perte de poids', maintien:'Maintien', masse:'Prise de masse' };
  navigator.clipboard.writeText(`🏋️ FitPlan\n${labels[state.objectif]} · ${state.jours}j/sem\nCalories : ${cibles} kcal/j\nProtéines : ${macros.proteines}g · Lipides : ${macros.lipides}g · Glucides : ${macros.glucides}g`).then(() => showToast('✓ Copié !'));
}
