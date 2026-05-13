/* =============================================
   FitPlan — Application Logic
   ============================================= */

// ── State ────────────────────────────────────────
const state = {
  genre: 'male',
  age: null,
  taille: null,
  poids: null,
  activite: 1.55,
  objectif: null,
};

// ── Genre toggle ─────────────────────────────────
document.querySelectorAll('.genre-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.genre = btn.dataset.value;
    document.getElementById('genre').value = state.genre;
  });
});

// ── Objectif selection ───────────────────────────
function selectObjectif(card) {
  document.querySelectorAll('.objectif-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  state.objectif = card.dataset.value;
}

// ── Navigation ───────────────────────────────────
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
    const line = document.getElementById(`line-${n}`);
    line.classList.toggle('done', n < current);
  });
}

function goToStep2() {
  const age = parseFloat(document.getElementById('age').value);
  const taille = parseFloat(document.getElementById('taille').value);
  const poids = parseFloat(document.getElementById('poids').value);
  const err = document.getElementById('step1-error');

  if (!age || age < 15 || age > 80) return showError(err, 'Veuillez entrer un âge valide (15–80 ans).');
  if (!taille || taille < 140 || taille > 220) return showError(err, 'Veuillez entrer une taille valide (140–220 cm).');
  if (!poids || poids < 40 || poids > 200) return showError(err, 'Veuillez entrer un poids valide (40–200 kg).');

  err.classList.add('hidden');
  state.age = age;
  state.taille = taille;
  state.poids = poids;
  state.activite = parseFloat(document.getElementById('activite').value);

  goToStep(2);
}

