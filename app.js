/* =============================================
   FitPlan — Application Logic
   ============================================= */

// ── State ─────────────────────────────────────────
const state = {
  genre: 'male',
  age: null,
  taille: null,
  poids: null,
  activite: 1.55,
  objectif: null,
  jours: 4,
};

// ── Genre toggle ──────────────────────────────────
document.querySelectorAll('.genre-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.genre = btn.dataset.value;
  });
});

// ── Objectif selection ────────────────────────────
function selectObjectif(card) {
  document.querySelectorAll('.objectif-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  state.objectif = card.dataset.value;
  showDaysSection();
}

// ── Jours selector ────────────────────────────────
const DAYS_DESC = {
  perte: {
    2: '2 Full Body — adapté si ton emploi du temps est chargé. Complète avec des marches actives.',
    3: '3 Full Body — le classique pour perdre du gras en préservant le muscle.',
    4: '3 Full Body + 1 séance cardio — combinaison optimale pour la perte de poids.',
    5: '3 Full Body + 2 cardio — idéal pour accélérer la perte tout en gardant de l\'énergie.',
    6: '4 Full Body + 2 cardio — programme intensif, uniquement si tu récupères bien.',
  },
  maintien: {
    2: '2 Full Body — parfait pour maintenir ses acquis avec peu de temps disponible.',
    3: '3 Full Body — efficace pour maintenir et améliorer légèrement la composition corporelle.',
    4: 'Split Upper / Lower × 2 — meilleure répartition du volume, plus de gains.',
    5: 'Push / Pull / Legs + 2 — volume intermédiaire, le sweet spot pour la recomposition.',
    6: 'Push / Pull / Legs × 2 — volume élevé, idéal si tu te remets bien entre les séances.',
  },
  masse: {
    2: '2 Full Body lourd — sous-optimal pour la masse mais faisable avec peu de temps.',
    3: '3 Full Body composés — bonne base pour débuter la prise de masse.',
    4: 'Split Upper / Lower × 2 — excellent pour le volume et la fréquence par muscle.',
    5: 'Push / Pull / Legs + Push / Pull — le programme de prise de masse le plus efficace.',
    6: 'Push / Pull / Legs × 2 — volume maximal pour les pratiquants avancés.',
  },
};

function showDaysSection() {
  const section = document.getElementById('days-section');
  section.classList.remove('hidden');

  // Default to 4j
  setJours(state.jours || 4);

  document.querySelectorAll('.days-btn').forEach(btn => {
    btn.addEventListener('click', () => setJours(parseInt(btn.dataset.days)));
  });
}

function setJours(n) {
  state.jours = n;
  document.querySelectorAll('.days-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.days) === n);
  });
  const desc = DAYS_DESC[state.objectif]?.[n] ?? '';
  document.getElementById('days-desc').textContent = desc;
}

