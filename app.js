/* =============================================
   FitPlan — Core Logic
   ============================================= */

// ── State ─────────────────────────────────────────
const state = {
  prenom: null, nom: null,
  niveau: 'debutant',                // 'debutant' | 'intermediaire' | 'avance'
  genre: 'male',
  age: null, taille: null, poids: null,
  activite: 1.55,
  objectif: null,
  jours: 4,
  exerciseSwaps: {},                 // { 'Nom exo original': {nom, sets, muscle} }
  daySwaps: [0, 1, 2, 3, 4, 5, 6],   // permutation des jours : slot i affiche le prog de daySwaps[i]
  customExercises: [],               // [{nom, sets, muscle}] — exercices créés par l'utilisateur
  customProgramme: null,             // null = auto, sinon array de 7 jours {type, label, exercices[]}
};

// ═══ Thème (clair / sombre) ════════════════════════
function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  try { localStorage.setItem('fitplan-theme', theme); } catch {}
  // Refresh des boutons toggle dans l'UI s'ils existent
  document.querySelectorAll('.theme-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}
function loadTheme() {
  try {
    const saved = localStorage.getItem('fitplan-theme');
    if (saved === 'light') document.body.classList.add('theme-light');
    // Synchronise les boutons toggle quand le DOM sera prêt
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.theme-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === (saved || 'dark'));
      });
    });
  } catch {}
}
loadTheme(); // applique immédiatement au chargement

// ═══ PWA — enregistrement du service worker ═══════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('[FitPlan] SW enregistré, scope:', reg.scope))
      .catch(err => console.warn('[FitPlan] SW échec:', err));
  });
}

// Affiche un toast lors de l'événement "appinstalled"
window.addEventListener('appinstalled', () => {
  if (typeof showToast === 'function') showToast('✓ FitPlan installé !');
});

// ═══ Rest timer ═════════════════════════════════════
let _restTimer = { interval: null, remaining: 0, total: 0, paused: false };

function getRestTime(ex) {
  if (!ex?.muscle) return 30; // cardio
  const heavyCompounds = [
    'Squat barre','Hack squat',
    'Soulevé de terre roumain','Soulevé de terre conventionnel','Good morning',
    'Développé couché barre','Développé décliné barre',
    'Développé militaire barre','Développé haltères assis',
    'Rowing barre','Rowing T-bar',
    'Hip thrust barre','Glute bridge barre',
  ];
  if (heavyCompounds.includes(ex.nom)) return 180;
  const reps = parseInt(ex.sets?.match(/×\s*(\d+)/)?.[1]) || 10;
  if (reps <= 6)  return 150;
  if (reps <= 8)  return 120;
  if (reps >= 15) return 60;
  return 90;
}

function startRestTimer(seconds) {
  if (_restTimer.interval) clearInterval(_restTimer.interval);
  _restTimer.total = seconds;
  _restTimer.remaining = seconds;
  _restTimer.paused = false;
  const w = document.getElementById('rest-timer');
  w.classList.remove('hidden', 'finished');
  document.getElementById('rest-timer-toggle').textContent = '⏸';
  updateRestTimerDisplay();
  _restTimer.interval = setInterval(tickRestTimer, 1000);
}
function tickRestTimer() {
  if (_restTimer.paused) return;
  _restTimer.remaining--;
  updateRestTimerDisplay();
  if (_restTimer.remaining <= 0) {
    clearInterval(_restTimer.interval);
    _restTimer.interval = null;
    document.getElementById('rest-timer').classList.add('finished');
    playBeep();
    if (navigator.vibrate) try { navigator.vibrate([200, 100, 200, 100, 400]); } catch {}
    // auto-hide après 6s
    setTimeout(() => {
      const w = document.getElementById('rest-timer');
      if (w?.classList.contains('finished')) restTimerStop();
    }, 6000);
  }
}
function updateRestTimerDisplay() {
  const r = Math.max(0, _restTimer.remaining);
  const m = Math.floor(r / 60), s = r % 60;
  const display = document.getElementById('rest-timer-display');
  if (display) display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const bar = document.getElementById('rest-timer-bar');
  if (bar) bar.style.width = Math.max(0, (r / _restTimer.total) * 100) + '%';
}
function restTimerAdjust(deltaSec) {
  _restTimer.remaining = Math.max(5, _restTimer.remaining + deltaSec);
  _restTimer.total = Math.max(_restTimer.total, _restTimer.remaining);
  document.getElementById('rest-timer').classList.remove('finished');
  if (!_restTimer.interval) _restTimer.interval = setInterval(tickRestTimer, 1000);
  updateRestTimerDisplay();
}
function restTimerToggle() {
  _restTimer.paused = !_restTimer.paused;
  document.getElementById('rest-timer-toggle').textContent = _restTimer.paused ? '▶' : '⏸';
}
function restTimerStop() {
  if (_restTimer.interval) clearInterval(_restTimer.interval);
  _restTimer.interval = null;
  _restTimer.paused = false;
  document.getElementById('rest-timer').classList.add('hidden');
  document.getElementById('rest-timer').classList.remove('finished');
}
function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1100, 880].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.2;
      o.start(t0);
      g.gain.setValueAtTime(0.3, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      o.stop(t0 + 0.2);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

// ═══ Records personnels (PR) ═══════════════════════
// Brzycki 1RM = w / (1.0278 − 0.0278 × r)
function calcEst1RM(weight, reps) {
  if (!weight || !reps) return 0;
  const r = Math.min(reps, 12);
  return weight / (1.0278 - 0.0278 * r);
}
let _personalRecords = {};   // { 'Exo': {maxWeight, maxReps, maxVolume, est1RM, date} }
let _prOverrides    = {};    // overrides manuels (localStorage)

// ═══ SVG line chart générique ══════════════════════
// points: [{x: number, y: number}]  (ex: timestamps / valeurs)
function renderLineChart(points, opts = {}) {
  const W = opts.width  ?? 320;
  const H = opts.height ?? 100;
  const pad = { t: 14, r: 14, b: 22, l: 36 };
  const color = opts.color ?? '#f97316';
  if (!points || points.length === 0) return `<div class="chart-empty">Pas encore de données</div>`;
  if (points.length === 1) {
    const p = points[0];
    return `<div class="chart-single"><span class="chart-single-val">${p.y}</span><span class="chart-single-lab">${opts.unit ?? ''}</span></div>`;
  }
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const yRange = yMax - yMin || 1;
  const xRange = xMax - xMin || 1;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const sx = x => pad.l + ((x - xMin) / xRange) * innerW;
  const sy = y => pad.t + (1 - (y - yMin) / yRange) * innerH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L ${sx(points[points.length-1].x).toFixed(1)} ${pad.t + innerH} L ${sx(points[0].x).toFixed(1)} ${pad.t + innerH} Z`;

  const dots = points.map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3" fill="${color}" stroke="#111827" stroke-width="1.5"/>`).join('');

  // Labels y (min/max)
  const yMinLbl = `<text x="${pad.l - 6}" y="${pad.t + innerH}" text-anchor="end" dy="3" fill="#6b7280" font-size="10">${yMin.toFixed(yRange < 5 ? 1 : 0)}</text>`;
  const yMaxLbl = `<text x="${pad.l - 6}" y="${pad.t}"          text-anchor="end" dy="3" fill="#6b7280" font-size="10">${yMax.toFixed(yRange < 5 ? 1 : 0)}</text>`;

  // Labels x (dates min/max)
  const fmtX = ts => new Date(ts).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
  const xMinLbl = `<text x="${pad.l}"          y="${H - 6}" fill="#6b7280" font-size="10">${fmtX(xMin)}</text>`;
  const xMaxLbl = `<text x="${pad.l + innerW}" y="${H - 6}" text-anchor="end" fill="#6b7280" font-size="10">${fmtX(xMax)}</text>`;

  return `
    <svg class="line-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">
      <defs>
        <linearGradient id="chart-grad-${color.replace('#','')}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stop-color="${color}" stop-opacity=".25"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#chart-grad-${color.replace('#','')})" stroke="none"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${yMinLbl}${yMaxLbl}${xMinLbl}${xMaxLbl}
    </svg>`;
}