function goToResults() {
  if (!state.objectif) {
    const err = document.getElementById('step2-error');
    return showError(err, 'Veuillez sélectionner un objectif.');
  }
  renderResults();
  goToStep(3);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Calculations ─────────────────────────────────

function calcBMR(genre, poids, taille, age) {
  // Mifflin-St Jeor
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
  let protRatio, lipRatio;
  if (objectif === 'perte')   { protRatio = 2.2; lipRatio = 0.25; }
  else if (objectif === 'masse') { protRatio = 2.0; lipRatio = 0.28; }
  else                        { protRatio = 1.8; lipRatio = 0.27; }

  const proteines = Math.round(poids * protRatio);
  const lipides = Math.round((calories * lipRatio) / 9);
  const glucides = Math.round((calories - (proteines * 4) - (lipides * 9)) / 4);

  return { proteines, lipides, glucides };
}

// ── Exercise database ─────────────────────────────

const EXERCICES = {
  // Poitrine
  pec: [
    { nom: 'Développé couché barre',       sets: '4×8–10', muscle: 'Pectoraux' },
    { nom: 'Développé incliné haltères',   sets: '3×10–12', muscle: 'Pectoraux haut' },
    { nom: 'Écarté poulie basse',          sets: '3×12–15', muscle: 'Pectoraux' },
    { nom: 'Pompes lestées',               sets: '3×max', muscle: 'Pectoraux' },
  ],
  // Dos
  dos: [
    { nom: 'Tractions / Lat pulldown',     sets: '4×8–10', muscle: 'Grand dorsal' },
    { nom: 'Rowing barre',                 sets: '4×8–10', muscle: 'Dos épais' },
    { nom: 'Rowing haltère 1 bras',        sets: '3×10–12', muscle: 'Grand dorsal' },
    { nom: 'Face pull poulie',             sets: '3×15', muscle: 'Trapèzes / Rotateurs' },
  ],
  // Épaules
  epaules: [
    { nom: 'Développé militaire barre',    sets: '4×8–10', muscle: 'Épaules' },
    { nom: 'Élévations latérales',         sets: '4×12–15', muscle: 'Deltoïdes lat.' },
    { nom: 'Élévations frontales',         sets: '3×12', muscle: 'Deltoïdes ant.' },
    { nom: 'Oiseau poulie',               sets: '3×15', muscle: 'Deltoïdes post.' },
  ],
  // Bras
  bras: [
    { nom: 'Curl barre EZ',               sets: '3×10–12', muscle: 'Biceps' },
    { nom: 'Curl haltères marteau',        sets: '3×12', muscle: 'Brachial / Biceps' },
    { nom: 'Dips / Barre au front',        sets: '4×10–12', muscle: 'Triceps' },
    { nom: 'Pushdown poulie',             sets: '3×12–15', muscle: 'Triceps' },
  ],
  // Jambes
  jambes: [
    { nom: 'Squat barre',                 sets: '4×6–8', muscle: 'Quadriceps / Fessiers' },
    { nom: 'Presse à cuisses',            sets: '3×10–12', muscle: 'Quadriceps' },
    { nom: 'Soulevé de terre roumain',    sets: '3×10', muscle: 'Ischio-jambiers' },
    { nom: 'Fentes marchées',            sets: '3×12 (chaque jambe)', muscle: 'Quadriceps / Fessiers' },
    { nom: 'Leg curl couché',             sets: '3×12–15', muscle: 'Ischio-jambiers' },
    { nom: 'Mollets debout',              sets: '4×15–20', muscle: 'Mollets' },
  ],
  // Full body
  fullbody: [
    { nom: 'Squat barre',                 sets: '3×8', muscle: 'Jambes / Dos' },
    { nom: 'Développé couché barre',       sets: '3×8–10', muscle: 'Pectoraux' },
    { nom: 'Tractions / Lat pulldown',    sets: '3×8–10', muscle: 'Grand dorsal' },
    { nom: 'Développé militaire',         sets: '3×8–10', muscle: 'Épaules' },
    { nom: 'Soulevé de terre roumain',    sets: '3×10', muscle: 'Ischio / Fessiers' },
    { nom: 'Curl barre + Dips',           sets: '3×10–12', muscle: 'Biceps / Triceps' },
  ],
  // Cardio
  cardio: [
    { nom: 'Tapis de course — LISS',      sets: '25–30 min, 65% FC max', muscle: '' },
    { nom: 'Vélo elliptique',             sets: '20–25 min, intensité modérée', muscle: '' },
    { nom: 'HIIT — Intervalles',          sets: '20 min (30s sprint / 90s repos)', muscle: '' },
    { nom: 'Corde à sauter',              sets: '3×3 min', muscle: '' },
  ],
};

// ── Programme generator ───────────────────────────

function buildProgramme(objectif) {
  if (objectif === 'perte') {
    return [
      { jour: 'Lundi',    type: 'training', label: 'Full Body A',   exercices: EXERCICES.fullbody },
      { jour: 'Mardi',    type: 'cardio',   label: 'Cardio',         exercices: [EXERCICES.cardio[0], EXERCICES.cardio[2]] },
      { jour: 'Mercredi', type: 'rest',     label: 'Repos actif',    exercices: [{ nom: 'Marche 30 min / étirements', sets: '', muscle: '' }] },
      { jour: 'Jeudi',    type: 'training', label: 'Full Body B',    exercices: EXERCICES.fullbody },
      { jour: 'Vendredi', type: 'cardio',   label: 'Cardio',         exercices: [EXERCICES.cardio[1], EXERCICES.cardio[3]] },
      { jour: 'Samedi',   type: 'training', label: 'Full Body C',    exercices: EXERCICES.fullbody },
      { jour: 'Dimanche', type: 'rest',     label: 'Repos complet',  exercices: [] },
    ];
  }

  if (objectif === 'maintien') {
    return [
      { jour: 'Lundi',    type: 'training', label: 'Push (Pec / Épaules / Triceps)', exercices: [...EXERCICES.pec.slice(0,2), ...EXERCICES.epaules.slice(0,2), ...EXERCICES.bras.slice(2,4)] },
      { jour: 'Mardi',    type: 'training', label: 'Pull (Dos / Biceps)',             exercices: [...EXERCICES.dos.slice(0,3), ...EXERCICES.bras.slice(0,2)] },
      { jour: 'Mercredi', type: 'training', label: 'Legs (Jambes / Fessiers)',        exercices: EXERCICES.jambes },
      { jour: 'Jeudi',    type: 'rest',     label: 'Repos',                           exercices: [] },
      { jour: 'Vendredi', type: 'training', label: 'Push (Pec / Épaules / Triceps)', exercices: [...EXERCICES.pec.slice(2,4), ...EXERCICES.epaules.slice(2,4), EXERCICES.bras[3]] },
      { jour: 'Samedi',   type: 'training', label: 'Pull (Dos / Biceps)',             exercices: [...EXERCICES.dos, EXERCICES.bras[1]] },
      { jour: 'Dimanche', type: 'rest',     label: 'Repos',                           exercices: [] },
    ];
  }

  // Masse — PPL 6j
  return [
    { jour: 'Lundi',    type: 'training', label: 'Push — Pec / Épaules / Triceps',  exercices: [...EXERCICES.pec, EXERCICES.epaules[0], EXERCICES.epaules[1], EXERCICES.bras[2], EXERCICES.bras[3]] },
    { jour: 'Mardi',    type: 'training', label: 'Pull — Dos / Biceps / Épaules',   exercices: [...EXERCICES.dos, ...EXERCICES.bras.slice(0,2), EXERCICES.epaules[3]] },
    { jour: 'Mercredi', type: 'training', label: 'Legs — Quadriceps / Ischios',     exercices: EXERCICES.jambes },
    { jour: 'Jeudi',    type: 'training', label: 'Push (variation)',                 exercices: [EXERCICES.pec[1], EXERCICES.pec[2], EXERCICES.epaules[2], EXERCICES.epaules[3], EXERCICES.bras[2]] },
    { jour: 'Vendredi', type: 'training', label: 'Pull (variation)',                 exercices: [EXERCICES.dos[1], EXERCICES.dos[2], EXERCICES.dos[3], EXERCICES.bras[0], EXERCICES.bras[1]] },
    { jour: 'Samedi',   type: 'training', label: 'Legs — Fessiers / Mollets',       exercices: [EXERCICES.jambes[0], EXERCICES.jambes[3], EXERCICES.jambes[4], EXERCICES.jambes[5]] },
    { jour: 'Dimanche', type: 'rest',     label: 'Repos / Récupération',            exercices: [] },
  ];
}

// ── Conseils generator ───────────────────────────

function getConseils(objectif, poids, proteines) {
  const base = [
    { icon: '💧', text: `Bois au minimum ${Math.round(poids * 0.035)} L d'eau par jour. L'hydratation est essentielle pour la performance et la récupération.` },
    { icon: '😴', text: 'Dors 7–9 heures par nuit. Le muscle se construit pendant le sommeil, pas pendant l\'entraînement.' },
    { icon: '🥩', text: `Vise ${proteines} g de protéines par jour (${Math.round(proteines / 3)} g par repas environ). Privilégie : poulet, œufs, fromage blanc, poisson, légumineuses.` },
    { icon: '📈', text: 'Applique la surcharge progressive : augmente le poids ou les répétitions chaque semaine pour continuer à progresser.' },
  ];

  if (objectif === 'perte') {
    return [
      ...base,
      { icon: '⏰', text: 'Ne saute pas de repas. Un déficit de 500 kcal/j suffit — inutile de souffrir. La constance prime sur l\'intensité.' },
      { icon: '🥗', text: 'Privilégie les aliments à fort volume et faible densité calorique : légumes, blancs d\'œufs, yaourt grec 0%.' },
    ];
  }
  if (objectif === 'masse') {
    return [
      ...base,
      { icon: '⏰', text: 'Mange 4–6 repas par jour pour maintenir un apport constant en acides aminés et soutenir la synthèse protéique.' },
      { icon: '🥜', text: 'Si tu as du mal à atteindre tes calories, ajoute des calories liquides : lait, shakers protéinés, beurre de cacahuète.' },
    ];
  }
  return [
    ...base,
    { icon: '⏰', text: 'La recomposition demande de la patience. Maintiens ton poids stable pendant 8–12 semaines avant d\'ajuster.' },
    { icon: '🔄', text: 'Effectue un déload (semaine légère) toutes les 6–8 semaines pour optimiser la récupération.' },
  ];
}

// ── Render Results ────────────────────────────────

function renderResults() {
  const { genre, age, taille, poids, activite, objectif } = state;

  // Calculations
  const bmr    = calcBMR(genre, poids, taille, age);
  const tdee   = calcTDEE(bmr, activite);
  const cibles = calcTargetCalories(tdee, objectif);
  const macros = calcMacros(cibles, poids, objectif);

  // Labels
  const objectifLabels = { perte: 'Perte de poids', maintien: 'Maintien / Recomposition', masse: 'Prise de masse' };
  const actLabels = { 1.2: 'Sédentaire', 1.375: 'Légèrement actif', 1.55: 'Modérément actif', 1.725: 'Très actif', 1.9: 'Extrêmement actif' };
  const genreLabel = genre === 'male' ? 'Homme' : 'Femme';

  // ── Recap bar
  document.getElementById('profile-recap').innerHTML = `
    <div class="recap-item"><strong>${genreLabel}</strong></div>
    <div class="recap-item">${age} ans · <strong>${taille} cm</strong> · <strong>${poids} kg</strong></div>
    <div class="recap-item">${actLabels[activite] || ''}</div>
    <div class="recap-item" style="margin-left:auto; color:#f97316; font-weight:700;">${objectifLabels[objectif]}</div>
  `;

  // ── Calories section
  const calDiff = objectif === 'perte' ? '−500 kcal vs entretien' : objectif === 'masse' ? '+300 kcal vs entretien' : '= entretien';
  const macroTotal = macros.proteines * 4 + macros.lipides * 9 + macros.glucides * 4;
  const pPct = Math.round(macros.proteines * 4 / macroTotal * 100);
  const lPct = Math.round(macros.lipides * 9 / macroTotal * 100);
  const gPct = 100 - pPct - lPct;

  document.getElementById('calories-section').innerHTML = `
    <div class="calories-grid">
      <div class="calorie-stat">
        <div class="value">${Math.round(bmr)}</div>
        <div class="unit">kcal/j</div>
        <div class="label">Métabolisme de base (BMR)</div>
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
        <div class="value" style="font-size:14px;color:#9ca3af;margin-top:4px">${calDiff}</div>
        <div class="label" style="margin-top:8px">Ajustement</div>
      </div>
    </div>

    <h3 style="font-size:14px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px">Répartition des macronutriments</h3>
    <div class="macro-bars">
      <div class="macro-row">
        <div class="macro-label">🥩 Protéines</div>
        <div class="macro-bar-bg"><div class="macro-bar-fill" style="width:${pPct}%;background:#f97316"></div></div>
        <div class="macro-value">${macros.proteines} g <span style="color:#6b7280;font-weight:400">(${pPct}%)</span></div>
      </div>
      <div class="macro-row">
        <div class="macro-label">🫒 Lipides</div>
        <div class="macro-bar-bg"><div class="macro-bar-fill" style="width:${lPct}%;background:#a78bfa"></div></div>
        <div class="macro-value">${macros.lipides} g <span style="color:#6b7280;font-weight:400">(${lPct}%)</span></div>
      </div>
      <div class="macro-row">
        <div class="macro-label">🍚 Glucides</div>
        <div class="macro-bar-bg"><div class="macro-bar-fill" style="width:${gPct}%;background:#34d399"></div></div>
        <div class="macro-value">${macros.glucides} g <span style="color:#6b7280;font-weight:400">(${gPct}%)</span></div>
      </div>
    </div>
  `;

  // ── Programme section
  const programme = buildProgramme(objectif);
  const progHTML = programme.map(day => {
    if (day.type === 'rest' && day.exercices.length === 0) {
      return `
        <div class="day-card rest-day">
          <div class="day-header" style="background:#111827">
            <span class="day-name">${day.jour}</span>
            <span class="day-type rest">${day.label}</span>
          </div>
          <div class="exercise-list" style="padding:12px 16px;color:#6b7280;font-size:13px">
            Récupération — étirements, marche légère
          </div>
        </div>`;
    }

    const headerBg = day.type === 'cardio' ? 'background:rgba(20,184,166,0.08)' :
                     day.type === 'rest'    ? 'background:#111827' :
                                             'background:rgba(249,115,22,0.08)';
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
    <p style="color:#9ca3af;font-size:13px;margin-bottom:16px">
      ${objectif === 'perte' ? '3 séances Full Body + 2 sessions cardio — idéal pour brûler les graisses.' :
        objectif === 'masse' ? '6 séances Push / Pull / Legs — volume élevé pour maximiser l\'hypertrophie.' :
        '5 séances Push / Pull / Legs — équilibre parfait entre volume et récupération.'}
    </p>
    <div class="week-grid">${progHTML}</div>
  `;

  // ── Conseils
  const conseils = getConseils(objectif, poids, macros.proteines);
  document.getElementById('conseils-section').innerHTML = conseils.map(c => `
    <div class="conseil-item">
      <span class="conseil-icon">${c.icon}</span>
      <span>${c.text}</span>
    </div>`).join('');

  // Animate bars after render
  setTimeout(() => {
    document.querySelectorAll('.macro-bar-fill').forEach(bar => {
      const w = bar.style.width;
      bar.style.width = '0';
      requestAnimationFrame(() => { bar.style.width = w; });
    });
  }, 100);
}

// ── Demo YouTube ─────────────────────────────────

function openDemo(nom) {
  const query = encodeURIComponent(`comment faire ${nom} musculation tutoriel`);
  window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
}

// ── Utils ─────────────────────────────────────────

function printPage() {
  window.print();
}

function copyToClipboard() {
  const { genre, age, taille, poids, activite, objectif } = state;
  if (!objectif) return;

  const bmr    = calcBMR(genre, poids, taille, age);
  const tdee   = calcTDEE(bmr, activite);
  const cibles = calcTargetCalories(tdee, objectif);
  const macros = calcMacros(cibles, poids, objectif);

  const labels = { perte: 'Perte de poids', maintien: 'Maintien', masse: 'Prise de masse' };
  const text = `🏋️ FitPlan — Mon Programme Personnalisé
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Profil : ${genre === 'male' ? 'Homme' : 'Femme'}, ${age} ans, ${taille} cm, ${poids} kg
🎯 Objectif : ${labels[objectif]}

🍽️ NUTRITION
• Calories cibles : ${cibles} kcal/j
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