// ── Navigation ────────────────────────────────────
function goToStep(n) {
  document.querySelectorAll('.step-section').forEach((s, i) => {
    s.classList.toggle('hidden', i + 1 !== n);
  });
  updateStepIndicator(n);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepIndicator(current) {
  [1, 2, 3].forEach(n => {
    const dot = document.getElementById(`dot-${n}`);
    dot.classList.remove('active', 'done');
    if (n < current) dot.classList.add('done');
    else if (n === current) dot.classList.add('active');
  });
  [1, 2].forEach(n => {
    document.getElementById(`line-${n}`).classList.toggle('done', n < current);
  });
}

function goToStep2() {
  const age    = parseFloat(document.getElementById('age').value);
  const taille = parseFloat(document.getElementById('taille').value);
  const poids  = parseFloat(document.getElementById('poids').value);
  const err    = document.getElementById('step1-error');

  if (!age    || age < 15    || age > 80)    return showError(err, 'Veuillez entrer un âge valide (15–80 ans).');
  if (!taille || taille < 140 || taille > 220) return showError(err, 'Veuillez entrer une taille valide (140–220 cm).');
  if (!poids  || poids < 40  || poids > 200)  return showError(err, 'Veuillez entrer un poids valide (40–200 kg).');

  err.classList.add('hidden');
  state.age     = age;
  state.taille  = taille;
  state.poids   = poids;
  state.activite = parseFloat(document.getElementById('activite').value);

  goToStep(2);
}

function goToResults() {
  if (!state.objectif) return showError(document.getElementById('step2-error'), 'Veuillez sélectionner un objectif.');
  document.getElementById('step2-error').classList.add('hidden');
  renderResults();
  goToStep(3);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Calculations ──────────────────────────────────
function calcBMR(genre, poids, taille, age) {
  const base = 10 * poids + 6.25 * taille - 5 * age;
  return genre === 'male' ? base + 5 : base - 161;
}

function calcTDEE(bmr, activite) {
  return Math.round(bmr * activite);
}

function calcTargetCalories(tdee, objectif) {
  if (objectif === 'perte') return tdee - 500;
  if (objectif === 'masse') return tdee + 300;
  return tdee;
}

function calcMacros(calories, poids, objectif) {
  const protRatio = objectif === 'perte' ? 2.2 : objectif === 'masse' ? 2.0 : 1.8;
  const lipRatio  = objectif === 'masse' ? 0.28 : 0.25;
  const proteines = Math.round(poids * protRatio);
  const lipides   = Math.round((calories * lipRatio) / 9);
  const glucides  = Math.round((calories - proteines * 4 - lipides * 9) / 4);
  return { proteines, lipides, glucides };
}

// ── Exercise database ─────────────────────────────
const EX = {
  pec: [
    { nom: 'Développé couché barre',     sets: '4×6–8',   muscle: 'Pectoraux' },
    { nom: 'Développé incliné haltères', sets: '3×10–12', muscle: 'Pectoraux haut' },
    { nom: 'Écarté poulie basse',        sets: '3×12–15', muscle: 'Pectoraux' },
    { nom: 'Pompes lestées',             sets: '3×max',   muscle: 'Pectoraux' },
  ],
  dos: [
    { nom: 'Tractions / Lat pulldown',   sets: '4×8–10',  muscle: 'Grand dorsal' },
    { nom: 'Rowing barre',               sets: '4×8–10',  muscle: 'Dos épais' },
    { nom: 'Rowing haltère 1 bras',      sets: '3×10–12', muscle: 'Grand dorsal' },
    { nom: 'Face pull poulie',           sets: '3×15',    muscle: 'Trapèzes / Rotateurs' },
  ],
  epaules: [
    { nom: 'Développé militaire barre',  sets: '4×6–8',   muscle: 'Épaules' },
    { nom: 'Élévations latérales',       sets: '4×12–15', muscle: 'Deltoïdes latéraux' },
    { nom: 'Élévations frontales',       sets: '3×12',    muscle: 'Deltoïdes antérieurs' },
    { nom: 'Oiseau poulie',              sets: '3×15',    muscle: 'Deltoïdes postérieurs' },
  ],
  biceps: [
    { nom: 'Curl barre EZ',              sets: '3×10–12', muscle: 'Biceps' },
    { nom: 'Curl haltères marteau',      sets: '3×12',    muscle: 'Brachial / Biceps' },
  ],
  triceps: [
    { nom: 'Dips lestés / Barre au front', sets: '4×8–10',  muscle: 'Triceps' },
    { nom: 'Pushdown poulie',              sets: '3×12–15', muscle: 'Triceps' },
  ],
  jambesQ: [
    { nom: 'Squat barre',                sets: '4×6–8',   muscle: 'Quadriceps / Fessiers' },
    { nom: 'Presse à cuisses',           sets: '3×10–12', muscle: 'Quadriceps' },
    { nom: 'Fentes marchées',            sets: '3×12/j',  muscle: 'Quadriceps / Fessiers' },
    { nom: 'Mollets debout',             sets: '4×15–20', muscle: 'Mollets' },
  ],
  jambesI: [
    { nom: 'Soulevé de terre roumain',   sets: '4×8–10',  muscle: 'Ischio / Fessiers' },
    { nom: 'Leg curl couché',            sets: '3×12–15', muscle: 'Ischio-jambiers' },
    { nom: 'Hip thrust barre',           sets: '3×12',    muscle: 'Fessiers' },
    { nom: 'Mollets assis',              sets: '4×15–20', muscle: 'Soléaire' },
  ],
  cardio: [
    { nom: 'Tapis de course — LISS',     sets: '30 min, 65% FC max',  muscle: '' },
    { nom: 'Vélo elliptique',            sets: '25 min, intensité modérée', muscle: '' },
    { nom: 'HIIT — Intervalles',         sets: '20 min (30s sprint / 90s repos)', muscle: '' },
    { nom: 'Corde à sauter',             sets: '4×3 min', muscle: '' },
  ],
};

// Full Body polyvalent
const fullBodyA = [EX.jambesQ[0], EX.pec[0], EX.dos[0], EX.epaules[0], EX.biceps[0], EX.triceps[0]];
const fullBodyB = [EX.jambesI[0], EX.pec[1], EX.dos[1], EX.epaules[1], EX.biceps[1], EX.triceps[1]];
const fullBodyC = [EX.jambesQ[1], EX.pec[2], EX.dos[2], EX.epaules[0], EX.biceps[0], EX.triceps[1]];
const fullBodyD = [EX.jambesI[2], EX.pec[3], EX.dos[3], EX.epaules[1], EX.biceps[1], EX.triceps[0]];

// Upper / Lower splits
const upperA = [EX.pec[0], EX.dos[0], EX.epaules[0], EX.dos[1], EX.biceps[0], EX.triceps[0]];
const upperB = [EX.pec[1], EX.dos[2], EX.epaules[1], EX.dos[3], EX.biceps[1], EX.triceps[1]];
const lowerA = [...EX.jambesQ];
const lowerB = [...EX.jambesI];

// Push / Pull / Legs
const push  = [...EX.pec.slice(0,3), EX.epaules[0], EX.epaules[1], EX.triceps[0], EX.triceps[1]];
const pull  = [...EX.dos, EX.biceps[0], EX.biceps[1]];
const legs  = [...EX.jambesQ.slice(0,2), ...EX.jambesI.slice(0,2), EX.jambesQ[3]];
const push2 = [EX.pec[3], EX.pec[1], EX.epaules[2], EX.epaules[3], EX.triceps[1]];
const pull2 = [EX.dos[1], EX.dos[2], EX.dos[3], EX.biceps[1]];
const legs2 = [EX.jambesI[0], EX.jambesQ[2], EX.jambesI[1], EX.jambesI[2], EX.jambesI[3]];

const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const REST  = (jour) => ({ jour, type: 'rest', label: 'Repos', exercices: [] });
const CARD  = (jour, ex) => ({ jour, type: 'cardio', label: 'Cardio', exercices: ex });
const TRAIN = (jour, label, exercices) => ({ jour, type: 'training', label, exercices });

// ── Programme generator ───────────────────────────
function buildProgramme(objectif, jours) {
  const D = JOURS;

  // ── PERTE ──────────────────────────────────────
  if (objectif === 'perte') {
    const programs = {
      2: [
        TRAIN(D[0], 'Full Body A', fullBodyA),
        REST(D[1]), REST(D[2]),
        TRAIN(D[3], 'Full Body B', fullBodyB),
        REST(D[4]),
        CARD(D[5], [EX.cardio[0]]),
        REST(D[6]),
      ],
      3: [
        TRAIN(D[0], 'Full Body A', fullBodyA),
        REST(D[1]),
        TRAIN(D[2], 'Full Body B', fullBodyB),
        REST(D[3]),
        TRAIN(D[4], 'Full Body C', fullBodyC),
        REST(D[5]), REST(D[6]),
      ],
      4: [
        TRAIN(D[0], 'Full Body A', fullBodyA),
        CARD(D[1], [EX.cardio[2], EX.cardio[3]]),
        REST(D[2]),
        TRAIN(D[3], 'Full Body B', fullBodyB),
        REST(D[4]),
        TRAIN(D[5], 'Full Body C', fullBodyC),
        REST(D[6]),
      ],
      5: [
        TRAIN(D[0], 'Full Body A', fullBodyA),
        CARD(D[1], [EX.cardio[0]]),
        TRAIN(D[2], 'Full Body B', fullBodyB),
        REST(D[3]),
        TRAIN(D[4], 'Full Body C', fullBodyC),
        CARD(D[5], [EX.cardio[1], EX.cardio[3]]),
        REST(D[6]),
      ],
      6: [
        TRAIN(D[0], 'Full Body A', fullBodyA),
        CARD(D[1], [EX.cardio[2]]),
        TRAIN(D[2], 'Full Body B', fullBodyB),
        CARD(D[3], [EX.cardio[0]]),
        TRAIN(D[4], 'Full Body C', fullBodyC),
        TRAIN(D[5], 'Full Body D', fullBodyD),
        REST(D[6]),
      ],
    };
    return programs[jours] ?? programs[3];
  }

  // ── MAINTIEN ───────────────────────────────────
  if (objectif === 'maintien') {
    const programs = {
      2: [
        TRAIN(D[0], 'Full Body A', fullBodyA),
        REST(D[1]), REST(D[2]),
        TRAIN(D[3], 'Full Body B', fullBodyB),
        REST(D[4]), REST(D[5]), REST(D[6]),
      ],
      3: [
        TRAIN(D[0], 'Full Body A', fullBodyA),
        REST(D[1]),
        TRAIN(D[2], 'Full Body B', fullBodyB),
        REST(D[3]),
        TRAIN(D[4], 'Full Body C', fullBodyC),
        REST(D[5]), REST(D[6]),
      ],
      4: [
        TRAIN(D[0], 'Upper A — Pec / Dos / Bras', upperA),
        TRAIN(D[1], 'Lower A — Quadriceps focus', lowerA),
        REST(D[2]),
        TRAIN(D[3], 'Upper B — Épaules / Dos / Bras', upperB),
        TRAIN(D[4], 'Lower B — Ischio / Fessiers', lowerB),
        REST(D[5]), REST(D[6]),
      ],
      5: [
        TRAIN(D[0], 'Push — Pec / Épaules / Triceps', push),
        TRAIN(D[1], 'Pull — Dos / Biceps', pull),
        TRAIN(D[2], 'Legs — Quadriceps / Ischio', legs),
        REST(D[3]),
        TRAIN(D[4], 'Push (variation)', push2),
        TRAIN(D[5], 'Pull (variation)', pull2),
        REST(D[6]),
      ],
      6: [
        TRAIN(D[0], 'Push — Pec / Épaules / Triceps', push),
        TRAIN(D[1], 'Pull — Dos / Biceps', pull),
        TRAIN(D[2], 'Legs — Quadriceps / Ischio', legs),
        REST(D[3]),
        TRAIN(D[4], 'Push (variation)', push2),
        TRAIN(D[5], 'Pull (variation)', pull2),
        TRAIN(D[6], 'Legs (variation)', legs2),
      ],
    };
    return programs[jours] ?? programs[4];
  }

  // ── MASSE ──────────────────────────────────────
  const programs = {
    2: [
      TRAIN(D[0], 'Full Body A — Lourd', fullBodyA),
      REST(D[1]), REST(D[2]),
      TRAIN(D[3], 'Full Body B — Lourd', fullBodyB),
      REST(D[4]), REST(D[5]), REST(D[6]),
    ],
    3: [
      TRAIN(D[0], 'Full Body A — Composés lourds', fullBodyA),
      REST(D[1]),
      TRAIN(D[2], 'Full Body B — Composés lourds', fullBodyB),
      REST(D[3]),
      TRAIN(D[4], 'Full Body C — Composés lourds', fullBodyC),
      REST(D[5]), REST(D[6]),
    ],
    4: [
      TRAIN(D[0], 'Upper A — Pec / Dos / Bras', upperA),
      TRAIN(D[1], 'Lower A — Quadriceps focus', lowerA),
      REST(D[2]),
      TRAIN(D[3], 'Upper B — Épaules / Dos / Bras', upperB),
      TRAIN(D[4], 'Lower B — Ischio / Fessiers', lowerB),
      REST(D[5]), REST(D[6]),
    ],
    5: [
      TRAIN(D[0], 'Push — Pec / Épaules / Triceps', push),
      TRAIN(D[1], 'Pull — Dos / Biceps', pull),
      TRAIN(D[2], 'Legs — Quadriceps / Ischio', legs),
      REST(D[3]),
      TRAIN(D[4], 'Push (variation)', push2),
      TRAIN(D[5], 'Pull (variation)', pull2),
      REST(D[6]),
    ],
    6: [
      TRAIN(D[0], 'Push — Pec / Épaules / Triceps', push),
      TRAIN(D[1], 'Pull — Dos / Biceps', pull),
      TRAIN(D[2], 'Legs — Quadriceps / Ischio', legs),
      REST(D[3]),
      TRAIN(D[4], 'Push (variation)', push2),
      TRAIN(D[5], 'Pull (variation)', pull2),
      TRAIN(D[6], 'Legs (variation)', legs2),
    ],
  };
  return programs[jours] ?? programs[5];
}

// ── Conseils ──────────────────────────────────────
function getConseils(objectif, poids, proteines, jours) {
  const eau = Math.round(poids * 0.035);
  const base = [
    { icon: '💧', text: `Bois au minimum ${eau} L d'eau par jour. L'hydratation est essentielle pour la performance et la récupération.` },
    { icon: '😴', text: 'Dors 7–9 heures par nuit. Le muscle se construit pendant le sommeil, pas pendant l\'entraînement.' },
    { icon: '🥩', text: `Vise ${proteines} g de protéines par jour. Répartis-les en ${Math.min(jours + 1, 5)} repas : poulet, œufs, fromage blanc, poisson, légumineuses.` },
    { icon: '📈', text: 'Surcharge progressive : augmente le poids ou les reps chaque semaine. Sans ça, pas de progression.' },
  ];
  const specific = {
    perte: [
      { icon: '⏰', text: 'Un déficit de 500 kcal/j suffit — inutile de souffrir. La constance prime sur l\'intensité.' },
      { icon: '🥗', text: 'Privilégie les aliments à fort volume et faible densité calorique : légumes, blancs d\'œufs, yaourt grec 0%.' },
    ],
    masse: [
      { icon: '⏰', text: 'Mange 4–6 repas par jour pour maintenir un apport constant en acides aminés.' },
      { icon: '🥜', text: 'Si tu as du mal à atteindre tes calories : lait, shakers protéinés, beurre de cacahuète, noix.' },
    ],
    maintien: [
      { icon: '⏰', text: 'La recomposition demande de la patience. Maintiens ton poids stable 8–12 semaines avant d\'ajuster.' },
      { icon: '🔄', text: 'Effectue un déload (semaine légère à 60% des charges) toutes les 6–8 semaines.' },
    ],
  };
  return [...base, ...(specific[objectif] ?? [])];
}

// ── Render Results ────────────────────────────────
function renderResults() {
  const { genre, age, taille, poids, activite, objectif, jours } = state;

  const bmr    = calcBMR(genre, poids, taille, age);
  const tdee   = calcTDEE(bmr, activite);
  const cibles = calcTargetCalories(tdee, objectif);
  const macros = calcMacros(cibles, poids, objectif);

  const objLabels = { perte: 'Perte de poids', maintien: 'Maintien / Recomposition', masse: 'Prise de masse' };
  const actLabels = { 1.2: 'Sédentaire', 1.375: 'Légèrement actif', 1.55: 'Modérément actif', 1.725: 'Très actif', 1.9: 'Extrêmement actif' };

  // ── Recap
  document.getElementById('profile-recap').innerHTML = `
    <div class="recap-item"><strong>${genre === 'male' ? 'Homme' : 'Femme'}</strong></div>
    <div class="recap-item">${age} ans · <strong>${taille} cm</strong> · <strong>${poids} kg</strong></div>
    <div class="recap-item">${actLabels[activite] ?? ''}</div>
    <div class="recap-item"><strong style="color:#f97316">${jours} jours/sem.</strong></div>
    <div class="recap-item" style="margin-left:auto;color:#f97316;font-weight:700">${objLabels[objectif]}</div>
  `;

  // ── Calories
  const calDiff   = objectif === 'perte' ? '−500 kcal vs entretien' : objectif === 'masse' ? '+300 kcal vs entretien' : '= entretien';
  const macroTotal = macros.proteines * 4 + macros.lipides * 9 + macros.glucides * 4;
  const pPct = Math.round(macros.proteines * 4 / macroTotal * 100);
  const lPct = Math.round(macros.lipides * 9 / macroTotal * 100);
  const gPct = 100 - pPct - lPct;

  document.getElementById('calories-section').innerHTML = `
    <div class="calories-grid">
      <div class="calorie-stat">
        <div class="value">${Math.round(bmr)}</div>
        <div class="unit">kcal/j</div>
        <div class="label">Métabolisme de base</div>
      </div>
      <div class="calorie-stat">
        <div class="value">${tdee}</div>
        <div class="unit">kcal/j</div>
        <div class="label">Dépense totale (TDEE)</div>
      </div>
      <div class="calorie-stat" style="border:2px solid #f97316">
        <div class="value">${cibles}</div>
        <div class="unit">kcal/j</div>
        <div class="label">Objectif calorique</div>
      </div>
      <div class="calorie-stat">
        <div class="value" style="font-size:13px;color:#9ca3af;margin-top:6px">${calDiff}</div>
        <div class="label" style="margin-top:8px">Ajustement</div>
      </div>
    </div>
    <h3 style="font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px">Répartition des macronutriments</h3>
    <div class="macro-bars">
      <div class="macro-row">
        <div class="macro-label">🥩 Protéines</div>
        <div class="macro-bar-bg"><div class="macro-bar-fill" style="width:0%;background:#f97316" data-width="${pPct}"></div></div>
        <div class="macro-value">${macros.proteines} g <span style="color:#6b7280;font-weight:400">(${pPct}%)</span></div>
      </div>
      <div class="macro-row">
        <div class="macro-label">🫒 Lipides</div>
        <div class="macro-bar-bg"><div class="macro-bar-fill" style="width:0%;background:#a78bfa" data-width="${lPct}"></div></div>
        <div class="macro-value">${macros.lipides} g <span style="color:#6b7280;font-weight:400">(${lPct}%)</span></div>
      </div>
      <div class="macro-row">
        <div class="macro-label">🍚 Glucides</div>
        <div class="macro-bar-bg"><div class="macro-bar-fill" style="width:0%;background:#34d399" data-width="${gPct}"></div></div>
        <div class="macro-value">${macros.glucides} g <span style="color:#6b7280;font-weight:400">(${gPct}%)</span></div>
      </div>
    </div>
  `;

  // ── Programme
  const programme = buildProgramme(objectif, jours);
  const splitNames = {
    perte:    { 2: 'Full Body 2×', 3: 'Full Body 3×', 4: 'Full Body 3× + Cardio', 5: 'Full Body 3× + Cardio 2×', 6: 'Full Body 4× + Cardio 2×' },
    maintien: { 2: 'Full Body 2×', 3: 'Full Body 3×', 4: 'Upper / Lower 4×', 5: 'Push / Pull / Legs 5×', 6: 'Push / Pull / Legs 6×' },
    masse:    { 2: 'Full Body 2× lourd', 3: 'Full Body 3× lourd', 4: 'Upper / Lower 4×', 5: 'Push / Pull / Legs 5×', 6: 'Push / Pull / Legs 6×' },
  };

  const progHTML = programme.map(day => {
    if (day.type === 'rest' && day.exercices.length === 0) {
      return `
        <div class="day-card rest-day">
          <div class="day-header" style="background:#111827">
            <span class="day-name">${day.jour}</span>
            <span class="day-type rest">Repos</span>
          </div>
          <div class="exercise-list" style="padding:12px 16px;color:#6b7280;font-size:13px">
            Récupération — étirements, marche légère
          </div>
        </div>`;
    }

    const headerBg = day.type === 'cardio' ? 'background:rgba(20,184,166,0.08)'
                   : day.type === 'rest'    ? 'background:#111827'
                                            : 'background:rgba(249,115,22,0.08)';

    const exHTML = day.exercices.map(ex => `
      <div class="exercise-item">
        <div style="flex:1;min-width:0">
          <div class="exercise-name">${ex.nom}</div>
          ${ex.muscle ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${ex.muscle}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <span class="exercise-sets">${ex.sets}</span>
          <button class="demo-btn" onclick="openDemo('${ex.nom.replace(/'/g, "\\'")}')" title="Voir une démonstration">▶</button>
        </div>
      </div>`).join('');

    return `
      <div class="day-card">
        <div class="day-header" style="${headerBg}">
          <span class="day-name">${day.jour}</span>
          <span class="day-type ${day.type}">${day.label}</span>
        </div>
        <div class="exercise-list">${exHTML}</div>
      </div>`;
  }).join('');

  document.getElementById('programme-section').innerHTML = `
    <div class="split-badge">${splitNames[objectif]?.[jours] ?? ''}</div>
    <div class="week-grid">${progHTML}</div>
  `;

  // ── Conseils
  const conseils = getConseils(objectif, poids, macros.proteines, jours);
  document.getElementById('conseils-section').innerHTML = conseils.map(c => `
    <div class="conseil-item">
      <span class="conseil-icon">${c.icon}</span>
      <span>${c.text}</span>
    </div>`).join('');

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll('.macro-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width + '%';
    });
  }, 120);
}