// ═══ Volume par groupe musculaire ═══════════════════
// Recommandations sciences (Schoenfeld et al.) : 10-20 sets/sem pour hypertrophie
const MG_INFO = {
  pec:     { label:'Pectoraux',          color:'#f97316', min:10, max:20 },
  dos:     { label:'Dos',                color:'#0ea5e9', min:10, max:20 },
  epaules: { label:'Épaules',            color:'#a78bfa', min:10, max:20 },
  biceps:  { label:'Biceps',             color:'#ec4899', min:6,  max:14 },
  triceps: { label:'Triceps',            color:'#fb7185', min:6,  max:14 },
  jambesQ: { label:'Quadriceps',         color:'#34d399', min:10, max:20 },
  jambesI: { label:'Ischio / Fessiers',  color:'#22c55e', min:10, max:20 },
  abdo:    { label:'Abdos / Core',       color:'#fbbf24', min:6,  max:16 },
};

function exerciseToMuscleGroup(exName) {
  // Cherche dans EX
  for (const [key, exs] of Object.entries(EX)) {
    if (key === 'cardio') continue;
    if (exs.some(e => e.nom === exName)) return key;
  }
  // Cherche dans les customs (via le champ muscle)
  const custom = state.customExercises?.find(e => e.nom === exName);
  if (custom?.muscle) {
    const m = custom.muscle.toLowerCase();
    if (m.includes('pec'))                        return 'pec';
    if (m.includes('dorsal') || m.includes('dos') || m.includes('trapèze') || m.includes('rotateur')) return 'dos';
    if (m.includes('épaule') || m.includes('deltoïde'))                                              return 'epaules';
    if (m.includes('biceps') || m.includes('brachial'))                                              return 'biceps';
    if (m.includes('triceps'))                                                                       return 'triceps';
    if (m.includes('quadriceps') || m.includes('fessier') && !m.includes('ischio'))                  return 'jambesQ';
    if (m.includes('ischio') || m.includes('mollets') || m.includes('soléaire'))                    return 'jambesI';
    if (m.includes('abdo') || m.includes('core') || m.includes('oblique'))                          return 'abdo';
  }
  return null;
}

function renderVolumeByMuscle() {
  const el = document.getElementById('dash-volume-muscle');
  if (!el) return;

  const sessions = (typeof _allHistorySessions !== 'undefined') ? _allHistorySessions : [];
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;

  // Compte les séries effectives (avec poids ET reps) de la semaine
  const setsByGroup = {};
  for (const sess of sessions) {
    if (new Date(sess.created_at).getTime() < sevenDaysAgo) continue;
    for (const log of sess.exercise_logs || []) {
      const group = exerciseToMuscleGroup(log.exercise_name);
      if (!group || !MG_INFO[group]) continue;
      const validSets = (log.sets || []).filter(s => s?.weight && s?.reps).length;
      setsByGroup[group] = (setsByGroup[group] || 0) + validSets;
    }
  }

  const totalSets = Object.values(setsByGroup).reduce((a, b) => a + b, 0);
  if (totalSets === 0) {
    el.innerHTML = '<p style="color:#6b7280;font-size:13px;padding:6px 0">Enregistre des séances pour voir le volume par groupe.</p>';
    return;
  }

  const rows = Object.entries(MG_INFO).map(([key, info]) => {
    const sets = setsByGroup[key] || 0;
    const pct  = Math.min(100, (sets / info.max) * 100);
    // Statut : sous-min / dans la zone / au-dessus
    let status, statusColor;
    if (sets === 0)              { status = '—',     statusColor = '#6b7280'; }
    else if (sets < info.min)    { status = '↓',     statusColor = '#f87171'; }
    else if (sets <= info.max)   { status = '✓',     statusColor = '#4ade80'; }
    else                          { status = '↑',     statusColor = '#fbbf24'; }
    return `
      <div class="vol-row">
        <div class="vol-name">${info.label}</div>
        <div class="vol-bar-wrap">
          <div class="vol-bar" style="width:${pct}%;background:${info.color}"></div>
          <div class="vol-target" style="left:${(info.min / info.max) * 100}%" title="Minimum recommandé"></div>
        </div>
        <div class="vol-val" style="color:${statusColor}">${sets} <span class="vol-target-txt">/ ${info.min}–${info.max}</span> ${status}</div>
      </div>`;
  }).join('');

  el.innerHTML = rows + `<p class="vol-legend">Recommandation scientifique : 10–20 séries/sem pour les gros groupes, 6–14 pour les petits. Une série compte si poids + reps renseignés.</p>`;
}

// ═══ Badges / Accomplissements ═══════════════════════
const BADGES = [
  { id:'first-session', icon:'🎯', name:'Premier pas',         desc:'Première séance enregistrée',     check:s => s.totalSessions >= 1 },
  { id:'sessions-10',   icon:'💪', name:'10 séances',          desc:'10 séances complétées',           check:s => s.totalSessions >= 10 },
  { id:'sessions-25',   icon:'🥉', name:'25 séances',          desc:'25 séances complétées',           check:s => s.totalSessions >= 25 },
  { id:'sessions-50',   icon:'🥈', name:'50 séances',          desc:'50 séances complétées',           check:s => s.totalSessions >= 50 },
  { id:'sessions-100',  icon:'🥇', name:'Centurion',           desc:'100 séances — légendaire !',      check:s => s.totalSessions >= 100 },
  { id:'streak-2',      icon:'⚡', name:'Régulier',             desc:'2 semaines consécutives',         check:s => s.streak >= 2 },
  { id:'streak-4',      icon:'🌟', name:'Un mois',             desc:'4 semaines consécutives',         check:s => s.streak >= 4 },
  { id:'streak-12',     icon:'💎', name:'Trimestre',           desc:'12 semaines consécutives',        check:s => s.streak >= 12 },
  { id:'streak-26',     icon:'👑', name:'Semestre',            desc:'26 semaines consécutives',        check:s => s.streak >= 26 },
  { id:'pr-3',          icon:'🚀', name:'Décolle',             desc:'3 records personnels battus',     check:s => s.totalPRs >= 3 },
  { id:'pr-10',         icon:'🏆', name:'10 PR',               desc:'10 records personnels',           check:s => s.totalPRs >= 10 },
  { id:'pr-20',         icon:'🏅', name:'Recordman',           desc:'20 records personnels',           check:s => s.totalPRs >= 20 },
  { id:'volume-10k',    icon:'🐂', name:'Volume 10K',          desc:'10 000 kg·rép cumulés',           check:s => s.totalVolume >= 10000 },
  { id:'volume-50k',    icon:'🦏', name:'Volume 50K',          desc:'50 000 kg·rép cumulés',           check:s => s.totalVolume >= 50000 },
  { id:'volume-200k',   icon:'🐘', name:'Volume 200K',         desc:'200 000 kg·rép cumulés',          check:s => s.totalVolume >= 200000 },
  { id:'bench-bw',      icon:'🏋️', name:'Bench = poids du corps', desc:'1RM bench ≥ ton poids',       check:s => s.benchVsBW >= 1 },
  { id:'squat-1_5bw',   icon:'🦵', name:'Squat 1.5×BW',        desc:'1RM squat ≥ 1.5× ton poids',      check:s => s.squatVsBW >= 1.5 },
  { id:'deadlift-2bw',  icon:'🐉', name:'Deadlift 2×BW',       desc:'1RM SDT ≥ 2× ton poids',          check:s => s.deadliftVsBW >= 2 },
  { id:'notes-5',       icon:'📝', name:'5 notes',             desc:'5 séances commentées',            check:s => s.notedSessions >= 5 },
  { id:'week-complete', icon:'🎖️', name:'Semaine complète',    desc:'Toutes tes séances de la semaine', check:s => s.thisWeekDone >= s.jours && s.jours > 0 },
  { id:'custom-prog',   icon:'🛠️', name:'Architecte',          desc:'Programme personnalisé créé',     check:s => !!s.hasCustomProg },
  { id:'custom-ex',     icon:'✏️', name:'Inventeur',           desc:'Premier exercice créé',           check:s => s.customExCount >= 1 },
];

function computeBadgeStats() {
  const sessions = (typeof _allHistorySessions !== 'undefined') ? _allHistorySessions : [];
  const totalSessions = sessions.length;

  // Volume total + nb sessions avec notes
  let totalVolume = 0, notedSessions = 0;
  for (const sess of sessions) {
    if (sess.notes) notedSessions++;
    for (const log of sess.exercise_logs || []) {
      for (const set of log.sets || []) {
        if (set?.weight && set?.reps) totalVolume += set.weight * set.reps;
      }
    }
  }

  // PR : fusion (calculés + overrides)
  const prs = (typeof getMergedPRs === 'function') ? getMergedPRs() : {};
  const totalPRs = Object.values(prs).filter(r => r.maxWeight > 0).length;

  // Ratios poids de corps pour les big 3
  const bw = state.poids || 0;
  const ratio = (exName) => {
    const r = prs[exName];
    return (r && r.est1RM && bw) ? r.est1RM / bw : 0;
  };

  return {
    totalSessions,
    totalVolume,
    totalPRs,
    notedSessions,
    streak:         (typeof _currentStreak !== 'undefined') ? _currentStreak.weeks : 0,
    thisWeekDone:   (typeof _currentStreak !== 'undefined') ? _currentStreak.thisWeek : 0,
    jours:          state.jours || 0,
    benchVsBW:      ratio('Développé couché barre'),
    squatVsBW:      ratio('Squat barre'),
    deadliftVsBW:   Math.max(ratio('Soulevé de terre conventionnel'), ratio('Soulevé de terre roumain')),
    hasCustomProg:  Array.isArray(state.customProgramme) && state.customProgramme.length === 7,
    customExCount:  state.customExercises?.length || 0,
  };
}