// ── Modal démonstration ───────────────────────────

// Traduction exercice → terme de recherche anglais pour wger.de
const EXERCISE_EN = {
  'Développé couché barre':       'bench press',
  'Développé incliné haltères':   'incline dumbbell press',
  'Écarté poulie basse':          'cable fly',
  'Pompes lestées':               'push up',
  'Tractions / Lat pulldown':     'lat pulldown',
  'Rowing barre':                 'barbell row',
  'Rowing haltère 1 bras':        'dumbbell row',
  'Face pull poulie':             'face pull',
  'Développé militaire barre':    'overhead press',
  'Élévations latérales':         'lateral raise',
  'Élévations frontales':         'front raise',
  'Oiseau poulie':                'rear delt fly',
  'Curl barre EZ':                'barbell curl',
  'Curl haltères marteau':        'hammer curl',
  'Dips lestés / Barre au front': 'triceps dip',
  'Pushdown poulie':              'triceps pushdown',
  'Squat barre':                  'barbell squat',
  'Presse à cuisses':             'leg press',
  'Soulevé de terre roumain':     'romanian deadlift',
  'Fentes marchées':              'walking lunge',
  'Leg curl couché':              'leg curl',
  'Mollets debout':               'standing calf raise',
  'Hip thrust barre':             'hip thrust',
  'Mollets assis':                'seated calf raise',
  'Tapis de course — LISS':       'running',
  'Vélo elliptique':              'elliptical',
  'HIIT — Intervalles':           'sprint',
  'Corde à sauter':               'jump rope',
};

async function openDemo(nom) {
  const modal   = document.getElementById('demo-modal');
  const title   = document.getElementById('modal-title');
  const body    = document.getElementById('modal-body');
  const ytLink  = document.getElementById('modal-yt-link');

  title.textContent = nom;
  body.innerHTML = `
    <div class="modal-loading">
      <div class="spinner"></div>
      <p>Recherche du tutoriel…</p>
    </div>`;

  const ytQuery = encodeURIComponent(`comment faire ${nom} musculation tutoriel`);
  ytLink.href = `https://www.youtube.com/results?search_query=${ytQuery}`;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const searchTerm = EXERCISE_EN[nom] ?? nom;

  try {
    const res  = await fetch(`https://wger.de/api/v2/exercise/search/?term=${encodeURIComponent(searchTerm)}&language=english&format=json`);
    const data = await res.json();

    if (data.suggestions?.length > 0) {
      const baseId  = data.suggestions[0].data.base_id;
      const imgRes  = await fetch(`https://wger.de/api/v2/exerciseimage/?exercise_base_id=${baseId}&format=json`);
      const imgData = await imgRes.json();

      if (imgData.results?.length > 0) {
        body.innerHTML = `
          <div class="modal-images">
            ${imgData.results.map(img => `<img src="${img.image}" alt="${nom}" loading="lazy" />`).join('')}
          </div>
          <p class="modal-source">Images : wger.de (licence libre)</p>`;
        return;
      }
    }
    showModalFallback(body, nom);
  } catch {
    showModalFallback(body, nom);
  }
}