function renderBadges() {
  const el = document.getElementById('profile-badges');
  if (!el) return;
  const stats = computeBadgeStats();
  const badges = BADGES.map(b => ({ ...b, earned: b.check(stats) }));
  const earnedCount = badges.filter(b => b.earned).length;

  // En-tête avec compteur
  const header = `<div class="badges-header">${earnedCount} / ${badges.length} badges débloqués</div>`;
  // Grille
  const grid = badges.map(b => `
    <div class="badge-item${b.earned ? ' earned' : ' locked'}" title="${b.desc}">
      <div class="badge-icon">${b.earned ? b.icon : '🔒'}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>
  `).join('');
  el.innerHTML = header + `<div class="badges-grid">${grid}</div>`;
}

// ═══ Streak / Consistance ═══════════════════════════
let _currentStreak = { weeks: 0, thisWeek: 0 };
function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const w = 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return date.getFullYear() + '-W' + String(w).padStart(2, '0');
}
function previousISOWeek(weekStr) {
  const [y, w] = weekStr.split('-W').map(Number);
  if (w > 1) return y + '-W' + String(w - 1).padStart(2, '0');
  // 1ère semaine → dernière de l'année précédente (52 ou 53)
  const lastWeekPrevYear = getISOWeek(new Date(y - 1, 11, 28));
  return lastWeekPrevYear;
}

// ── Customizations persistence (localStorage par user) ──
function _customKey() {
  return (typeof currentUser !== 'undefined' && currentUser)
    ? `fitplan-custom-${currentUser.id}`
    : 'fitplan-custom-anon';
}
function loadCustomizations() {
  try {
    const raw = localStorage.getItem(_customKey());
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.exerciseSwaps && typeof data.exerciseSwaps === 'object') state.exerciseSwaps = data.exerciseSwaps;
    if (Array.isArray(data.daySwaps) && data.daySwaps.length === 7)   state.daySwaps     = data.daySwaps;
    if (Array.isArray(data.customExercises))                          state.customExercises = data.customExercises;
    if (data.prOverrides && typeof data.prOverrides === 'object')     _prOverrides = data.prOverrides;
  } catch {}
}
function saveCustomizations() {
  try {
    localStorage.setItem(_customKey(), JSON.stringify({
      exerciseSwaps:   state.exerciseSwaps,
      daySwaps:        state.daySwaps,
      customExercises: state.customExercises,
      prOverrides:     _prOverrides,
    }));
  } catch {}
}

// ── View management ───────────────────────────────
function showView(name) {
  ['loading', 'onboarding', 'dashboard', 'profile', 'calendar', 'programme-editor'].forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== name);
  });

  const navProg   = document.getElementById('nav-programme');
  const navProf   = document.getElementById('nav-profil');
  const navAgenda = document.getElementById('nav-agenda');
  if (navProg) navProg.classList.toggle('active', name === 'dashboard');
  if (navProf) navProf.classList.toggle('active', name === 'profile');
  if (navAgenda) navAgenda.classList.toggle('active', name === 'calendar');

  if (name === 'dashboard')      history.replaceState(null, '', '#dashboard');
  else if (name === 'profile')   history.replaceState(null, '', '#profile');
  else if (name === 'calendar')  history.replaceState(null, '', '#agenda');
  else                            history.replaceState(null, '', location.pathname);

  if (name === 'calendar') renderCalendar();

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