function showModalFallback(body, nom) {
  body.innerHTML = `
    <div class="modal-fallback">
      <div style="font-size:52px;margin-bottom:12px">🏋️</div>
      <p>Aucune image disponible pour cet exercice.</p>
      <p style="color:#6b7280;font-size:13px;margin-top:6px">Utilise le bouton YouTube ci-dessous pour voir un tutoriel vidéo.</p>
    </div>`;
}

function closeModal() {
  document.getElementById('demo-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Utils ─────────────────────────────────────────
function printPage() { window.print(); }

function copyToClipboard() {
  const { genre, age, taille, poids, objectif, jours } = state;
  if (!objectif) return;

  const bmr    = calcBMR(genre, poids, taille, age);
  const tdee   = calcTDEE(bmr, state.activite);
  const cibles = calcTargetCalories(tdee, objectif);
  const macros = calcMacros(cibles, poids, objectif);
  const labels = { perte: 'Perte de poids', maintien: 'Maintien', masse: 'Prise de masse' };

  const text = `🏋️ FitPlan — Mon Programme Personnalisé
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 ${genre === 'male' ? 'Homme' : 'Femme'}, ${age} ans, ${taille} cm, ${poids} kg
🎯 ${labels[objectif]} — ${jours} jours/semaine

🍽️ NUTRITION
• Calories : ${cibles} kcal/j
• Protéines : ${macros.proteines} g
• Lipides : ${macros.lipides} g
• Glucides : ${macros.glucides} g

Créé avec FitPlan`;

  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('toast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  });
}