// ── Niveau toggle ─────────────────────────────────
document.querySelectorAll('.niveau-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.niveau-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.niveau = btn.dataset.niveau;
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

// ── Poids/Reps suggérés selon niveau ──────────────
// type 'bw' = multiplicateur du poids de corps  |  type 'kg' = valeur absolue
const SUGGESTED = {
  'Développé couché barre':       { type:'bw', debutant:0.45, intermediaire:0.65, avance:0.85 },
  'Développé incliné haltères':   { type:'bw', debutant:0.18, intermediaire:0.26, avance:0.36 },
  'Écarté poulie basse':         { type:'kg', debutant:8,    intermediaire:14,   avance:22   },
  'Pompes lestées':              { type:'kg', debutant:0,    intermediaire:5,    avance:15   },
  'Tractions / Lat pulldown':    { type:'bw', debutant:0.45, intermediaire:0.65, avance:0.90 },
  'Rowing barre':                { type:'bw', debutant:0.45, intermediaire:0.65, avance:0.85 },
  'Rowing haltère 1 bras':       { type:'bw', debutant:0.18, intermediaire:0.28, avance:0.40 },
  'Face pull poulie':            { type:'kg', debutant:12,   intermediaire:20,   avance:30   },
  'Développé militaire barre':   { type:'bw', debutant:0.30, intermediaire:0.45, avance:0.60 },
  'Élévations latérales':       { type:'kg', debutant:5,    intermediaire:9,    avance:14   },
  'Élévations frontales':       { type:'kg', debutant:5,    intermediaire:8,    avance:12   },
  'Oiseau poulie':               { type:'kg', debutant:8,    intermediaire:14,   avance:20   },
  'Curl barre EZ':               { type:'kg', debutant:15,   intermediaire:25,   avance:35   },
  'Curl haltères marteau':       { type:'kg', debutant:8,    intermediaire:14,   avance:20   },
  'Dips lestés / Barre au front':{ type:'kg', debutant:0,    intermediaire:10,   avance:20   },
  'Pushdown poulie':             { type:'kg', debutant:15,   intermediaire:25,   avance:40   },
  'Squat barre':                 { type:'bw', debutant:0.65, intermediaire:0.90, avance:1.20 },
  'Presse à cuisses':           { type:'bw', debutant:1.20, intermediaire:1.80, avance:2.50 },
  'Soulevé de terre roumain':   { type:'bw', debutant:0.70, intermediaire:1.00, avance:1.30 },
  'Fentes marchées':             { type:'kg', debutant:8,    intermediaire:14,   avance:22   },
  'Leg curl couché':             { type:'kg', debutant:20,   intermediaire:35,   avance:55   },
  'Mollets debout':              { type:'kg', debutant:30,   intermediaire:60,   avance:100  },
  'Hip thrust barre':            { type:'bw', debutant:0.80, intermediaire:1.20, avance:1.60 },
  'Mollets assis':               { type:'kg', debutant:15,   intermediaire:30,   avance:60   },
  // Nouveaux exos
  'Développé décliné barre':    { type:'bw', debutant:0.45, intermediaire:0.65, avance:0.85 },
  'Écarté haltères couché':    { type:'kg', debutant:8,    intermediaire:14,   avance:20   },
  'Cable crossover':             { type:'kg', debutant:10,   intermediaire:18,   avance:28   },
  'Pec deck machine':            { type:'kg', debutant:25,   intermediaire:40,   avance:60   },
  'Tractions supination':        { type:'kg', debutant:0,    intermediaire:0,    avance:8    },
  'Rowing T-bar':                { type:'bw', debutant:0.40, intermediaire:0.60, avance:0.80 },
  'Tirage horizontal poulie':    { type:'kg', debutant:30,   intermediaire:50,   avance:75   },
  'Pullover haltère':            { type:'kg', debutant:12,   intermediaire:20,   avance:30   },
  'Shrugs haltères':             { type:'kg', debutant:15,   intermediaire:25,   avance:40   },
  'Développé haltères assis':    { type:'kg', debutant:14,   intermediaire:22,   avance:32   },
  'Arnold press':                { type:'kg', debutant:10,   intermediaire:16,   avance:24   },
  'Élévations latérales poulie':{ type:'kg', debutant:5,    intermediaire:9,    avance:14   },
  'Y-raises':                    { type:'kg', debutant:4,    intermediaire:7,    avance:10   },
  'Curl pupitre':                { type:'kg', debutant:12,   intermediaire:20,   avance:30   },
  'Curl incliné haltères':       { type:'kg', debutant:8,    intermediaire:14,   avance:20   },
  'Curl prise marteau corde':    { type:'kg', debutant:10,   intermediaire:18,   avance:25   },
  'Extension verticale haltère': { type:'kg', debutant:12,   intermediaire:20,   avance:30   },
  'Kick-back haltère':           { type:'kg', debutant:5,    intermediaire:8,    avance:12   },
  'Extensions corde poulie':     { type:'kg', debutant:12,   intermediaire:22,   avance:35   },
  'Hack squat':                  { type:'bw', debutant:0.60, intermediaire:0.85, avance:1.15 },
  'Leg extension':               { type:'kg', debutant:25,   intermediaire:45,   avance:70   },
  'Goblet squat':                { type:'kg', debutant:12,   intermediaire:20,   avance:30   },
  'Bulgarian split squat':       { type:'kg', debutant:8,    intermediaire:14,   avance:20   },
  'Soulevé de terre conventionnel':{ type:'bw', debutant:0.80, intermediaire:1.20, avance:1.60 },
  'Good morning':                { type:'kg', debutant:25,   intermediaire:45,   avance:70   },
  'Glute bridge barre':          { type:'bw', debutant:0.60, intermediaire:0.90, avance:1.30 },
  'Kettlebell swing':            { type:'kg', debutant:12,   intermediaire:16,   avance:24   },
  'Crunch poulie haute':         { type:'kg', debutant:18,   intermediaire:30,   avance:50   },
};
function suggestedKg(exName, bodyweight, niveau, genre) {
  const cfg = SUGGESTED[exName];
  if (!cfg || !bodyweight) return null;
  const base = cfg[niveau] ?? cfg.debutant;
  const genreMult = genre === 'female' ? 0.65 : 1.0;
  const val = cfg.type === 'bw' ? bodyweight * base * genreMult : base * genreMult;
  return Math.round(val * 2) / 2; // arrondi 0.5kg
}
function suggestedReps(setsString) {
  // "4×6–8" → 6 ; "3×12" → 12 ; "3×15–20" → 15
  const m = setsString?.match(/×\s*(\d+)/);
  return m ? parseInt(m[1]) : 10;
}

// Cache des dernières perfs par exercice (rempli par loadLastLogs en auth.js)
let _lastExerciseLogs = {};
function getSetDefaults(ex) {
  const last = _lastExerciseLogs[ex.nom];
  if (last?.weight) return { weight: last.weight, reps: last.reps };
  return {
    weight: suggestedKg(ex.nom, state.poids, state.niveau, state.genre),
    reps:   suggestedReps(ex.sets),
  };
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
  pec: [
    { nom:'Développé couché barre',      sets:'4×6–8',   muscle:'Pectoraux' },
    { nom:'Développé incliné haltères',  sets:'3×10–12', muscle:'Pectoraux haut' },
    { nom:'Développé décliné barre',     sets:'3×8–10',  muscle:'Pectoraux bas' },
    { nom:'Écarté poulie basse',         sets:'3×12–15', muscle:'Pectoraux' },
    { nom:'Écarté haltères couché',      sets:'3×12–15', muscle:'Pectoraux' },
    { nom:'Cable crossover',             sets:'3×12',    muscle:'Pectoraux' },
    { nom:'Pec deck machine',            sets:'3×12–15', muscle:'Pectoraux' },
    { nom:'Pompes lestées',              sets:'3×max',   muscle:'Pectoraux' },
    { nom:'Dips poids du corps',         sets:'3×max',   muscle:'Pectoraux / Triceps' },
  ],
  dos: [
    { nom:'Tractions / Lat pulldown',    sets:'4×8–10',  muscle:'Grand dorsal' },
    { nom:'Tractions supination',        sets:'4×max',   muscle:'Grand dorsal / Biceps' },
    { nom:'Rowing barre',                sets:'4×8–10',  muscle:'Dos épais' },
    { nom:'Rowing T-bar',                sets:'4×8–10',  muscle:'Dos épais' },
    { nom:'Rowing haltère 1 bras',       sets:'3×10–12', muscle:'Grand dorsal' },
    { nom:'Tirage horizontal poulie',    sets:'4×10–12', muscle:'Dos épais' },
    { nom:'Pullover haltère',            sets:'3×12',    muscle:'Grand dorsal / Pectoraux' },
    { nom:'Shrugs haltères',             sets:'3×15',    muscle:'Trapèzes' },
    { nom:'Face pull poulie',            sets:'3×15',    muscle:'Trapèzes / Rotateurs' },
  ],
  epaules: [
    { nom:'Développé militaire barre',   sets:'4×6–8',   muscle:'Épaules' },
    { nom:'Développé haltères assis',    sets:'4×8–10',  muscle:'Épaules' },
    { nom:'Arnold press',                sets:'3×10–12', muscle:'Épaules complet' },
    { nom:'Élévations latérales',       sets:'4×12–15', muscle:'Deltoïdes latéraux' },
    { nom:'Élévations latérales poulie',sets:'3×12–15', muscle:'Deltoïdes latéraux' },
    { nom:'Élévations frontales',       sets:'3×12',    muscle:'Deltoïdes antérieurs' },
    { nom:'Oiseau poulie',               sets:'3×15',    muscle:'Deltoïdes postérieurs' },
    { nom:'Y-raises',                    sets:'3×15',    muscle:'Deltoïdes postérieurs' },
  ],
  biceps: [
    { nom:'Curl barre EZ',               sets:'3×10–12', muscle:'Biceps' },
    { nom:'Curl haltères marteau',       sets:'3×12',    muscle:'Brachial / Biceps' },
    { nom:'Curl pupitre',                sets:'3×10–12', muscle:'Biceps' },
    { nom:'Curl incliné haltères',       sets:'3×10–12', muscle:'Biceps long' },
    { nom:'Curl prise marteau corde',    sets:'3×12',    muscle:'Brachial' },
  ],
  triceps: [
    { nom:'Dips lestés / Barre au front',sets:'4×8–10',  muscle:'Triceps' },
    { nom:'Pushdown poulie',             sets:'3×12–15', muscle:'Triceps' },
    { nom:'Extension verticale haltère', sets:'3×10–12', muscle:'Triceps' },
    { nom:'Kick-back haltère',           sets:'3×12–15', muscle:'Triceps' },
    { nom:'Extensions corde poulie',     sets:'3×12–15', muscle:'Triceps' },
  ],
  jambesQ: [
    { nom:'Squat barre',                 sets:'4×6–8',   muscle:'Quadriceps / Fessiers' },
    { nom:'Hack squat',                  sets:'4×8–10',  muscle:'Quadriceps' },
    { nom:'Presse à cuisses',           sets:'3×10–12', muscle:'Quadriceps' },
    { nom:'Leg extension',               sets:'3×12–15', muscle:'Quadriceps' },
    { nom:'Goblet squat',                sets:'3×10–12', muscle:'Quadriceps / Fessiers' },
    { nom:'Bulgarian split squat',       sets:'3×10–12/j', muscle:'Quadriceps / Fessiers' },
    { nom:'Fentes marchées',             sets:'3×12/j',  muscle:'Quadriceps / Fessiers' },
    { nom:'Mollets debout',              sets:'4×15–20', muscle:'Mollets' },
  ],
  jambesI: [
    { nom:'Soulevé de terre roumain',   sets:'4×8–10',  muscle:'Ischio / Fessiers' },
    { nom:'Soulevé de terre conventionnel', sets:'4×6–8', muscle:'Dos / Ischio / Fessiers' },
    { nom:'Good morning',                sets:'3×10',    muscle:'Ischio / Bas du dos' },
    { nom:'Leg curl couché',             sets:'3×12–15', muscle:'Ischio-jambiers' },
    { nom:'Hip thrust barre',            sets:'3×12',    muscle:'Fessiers' },
    { nom:'Glute bridge barre',          sets:'3×12–15', muscle:'Fessiers' },
    { nom:'Kettlebell swing',            sets:'3×15–20', muscle:'Ischio / Fessiers' },
    { nom:'Mollets assis',               sets:'4×15–20', muscle:'Soléaire' },
  ],
  abdo: [
    { nom:'Crunch',                      sets:'3×15–20', muscle:'Abdominaux' },
    { nom:'Crunch poulie haute',         sets:'3×15',    muscle:'Abdominaux' },
    { nom:'Relevés de jambes suspendu', sets:'3×10–15', muscle:'Abdos bas' },
    { nom:'Planche (gainage)',           sets:'3×30–60s',muscle:'Core' },
    { nom:'Gainage latéral',             sets:'3×30s/j', muscle:'Obliques' },
    { nom:'Roulette abdo',               sets:'3×10–12', muscle:'Core' },
    { nom:'Russian twist',               sets:'3×20',    muscle:'Obliques' },
  ],
  cardio: [
    { nom:'Tapis de course — LISS',      sets:'30 min, 65% FC max',           muscle:'' },
    { nom:'Marche inclinée tapis',       sets:'30 min, inclinaison 12%',      muscle:'' },
    { nom:'Vélo elliptique',             sets:'25 min, intensité modérée',    muscle:'' },
    { nom:'Rameur',                      sets:'20 min, intensité modérée',    muscle:'' },
    { nom:'Stairmaster',                 sets:'20 min',                       muscle:'' },
    { nom:'HIIT — Intervalles',          sets:'20 min (30s sprint/90s repos)',muscle:'' },
    { nom:'Corde à sauter',              sets:'4×3 min',                      muscle:'' },
    { nom:'Burpees',                     sets:'4×15',                         muscle:'' },
  ],
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

// Retourne le programme avec les customizations utilisateur appliquées
function getCustomProgramme() {
  // Si l'utilisateur a un programme 100% perso, on l'utilise comme base
  let base;
  if (Array.isArray(state.customProgramme) && state.customProgramme.length === 7) {
    base = state.customProgramme.map((d, i) => ({
      jour: D[i],
      type: d.type || 'training',
      label: d.label || (d.type === 'rest' ? 'Repos' : d.type === 'cardio' ? 'Cardio' : 'Séance'),
      exercices: Array.isArray(d.exercices) ? d.exercices : [],
    }));
  } else {
    base = buildProgramme(state.objectif, state.jours);
  }
  if (!base.length) return [];
  // 1. Swap des jours
  const swapped = state.daySwaps.map((origIdx, slotIdx) => {
    const src = base[origIdx] ?? base[slotIdx];
    return { ...src, jour: D[slotIdx] };
  });
  // 2. Swap des exercices
  return swapped.map(day => ({
    ...day,
    exercices: day.exercices.map(ex => state.exerciseSwaps[ex.nom] ?? ex),
  }));
}

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
  const programme = getCustomProgramme();

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
  const h = new Date().getHours();
  const greet = h < 6 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const greetLine = state.prenom ? `${greet}, <span style="color:#fb923c">${state.prenom}</span> 👋` : `${greet} 👋`;
  const streakBadge = _currentStreak.weeks > 1
    ? `<span class="streak-badge" title="${_currentStreak.weeks} semaines consécutives avec au moins 1 séance">🔥 ${_currentStreak.weeks} sem.</span>`
    : '';
  const weekBadge = `<span class="week-badge" title="Séances cette semaine">📅 ${_currentStreak.thisWeek}/${jours}</span>`;

  banner.innerHTML = `
    <div class="today-left">
      <div class="today-greet">${greetLine}</div>
      <div class="today-meta">
        <span>${objLabel} · ${jours} jours/sem</span>
        ${streakBadge}
        ${weekBadge}
      </div>
      <div class="today-day">${isRest ? '💤 Aujourd\'hui : Repos' : `Aujourd'hui — ${todayProg.label}`}</div>
      ${isRest ? '<div class="today-sub">Récupération active : étirements, marche légère.</div>' : `<div class="today-sub">${todayProg.exercices.length} exercices · Bonne séance 💪</div>`}
    </div>
    <button class="today-btn" onclick="startSession()">
      ${isRest ? '+ Séance libre' : '▶ Démarrer la séance'}
    </button>`;

  // ── Grille semaine (7 colonnes)
  document.getElementById('week-grid').innerHTML = programme.map((day, i) => {
    const isToday = i === todayIdx;
    const exHTML = day.exercices.map(ex => {
      const isSwapped = !!state.exerciseSwaps[ex.nom] || Object.values(state.exerciseSwaps).some(s => s.nom === ex.nom);
      return `
      <div class="exercise-item">
        <div style="flex:1;min-width:0">
          <div class="exercise-name">${ex.nom}${isSwapped ? ' <span style="color:#f97316;font-size:9px">●</span>' : ''}</div>
          ${ex.muscle ? `<div style="font-size:10px;color:#6b7280;margin-top:1px">${ex.muscle}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <span class="exercise-sets" style="font-size:11px">${ex.sets}</span>
          <button class="demo-btn" onclick="openDemo('${ex.nom.replace(/'/g,"\\'")}')" title="Démo">▶</button>
          ${ex.muscle ? `<button class="demo-btn swap-btn" onclick="openSwapEx('${ex.nom.replace(/'/g,"\\'")}')" title="Remplacer">✎</button>` : ''}
        </div>
      </div>`;
    }).join('');

    const headerBg = isToday ? 'background:rgba(249,115,22,0.2);border-bottom:2px solid #f97316'
      : day.type === 'cardio' ? 'background:rgba(20,184,166,0.08)' : day.type === 'rest' ? 'background:#0d1117' : 'background:rgba(249,115,22,0.06)';
    const isSwappedDay = state.daySwaps[i] !== i;

    return `
      <div class="day-card${isToday ? ' today-highlight' : ''}${day.type === 'rest' && !isToday ? ' rest-day' : ''}">
        <div class="day-header" style="${headerBg}">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
            <span class="day-name">${day.jour.slice(0,3)}${isSwappedDay ? ' <span style="color:#f97316;font-size:9px">●</span>' : ''}</span>
            <button class="swap-day-btn" onclick="openSwapDay(${i})" title="Échanger ce jour">⇄</button>
          </div>
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

  const niveauLabels = { debutant:'🌱 Débutant', intermediaire:'🔥 Intermédiaire', avance:'💪 Avancé' };
  document.getElementById('profile-identity').innerHTML =
    (state.prenom || state.nom ? row('Nom', `${state.prenom ?? ''} ${state.nom ?? ''}`.trim()) : '') +
    row('Niveau',   niveauLabels[state.niveau] ?? state.niveau) +
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

// ═══ Swap Exercice ═══════════════════════════════════
let _swapExTarget = null;
const MUSCLE_GROUPS = {
  pec:'Pectoraux', dos:'Dos', epaules:'Épaules',
  biceps:'Biceps', triceps:'Triceps',
  jambesQ:'Jambes — Quadriceps', jambesI:'Jambes — Ischio / Fessiers',
  abdo:'Abdos & Core',
  cardio:'Cardio',
};

let _swapExSearchQuery   = '';
let _swapExExpandedGroup = null; // accordéon : un seul groupe ouvert à la fois (sauf si recherche active)

function openSwapEx(exName) {
  _swapExTarget = exName;
  _swapExSearchQuery   = '';
  _swapExExpandedGroup = null;

  const isPicker = _exPickerCallback != null;
  const current  = isPicker ? null : state.exerciseSwaps[exName];

  const titleEl = document.querySelector('#swap-ex-modal .modal-title');
  if (titleEl) titleEl.textContent = isPicker ? 'Choisir un exercice' : 'Remplacer l\'exercice';
  document.getElementById('swap-ex-current').textContent = isPicker
    ? 'Sélectionne un exercice à ajouter'
    : (current ? `Actuel : ${current.nom}  ·  Original : ${exName}` : `Original : ${exName}`);

  const resetBtn = document.getElementById('swap-ex-reset-btn');
  if (resetBtn) resetBtn.style.display = isPicker ? 'none' : '';

  document.getElementById('swap-ex-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderSwapExList();
}

function _highlightMatch(text, query) {
  if (!query) return text;
  const q = query.trim().toLowerCase();
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  return text.slice(0, i) + `<mark>${text.slice(i, i + q.length)}</mark>` + text.slice(i + q.length);
}

function renderSwapExList() {
  const list = document.getElementById('swap-ex-list');
  if (!list) return;

  const isPicker   = _exPickerCallback != null;
  const current    = isPicker ? null : state.exerciseSwaps[_swapExTarget];
  const currentNom = current?.nom ?? _swapExTarget;
  const q          = _swapExSearchQuery.trim().toLowerCase();

  // Bouton créer
  const createBtn = `
    <button class="swap-create-btn" onclick="openCreateExModal()">
      <span style="font-size:18px">＋</span>
      <span>Créer mon propre exercice</span>
    </button>`;

  // Barre de recherche
  const searchBar = `
    <div class="swap-search-wrap">
      <span class="swap-search-icon">🔍</span>
      <input type="text" class="swap-search-input" id="swap-search-input" placeholder="Rechercher un exercice..." value="${_swapExSearchQuery.replace(/"/g, '&quot;')}" oninput="onSwapSearch(this.value)" autocomplete="off"/>
      ${q ? `<button class="swap-search-clear" onclick="onSwapSearch('')" title="Effacer">✕</button>` : ''}
    </div>`;

  const matches = (ex) => !q || ex.nom.toLowerCase().includes(q) || (ex.muscle || '').toLowerCase().includes(q);

  // ─ Mes exercices (custom)
  const customMatching = state.customExercises.filter(matches);
  const customOpen = q ? customMatching.length > 0 : _swapExExpandedGroup === 'custom';
  const customHtml = state.customExercises.length > 0 && (!q || customMatching.length > 0) ? `
    <div class="swap-group">
      <button class="swap-group-header" onclick="toggleSwapGroup('custom')">
        <span>✏️ Mes exercices <span class="swap-group-count">${customMatching.length}</span></span>
        <span class="swap-group-arrow ${customOpen ? 'open' : ''}">▾</span>
      </button>
      ${customOpen ? `<div class="swap-group-body">
        ${customMatching.map(ex => {
          const idx = state.customExercises.indexOf(ex);
          const active = ex.nom === currentNom;
          return `
            <div class="swap-option-row">
              <button class="swap-option${active ? ' active' : ''}" style="flex:1" onclick="applyCustomExSwap(${idx})">
                <span class="swap-option-name">${_highlightMatch(ex.nom, q)}</span>
                <span class="swap-option-meta">${ex.sets}</span>
              </button>
              <button class="swap-custom-delete" onclick="deleteCustomExercise(${idx})" title="Supprimer">✕</button>
            </div>`;
        }).join('')}
      </div>` : ''}
    </div>` : '';

  // ─ Groupes standards
  const stdHtml = Object.entries(EX).map(([key, exs]) => {
    const filtered = exs.filter(matches);
    if (q && filtered.length === 0) return '';
    const isOpen = q ? true : _swapExExpandedGroup === key;
    return `
      <div class="swap-group">
        <button class="swap-group-header" onclick="toggleSwapGroup('${key}')">
          <span>${MUSCLE_GROUPS[key] ?? key} <span class="swap-group-count">${filtered.length}</span></span>
          <span class="swap-group-arrow ${isOpen ? 'open' : ''}">▾</span>
        </button>
        ${isOpen ? `<div class="swap-group-body">
          ${filtered.map(ex => {
            const active = ex.nom === currentNom;
            const safe   = ex.nom.replace(/'/g, "\\'");
            return `
              <button class="swap-option${active ? ' active' : ''}" onclick="applyExSwap('${safe}','${key}')">
                <span class="swap-option-name">${_highlightMatch(ex.nom, q)}</span>
                <span class="swap-option-meta">${ex.sets}</span>
              </button>`;
          }).join('')}
        </div>` : ''}
      </div>`;
  }).filter(Boolean).join('');

  // ─ Aucun résultat
  const noResults = q && !customMatching.length && !stdHtml ? `
    <p style="text-align:center;padding:24px 0;color:#9ca3af;font-size:13px">Aucun exercice trouvé pour "${q}"</p>` : '';

  list.innerHTML = createBtn + searchBar + customHtml + stdHtml + noResults;

  // Restaure le focus + position du curseur dans le champ recherche
  if (q || document.activeElement?.id === 'swap-search-input') {
    const input = document.getElementById('swap-search-input');
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }
}

function toggleSwapGroup(key) {
  _swapExExpandedGroup = _swapExExpandedGroup === key ? null : key;
  renderSwapExList();
}

function onSwapSearch(value) {
  _swapExSearchQuery = value;
  renderSwapExList();
}
function applyExSwap(newName, group) {
  const newEx = EX[group]?.find(e => e.nom === newName);
  if (!newEx) return;
  // Mode picker (éditeur de programme)
  if (_exPickerCallback) {
    _exPickerCallback({ ...newEx });
    _exPickerCallback = null;
    closeSwapExModal();
    return;
  }
  if (!_swapExTarget) return;
  if (newEx.nom === _swapExTarget) delete state.exerciseSwaps[_swapExTarget];
  else                              state.exerciseSwaps[_swapExTarget] = newEx;
  saveCustomizations();
  renderDashboard();
  closeSwapExModal();
  showToast('✓ Exercice mis à jour');
}
function applyCustomExSwap(idx) {
  const ex = state.customExercises[idx];
  if (!ex) return;
  if (_exPickerCallback) {
    _exPickerCallback({ ...ex });
    _exPickerCallback = null;
    closeSwapExModal();
    return;
  }
  if (!_swapExTarget) return;
  state.exerciseSwaps[_swapExTarget] = ex;
  saveCustomizations();
  renderDashboard();
  closeSwapExModal();
  showToast('✓ Exercice personnalisé appliqué');
}
function deleteCustomExercise(idx) {
  const ex = state.customExercises[idx];
  if (!ex) return;
  if (!confirm(`Supprimer "${ex.nom}" de tes exercices personnalisés ?`)) return;
  // Si cet exo est utilisé dans des swaps, on les retire aussi
  Object.entries(state.exerciseSwaps).forEach(([orig, swap]) => {
    if (swap.nom === ex.nom) delete state.exerciseSwaps[orig];
  });
  state.customExercises.splice(idx, 1);
  saveCustomizations();
  renderDashboard();
  // Re-render le modal s'il est ouvert
  if (_swapExTarget) openSwapEx(_swapExTarget);
}

// ═══ Édition manuelle d'un PR ════════════════════════
let _editingPRName = null;

function openEditPR(name) {
  _editingPRName = name;
  document.getElementById('edit-pr-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Si name === null → mode "ajouter", sinon mode "modifier"
  const merged = (typeof getMergedPRs === 'function') ? getMergedPRs() : {};
  const r = name ? merged[name] : null;
  const override = name ? (_prOverrides[name] || {}) : {};

  document.getElementById('edit-pr-title').textContent = name ? 'Modifier le record' : 'Ajouter un record';
  const nomEl = document.getElementById('edit-pr-nom');
  nomEl.value = name || '';
  nomEl.disabled = !!name;

  document.getElementById('edit-pr-weight').value = override.maxWeight ?? r?.maxWeight ?? '';
  document.getElementById('edit-pr-reps').value   = override.maxReps   ?? r?.maxReps   ?? '';
  document.getElementById('edit-pr-error').classList.add('hidden');

  // Bouton "Restaurer auto" visible uniquement si override existe
  const resetBtn = document.getElementById('edit-pr-reset');
  resetBtn.style.display = (name && _prOverrides[name]) ? '' : 'none';

  updateEditPR1RM();
}
function closeEditPRModal() {
  document.getElementById('edit-pr-modal').classList.add('hidden');
  document.body.style.overflow = '';
  _editingPRName = null;
}
function updateEditPR1RM() {
  const w = parseFloat(document.getElementById('edit-pr-weight').value);
  const r = parseFloat(document.getElementById('edit-pr-reps').value);
  const est = (w && r) ? Math.round(calcEst1RM(w, r)) : 0;
  document.getElementById('edit-pr-1rm').textContent = est ? `${est} kg` : '—';
}
function saveEditPR() {
  const nom    = document.getElementById('edit-pr-nom').value.trim();
  const weight = parseFloat(document.getElementById('edit-pr-weight').value);
  const reps   = parseInt(document.getElementById('edit-pr-reps').value);
  const err    = document.getElementById('edit-pr-error');

  if (!nom)            { err.textContent = 'Nom requis.';        err.classList.remove('hidden'); return; }
  if (!weight || weight <= 0) { err.textContent = 'Poids requis (> 0).'; err.classList.remove('hidden'); return; }
  if (!reps || reps <= 0)     { err.textContent = 'Reps requis (> 0).';  err.classList.remove('hidden'); return; }

  _prOverrides[nom] = {
    maxWeight: weight,
    maxReps:   reps,
    date:      new Date().toISOString(),
  };
  saveCustomizations();
  renderPRs();
  closeEditPRModal();
  showToast('✓ Record mis à jour');
}
function resetPROverride() {
  if (!_editingPRName) return;
  if (!confirm(`Restaurer la valeur calculée automatiquement pour "${_editingPRName}" ?`)) return;
  delete _prOverrides[_editingPRName];
  saveCustomizations();
  renderPRs();
  closeEditPRModal();
  showToast('✓ Record auto restauré');
}

// ═══ Éditeur de programme ════════════════════════════
let _editorProgramme = null;   // brouillon de travail (7 jours)
let _exPickerCallback = null;  // si défini, openSwapEx devient un picker

function openProgrammeEditor() {
  // Initialise le brouillon à partir du programme actuel
  const current = state.customProgramme ?? buildProgramme(state.objectif, state.jours);
  _editorProgramme = D.map((dayName, i) => {
    const d = current[i] || { type:'rest', label:'Repos', exercices:[] };
    return {
      type:      d.type || 'training',
      label:     d.label || (d.type === 'rest' ? 'Repos' : d.type === 'cardio' ? 'Cardio' : 'Séance'),
      exercices: Array.isArray(d.exercices) ? d.exercices.map(e => ({...e})) : [],
    };
  });
  showView('programme-editor');
  renderProgrammeEditor();
}

function cancelProgrammeEdit() {
  _editorProgramme = null;
  showView('dashboard');
}

function renderProgrammeEditor() {
  const wrap = document.getElementById('editor-days');
  if (!_editorProgramme) return;
  wrap.innerHTML = _editorProgramme.map((day, i) => {
    const safeLabel = (day.label || '').replace(/"/g, '&quot;');
    const exHtml = (day.type === 'rest')
      ? '<p style="color:#6b7280;font-size:13px;padding:8px 0;text-align:center">Jour de repos</p>'
      : (day.exercices.length === 0
          ? '<p style="color:#6b7280;font-size:13px;padding:8px 0;text-align:center">Aucun exercice</p>'
          : day.exercices.map((ex, ei) => `
            <div class="editor-ex-row">
              <div class="editor-ex-info">
                <div class="editor-ex-name">${ex.nom}</div>
                <div class="editor-ex-meta">${ex.sets ?? '3×10'}${ex.muscle ? ' · ' + ex.muscle : ''}</div>
              </div>
              <div class="editor-ex-actions">
                <button class="editor-move-btn" onclick="editorMoveExercise(${i},${ei},-1)" ${ei === 0 ? 'disabled' : ''} title="Monter">↑</button>
                <button class="editor-move-btn" onclick="editorMoveExercise(${i},${ei},1)"  ${ei === day.exercices.length - 1 ? 'disabled' : ''} title="Descendre">↓</button>
                <button class="editor-rm-btn"   onclick="editorRemoveExercise(${i},${ei})" title="Retirer">✕</button>
              </div>
            </div>`).join(''));

    return `
      <div class="editor-day editor-day-${day.type}">
        <div class="editor-day-head">
          <span class="editor-day-name">${D[i]}</span>
          <select class="editor-day-type" onchange="editorSetType(${i}, this.value)">
            <option value="training" ${day.type === 'training' ? 'selected' : ''}>Entraînement</option>
            <option value="cardio"   ${day.type === 'cardio'   ? 'selected' : ''}>Cardio</option>
            <option value="rest"     ${day.type === 'rest'     ? 'selected' : ''}>Repos</option>
          </select>
        </div>
        ${day.type !== 'rest' ? `
          <input type="text" class="editor-day-label" placeholder="Libellé (ex: Push, Lower A...)" value="${safeLabel}" oninput="editorSetLabel(${i}, this.value)"/>
          <div class="editor-ex-list">${exHtml}</div>
          <button class="editor-add-ex" onclick="editorPickExercise(${i})">＋ Ajouter un exercice</button>
        ` : ''}
      </div>`;
  }).join('');
}

function editorSetType(i, type) {
  if (!_editorProgramme) return;
  const prevType = _editorProgramme[i].type;
  _editorProgramme[i].type = type;

  if (type === 'rest') {
    _editorProgramme[i].label = 'Repos';
    _editorProgramme[i].exercices = [];
  } else if (type === 'cardio') {
    // Bascule vers Cardio → on vide les exos (l'utilisateur ajoute ceux qu'il veut)
    if (prevType !== 'cardio') _editorProgramme[i].exercices = [];
    if (!_editorProgramme[i].label || _editorProgramme[i].label === 'Repos' || _editorProgramme[i].label === 'Séance') {
      _editorProgramme[i].label = 'Cardio';
    }
  } else if (type === 'training') {
    if (_editorProgramme[i].label === 'Repos' || _editorProgramme[i].label === 'Cardio') {
      _editorProgramme[i].label = 'Séance';
    }
  }
  renderProgrammeEditor();
}
function editorSetLabel(i, value) {
  if (!_editorProgramme) return;
  _editorProgramme[i].label = value;
}
function editorRemoveExercise(i, ei) {
  if (!_editorProgramme) return;
  _editorProgramme[i].exercices.splice(ei, 1);
  renderProgrammeEditor();
}
function editorMoveExercise(i, ei, dir) {
  if (!_editorProgramme) return;
  const arr = _editorProgramme[i].exercices;
  const target = ei + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[ei], arr[target]] = [arr[target], arr[ei]];
  renderProgrammeEditor();
}
function editorPickExercise(i) {
  _exPickerCallback = (ex) => {
    _editorProgramme[i].exercices.push({ ...ex });
    renderProgrammeEditor();
  };
  // Réutilise la modal swap-ex en mode picker
  openSwapEx('__PICKER__');
}

async function saveCustomProgrammeAction() {
  if (!_editorProgramme) return;
  state.customProgramme = _editorProgramme.map(d => ({
    type: d.type, label: d.label, exercices: d.exercices,
  }));
  if (typeof saveProfile === 'function') {
    try { await saveProfile(); } catch {}
  }
  _editorProgramme = null;
  renderDashboard();
  renderProfile();
  showView('dashboard');
  showToast('✓ Programme personnalisé enregistré');
}

async function resetCustomProgramme() {
  if (!confirm('Revenir au programme automatique et perdre les personnalisations ?')) return;
  state.customProgramme = null;
  if (typeof saveProfile === 'function') {
    try { await saveProfile(); } catch {}
  }
  _editorProgramme = null;
  renderDashboard();
  renderProfile();
  showView('dashboard');
  showToast('✓ Programme automatique restauré');
}

// ═══ Création d'un exercice perso ═══════════════════
function openCreateExModal() {
  document.getElementById('create-ex-modal').classList.remove('hidden');
  document.getElementById('create-ex-nom').value = '';
  document.getElementById('create-ex-sets').value = '';
  document.getElementById('create-ex-muscle').value = '';
  document.getElementById('create-ex-error').classList.add('hidden');
  setTimeout(() => document.getElementById('create-ex-nom').focus(), 50);
}
function closeCreateExModal() {
  document.getElementById('create-ex-modal').classList.add('hidden');
}
function saveCreateExercise() {
  const nom    = document.getElementById('create-ex-nom').value.trim();
  const sets   = document.getElementById('create-ex-sets').value.trim() || '3×10';
  const muscle = document.getElementById('create-ex-muscle').value.trim();
  const err    = document.getElementById('create-ex-error');

  if (!nom) {
    err.textContent = 'Le nom de l\'exercice est requis.';
    err.classList.remove('hidden');
    return;
  }
  if (state.customExercises.some(e => e.nom.toLowerCase() === nom.toLowerCase())) {
    err.textContent = 'Un exercice avec ce nom existe déjà.';
    err.classList.remove('hidden');
    return;
  }

  const newEx = { nom, sets, muscle: muscle || 'Personnalisé' };
  state.customExercises.push(newEx);
  saveCustomizations();
  closeCreateExModal();
  showToast('✓ Exercice créé');

  // Si on était en train de swap, applique direct
  if (_swapExTarget) {
    state.exerciseSwaps[_swapExTarget] = newEx;
    saveCustomizations();
    renderDashboard();
    closeSwapExModal();
  }
}
function resetExSwap() {
  if (!_swapExTarget) return;
  delete state.exerciseSwaps[_swapExTarget];
  saveCustomizations();
  renderDashboard();
  closeSwapExModal();
  showToast('✓ Original restauré');
}
function closeSwapExModal() {
  document.getElementById('swap-ex-modal').classList.add('hidden');
  document.body.style.overflow = '';
  _swapExTarget = null;
  _exPickerCallback = null;
}

// ═══ Swap Jour ═══════════════════════════════════════
let _swapDaySlot = null;
function openSwapDay(slotIdx) {
  _swapDaySlot = slotIdx;
  const list = document.getElementById('swap-day-list');
  const programme = getCustomProgramme();

  document.getElementById('swap-day-current').textContent =
    `${D[slotIdx]} — ${programme[slotIdx]?.type === 'rest' ? 'Repos' : programme[slotIdx]?.label ?? ''}`;

  list.innerHTML = programme.map((day, i) => {
    if (i === slotIdx) return '';
    const label = day.type === 'rest' ? 'Repos' : day.label;
    return `
      <button class="swap-day-option" onclick="applyDaySwap(${slotIdx}, ${i})">
        <span class="swap-day-name">${D[i]}</span>
        <span class="swap-day-label">${label}</span>
      </button>`;
  }).filter(Boolean).join('');

  document.getElementById('swap-day-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function applyDaySwap(a, b) {
  const next = [...state.daySwaps];
  [next[a], next[b]] = [next[b], next[a]];
  state.daySwaps = next;
  saveCustomizations();
  renderDashboard();
  closeSwapDayModal();
  showToast(`✓ ${D[a]} ↔ ${D[b]}`);
}
function resetDaySwaps() {
  state.daySwaps = [0, 1, 2, 3, 4, 5, 6];
  saveCustomizations();
  renderDashboard();
  closeSwapDayModal();
  showToast('✓ Ordre des jours réinitialisé');
}
function closeSwapDayModal() {
  document.getElementById('swap-day-modal').classList.add('hidden');
  document.body.style.overflow = '';
  _swapDaySlot = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeRestModal();
    closeSwapExModal();
    closeSwapDayModal();
    closeSessionDetail();
    closeCreateExModal();
    closeEditPRModal();
    closeBodyWeightModal();
  }
});

// ── Utils ─────────────────────────────────────────
function printPage() { window.print(); }

// Export PDF avec jsPDF — layout propre, contrôlé, pas de "print" navigateur
async function exportProgrammePDF() {
  if (!window.jspdf?.jsPDF) {
    showToast('⚠️ Bibliothèque PDF non chargée');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const W = 210, H = 297, M = 14;
  const orange   = [249, 115, 22];
  const orangeLt = [255, 247, 237];
  const orangeDk = [194, 65, 12];
  const indigo   = [99, 102, 241];
  const indigoLt = [238, 242, 255];
  const indigoDk = [55, 48, 163];
  const teal     = [13, 148, 136];
  const tealLt   = [204, 251, 241];
  const ink      = [31, 41, 55];
  const muted    = [107, 114, 128];
  const subtle   = [156, 163, 175];

  // ─────────── HEADER (barre orange)
  doc.setFillColor(...orange);
  doc.rect(0, 0, W, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('FitPlan', M, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const dateStr = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
  doc.text(`Programme de la semaine  •  ${dateStr}`, M, 20.5);

  let y = 32;

  // ─────────── NOM UTILISATEUR
  const userName = [state.prenom, state.nom].filter(Boolean).join(' ');
  if (userName) {
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(userName, M, y);
    y += 5.5;
  }

  // ─────────── LIGNE PROFIL
  doc.setTextColor(...muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const objLabels    = { perte:'Perte de poids', maintien:'Maintien / Recomposition', masse:'Prise de masse' };
  const niveauLabels = { debutant:'Débutant', intermediaire:'Intermédiaire', avance:'Avancé' };
  const profileLine = [
    objLabels[state.objectif],
    state.jours ? `${state.jours} séances/sem` : null,
    state.niveau ? `Niveau ${niveauLabels[state.niveau] || state.niveau}` : null,
  ].filter(Boolean).join('  •  ');
  if (profileLine) { doc.text(profileLine, M, y); y += 8; }

  // ─────────── BLOC NUTRITION
  if (state.poids && state.taille && state.age) {
    const bmr    = calcBMR(state.genre, state.poids, state.taille, state.age);
    const tdee   = calcTDEE(bmr, state.activite);
    const cibles = calcTargetCals(tdee, state.objectif);
    const macros = calcMacros(cibles, state.poids, state.objectif);

    doc.setFillColor(...orangeLt);
    doc.setDrawColor(253, 186, 116);
    doc.roundedRect(M, y, W - 2 * M, 19, 2.5, 2.5, 'FD');

    doc.setTextColor(...orangeDk);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('NUTRITION CIBLE QUOTIDIENNE', M + 5, y + 5.5);

    doc.setTextColor(...ink);
    doc.setFontSize(15);
    doc.text(`${cibles} kcal`, M + 5, y + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...muted);
    const macroText = `Protéines ${macros.proteines}g   •   Lipides ${macros.lipides}g   •   Glucides ${macros.glucides}g`;
    doc.text(macroText, W - M - 5, y + 13, { align: 'right' });

    y += 24;
  }

  // ─────────── INTITULÉ PROGRAMME
  const splitNames = {
    perte:   {2:'Full Body 2×',3:'Full Body 3×',4:'Full Body + Cardio',5:'Full Body 3× + Cardio 2×',6:'Full Body 4× + Cardio 2×'},
    maintien:{2:'Full Body 2×',3:'Full Body 3×',4:'Upper / Lower 4×',5:'Push / Pull / Legs 5×',6:'Push / Pull / Legs 6×'},
    masse:   {2:'Full Body 2× lourd',3:'Full Body 3× lourd',4:'Upper / Lower 4×',5:'Push / Pull / Legs 5×',6:'Push / Pull / Legs 6×'},
  };
  const splitName = (state.customProgramme ? 'Programme personnalisé' : splitNames[state.objectif]?.[state.jours]) ?? '';
  if (splitName) {
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(splitName, M, y);
    y += 6.5;
  }

  // ─────────── 7 JOURS
  const programme = getCustomProgramme();
  for (let i = 0; i < 7; i++) {
    const day = programme[i];
    if (!day) continue;

    const exos  = day.exercices || [];
    const lines = Math.max(exos.length, 1);
    const cardH = Math.max(15, 10 + lines * 4.6);

    // Page break si nécessaire
    if (y + cardH > H - 14) {
      doc.addPage();
      y = M;
    }

    // Couleurs selon le type
    let bg, badgeCol;
    if (day.type === 'rest')        { bg = indigoLt; badgeCol = indigoDk; }
    else if (day.type === 'cardio') { bg = tealLt;   badgeCol = teal; }
    else                            { bg = orangeLt; badgeCol = orangeDk; }

    // Fond
    doc.setFillColor(...bg);
    doc.roundedRect(M, y, W - 2 * M, cardH, 2.5, 2.5, 'F');
    // Petite barre verticale gauche colorée
    doc.setFillColor(...badgeCol);
    doc.rect(M, y, 2, cardH, 'F');

    // Nom du jour
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(D[i].toUpperCase(), M + 5, y + 6.5);

    // Badge type/label
    doc.setTextColor(...badgeCol);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const badgeText = (day.type === 'rest' ? 'REPOS' : (day.label || day.type)).toUpperCase();
    doc.text(badgeText, M + 32, y + 6.5);

    // Exercices
    if (exos.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      let exY = y + 11.5;
      for (const ex of exos) {
        // Tronque le nom si trop long pour ne pas chevaucher les sets
        let exName = ex.nom || '';
        const nameMaxWidth = W - 2 * M - 60;
        while (doc.getTextWidth(exName) > nameMaxWidth && exName.length > 3) {
          exName = exName.slice(0, -1);
        }
        if (exName !== ex.nom) exName = exName.slice(0, -1) + '…';

        doc.setTextColor(55, 65, 81);
        doc.text(`•  ${exName}`, M + 7, exY);

        // Sets à droite
        doc.setTextColor(...orange);
        doc.setFont('helvetica', 'bold');
        doc.text(ex.sets || '', W - M - 4, exY, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        exY += 4.6;
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(...muted);
      doc.text('Récupération — étirements, marche légère', M + 7, y + 11.5);
    }

    y += cardH + 2.5;
  }

  // ─────────── FOOTER (chaque page)
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setTextColor(...subtle);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text(`FitPlan  •  ${dateStr}  •  Page ${p}/${totalPages}`, W / 2, H - 7, { align: 'center' });
    doc.text('Calculs basés sur la formule Mifflin-St Jeor — Consulte un professionnel de santé.', W / 2, H - 3.5, { align: 'center' });
  }

  const safeName = userName ? userName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() : 'programme';
  const fileDate = new Date().toISOString().slice(0, 10);
  doc.save(`fitplan-${safeName}-${fileDate}.pdf`);
  showToast('✓ PDF téléchargé');
}

function copyToClipboard() {
  if (!state.objectif) return;
  const bmr    = calcBMR(state.genre, state.poids, state.taille, state.age);
  const cibles = calcTargetCals(calcTDEE(bmr, state.activite), state.objectif);
  const macros = calcMacros(cibles, state.poids, state.objectif);
  const labels = { perte:'Perte de poids', maintien:'Maintien', masse:'Prise de masse' };
  navigator.clipboard.writeText(`🏋️ FitPlan\n${labels[state.objectif]} · ${state.jours}j/sem\nCalories : ${cibles} kcal/j\nProtéines : ${macros.proteines}g · Lipides : ${macros.lipides}g · Glucides : ${macros.glucides}g`).then(() => showToast('✓ Copié !'));
}
