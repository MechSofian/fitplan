/* =============================================
   FitPlan — Supabase Auth + Profile + Sessions
   ============================================= */

const SUPABASE_URL  = 'https://gllhxhcxvrfxnomsylve.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbGh4aGN4dnJmeG5vbXN5bHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTUyNjcsImV4cCI6MjA5NDI3MTI2N30.YcF4TvYU3SI-MStMvpwSvy-I1Nhi3TIKz_yQ60i7ECw';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let currentUser          = null;
let activeSession        = null;
let _expectSignedOut     = false;
let _profileLoadRunning  = false;
let _initialSessionSeen  = false; // Supabase v2 émet un SIGNED_IN bidon au refresh AVANT INITIAL_SESSION — on l'ignore

// ── Démarrage ─────────────────────────────────────
// Si le hash indique que l'utilisateur était connecté, on affiche le spinner
// pendant que Supabase rafraîchit le JWT et qu'on charge le profil.
if (location.hash === '#dashboard' || location.hash === '#profile') {
  document.getElementById('view-onboarding')?.classList.add('hidden');
  document.getElementById('view-loading')?.classList.remove('hidden');
}

// ── Auth state ────────────────────────────────────
// Gère tous les événements qui portent une session valide.
// _profileLoadRunning évite les doubles appels si plusieurs événements
// (INITIAL_SESSION + SIGNED_IN, ou init() + TOKEN_REFRESHED) arrivent ensemble.
sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    _expectSignedOut = false;
    return;
  }

  // Supabase v2 émet parfois SIGNED_IN AVANT INITIAL_SESSION au refresh,
  // mais le JWT n'est pas encore prêt → la requête hang. On l'ignore et
  // on attend INITIAL_SESSION qui fire juste après avec un état stable.
  if (event === 'SIGNED_IN' && !_initialSessionSeen) {
    return;
  }

  if (event === 'INITIAL_SESSION') {
    _initialSessionSeen = true;
  }

  if (session?.user && !state.objectif && !_profileLoadRunning) {
    currentUser = session.user;
    renderAuthHeader();
    await loadProfile();
  } else if (!session?.user && event === 'INITIAL_SESSION') {
    renderAuthHeader();
    showView('onboarding');
  }
});

// Fallback : getSession() force le rafraîchissement JWT si expiré et déclenche
// loadProfile() si onAuthStateChange n'a pas encore répondu.
(async function init() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    _initialSessionSeen = true; // après init(), tout SIGNED_IN est légitime
    if (session?.user && !state.objectif && !_profileLoadRunning) {
      currentUser = session.user;
      renderAuthHeader();
      await loadProfile();
    } else if (!session?.user && !state.objectif) {
      renderAuthHeader();
      showView('onboarding');
    }
  } catch (e) {
    _initialSessionSeen = true;
    renderAuthHeader();
    showView('onboarding');
  }
})();

// ── Reset UI state ────────────────────────────────
function resetState() {
  state.genre    = 'male';
  state.age      = null;
  state.taille   = null;
  state.poids    = null;
  state.activite = 1.55;
  state.objectif = null;
  state.jours    = 4;
  state.prenom   = null;
  state.nom      = null;
  state.niveau   = 'debutant';
  state.exerciseSwaps = {};
  state.daySwaps      = [0, 1, 2, 3, 4, 5, 6];

  const ageEl    = document.getElementById('age');
  const tailleEl = document.getElementById('taille');
  const poidsEl  = document.getElementById('poids');
  if (ageEl)    ageEl.value = '';
  if (tailleEl) tailleEl.value = '';
  if (poidsEl)  poidsEl.value = '';

  document.querySelectorAll('.genre-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.value === 'male')
  );
  document.querySelectorAll('.objectif-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('days-section')?.classList.add('hidden');
}

// ── Header ────────────────────────────────────────
function renderAuthHeader() {
  const el = document.getElementById('auth-header');
  if (!currentUser) {
    el.innerHTML = `
      <button class="btn-auth" onclick="openAuthModal('login')">Connexion</button>
      <button class="btn-primary" style="padding:8px 16px;font-size:13px" onclick="openAuthModal('signup')">Créer un compte</button>`;
  } else {
    const initials = currentUser.email.slice(0, 2).toUpperCase();
    el.innerHTML = `
      <span class="user-avatar">${initials}</span>
      <span class="user-email">${currentUser.email}</span>
      <button class="btn-auth" onclick="signOut()">Déconnexion</button>`;
  }
}

// ── Auth modal ────────────────────────────────────
function openAuthModal(tab = 'login') {
  document.getElementById('auth-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  switchAuthTab(tab);
}
function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0) === (tab === 'login'));
  });
  document.getElementById('auth-form-area').innerHTML = tab === 'login' ? `
    <div class="field-group mb-4"><label>Email</label><div class="input-with-unit" style="margin-top:6px"><input type="email" id="auth-email" placeholder="toi@email.com" style="padding:12px 16px"/></div></div>
    <div class="field-group mb-6"><label>Mot de passe</label><div class="input-with-unit" style="margin-top:6px"><input type="password" id="auth-pwd" placeholder="••••••••" style="padding:12px 16px"/></div></div>
    <div id="auth-error" class="hidden mb-4 text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg"></div>
    <button class="btn-primary w-full" onclick="signIn()">Se connecter</button>
    <p class="text-center text-gray-500 text-sm mt-4">Pas encore de compte ? <button class="text-orange-400 font-semibold" onclick="switchAuthTab('signup')">S'inscrire</button></p>
  ` : `
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="field-group"><label>Prénom</label><div class="input-with-unit" style="margin-top:6px"><input type="text" id="auth-prenom" placeholder="Jean" style="padding:12px 16px"/></div></div>
      <div class="field-group"><label>Nom</label><div class="input-with-unit" style="margin-top:6px"><input type="text" id="auth-nom" placeholder="Dupont" style="padding:12px 16px"/></div></div>
    </div>
    <div class="field-group mb-4"><label>Email</label><div class="input-with-unit" style="margin-top:6px"><input type="email" id="auth-email" placeholder="toi@email.com" style="padding:12px 16px"/></div></div>
    <div class="field-group mb-6"><label>Mot de passe <span style="color:#6b7280;font-weight:400">(min. 6 caractères)</span></label><div class="input-with-unit" style="margin-top:6px"><input type="password" id="auth-pwd" placeholder="••••••••" style="padding:12px 16px"/></div></div>
    <div id="auth-error" class="hidden mb-4 text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg"></div>
    <button class="btn-primary w-full" onclick="signUp()">Créer mon compte</button>
    <p class="text-center text-gray-500 text-sm mt-4">Déjà un compte ? <button class="text-orange-400 font-semibold" onclick="switchAuthTab('login')">Se connecter</button></p>
  `;
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const pwd   = document.getElementById('auth-pwd').value;
  const err   = document.getElementById('auth-error');
  err.classList.add('hidden');

  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
    if (error) throw error;
    closeAuthModal();
    showToast('✓ Connecté !');
  } catch (e) {
    console.error('[FitPlan] signIn:', e);
    err.textContent = e.message?.includes('Invalid login') ? 'Email ou mot de passe incorrect.' : `Erreur : ${e.message}`;
    err.classList.remove('hidden');
  }
}

async function signUp() {
  const prenom = document.getElementById('auth-prenom').value.trim();
  const nom    = document.getElementById('auth-nom').value.trim();
  const email  = document.getElementById('auth-email').value.trim();
  const pwd    = document.getElementById('auth-pwd').value;
  const err    = document.getElementById('auth-error');
  err.classList.add('hidden');

  if (!prenom) { err.textContent = 'Prénom requis.';                 err.classList.remove('hidden'); return; }
  if (!nom)    { err.textContent = 'Nom requis.';                    err.classList.remove('hidden'); return; }
  if (pwd.length < 6) { err.textContent = 'Mot de passe trop court (min. 6 caractères).'; err.classList.remove('hidden'); return; }

  try {
    const { error } = await sb.auth.signUp({
      email, password: pwd,
      options: { data: { prenom, nom } },
    });
    if (error) throw error;
    state.prenom = prenom;
    state.nom    = nom;
    closeAuthModal();
    showToast('✓ Compte créé ! Vérifie ta boîte mail pour confirmer.');
  } catch (e) {
    console.error('[FitPlan] signUp:', e);
    err.textContent = `Erreur : ${e.message}`;
    err.classList.remove('hidden');
  }
}

function signOut() {
  _expectSignedOut    = true;
  _profileLoadRunning = false;
  currentUser = null;
  renderAuthHeader();
  resetState();
  document.getElementById('main-nav').classList.add('hidden');
  goToOnboardingStep(1);
  showView('onboarding');
  showToast('À bientôt !');

  // Vider la session du localStorage immédiatement pour que le refresh
  // affiche bien la page déconnectée, même si Supabase est lent
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-'))
    .forEach(k => localStorage.removeItem(k));

  sb.auth.signOut().catch(e => {
    console.error('[FitPlan] signOut:', e);
    _expectSignedOut = false;
  });
}

// ── Profile persistence ───────────────────────────
async function loadProfile() {
  if (!currentUser || _profileLoadRunning) return;
  _profileLoadRunning = true;

  try {
    const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();

    // PGRST116 = aucune ligne (premier passage) → onboarding normal
    if (error && error.code === 'PGRST116') {
      goToOnboardingStep(1);
      showView('onboarding');
      return;
    }

    if (error) {
      console.error('[FitPlan] loadProfile error:', error);
      showToast('⚠️ Erreur chargement profil — ' + error.message);
      goToOnboardingStep(1);
      showView('onboarding');
      return;
    }

    if (!data?.objectif) {
      goToOnboardingStep(1);
      showView('onboarding');
      return;
    }

    // Restaurer l'état depuis la base
    if (data.prenom) state.prenom = data.prenom;
    if (data.nom)    state.nom    = data.nom;
    if (data.niveau) state.niveau = data.niveau;
    // Fallback : récupère depuis user_metadata si jamais loadProfile arrive avant le 1er save
    if (!state.prenom && currentUser?.user_metadata?.prenom) state.prenom = currentUser.user_metadata.prenom;
    if (!state.nom    && currentUser?.user_metadata?.nom)    state.nom    = currentUser.user_metadata.nom;
    if (data.genre)  {
      state.genre = data.genre;
      document.querySelectorAll('.genre-btn').forEach(b => b.classList.toggle('active', b.dataset.value === data.genre));
    }
    if (data.age)    { state.age    = data.age;    document.getElementById('age').value    = data.age; }
    if (data.taille) { state.taille = data.taille; document.getElementById('taille').value = data.taille; }
    if (data.poids)  { state.poids  = data.poids;  document.getElementById('poids').value  = data.poids; }
    if (data.activite) {
      const act = parseFloat(data.activite);
      state.activite = act;
      document.getElementById('activite').value = act;
    }
    if (data.objectif) {
      state.objectif = data.objectif;
      const card = document.querySelector(`.objectif-card[data-value="${data.objectif}"]`);
      if (card) { card.classList.add('selected'); showDaysSection(); }
    }
    if (data.jours) { state.jours = data.jours; setJours(data.jours); }

    // Charger les personnalisations (swaps d'exercices / jours) depuis localStorage
    loadCustomizations();

    // Restaurer le niveau dans l'UI
    document.querySelectorAll('.niveau-btn').forEach(b => b.classList.toggle('active', b.dataset.niveau === state.niveau));

    renderDashboard();
    renderProfile();
    document.getElementById('main-nav').classList.remove('hidden');
    showView('dashboard');
    loadHistory();
    loadLastLogs();
    renderProgression();
  } catch (e) {
    console.error('[FitPlan] loadProfile exception:', e);
    showToast('⚠️ Impossible de charger le profil. Vérifie ta connexion.');
    goToOnboardingStep(1);
    showView('onboarding');
  } finally {
    _profileLoadRunning = false;
  }
}

async function saveProfile() {
  if (!currentUser) return;

  try {
    const { error } = await sb.from('profiles').upsert({
      id: currentUser.id,
      prenom: state.prenom, nom: state.nom, niveau: state.niveau,
      genre: state.genre, age: state.age, taille: state.taille, poids: state.poids,
      activite: state.activite, objectif: state.objectif, jours: state.jours,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[FitPlan] saveProfile error:', error);
      showToast('⚠️ Erreur sauvegarde profil — ' + error.message);
    }
  } catch (e) {
    console.error('[FitPlan] saveProfile exception:', e);
    showToast('⚠️ Impossible de sauvegarder. Vérifie ta connexion.');
  }
}

// Intercept generateAndGo pour sauvegarder après
const _origGenerate = generateAndGo;
window.generateAndGo = async function () {
  _origGenerate();
  await saveProfile();
  loadHistory();
};

// ── Session logging ───────────────────────────────
function startSession() {
  if (!currentUser) { openAuthModal('login'); showToast('⚠️ Connecte-toi pour enregistrer tes séances'); return; }

  const programme = getCustomProgramme();
  const todayIdx  = (new Date().getDay() + 6) % 7;
  const todayProg = programme[todayIdx];

  if (todayProg.type === 'rest') {
    openRestModal(programme);
    return;
  }

  launchSession(todayProg.label, todayProg.exercices);
}

function openRestModal() {
  const modal = document.getElementById('rest-modal');
  const grid  = document.getElementById('rest-session-grid');
  grid.innerHTML = CUSTOM_SESSIONS.map(s => `
    <button class="rest-session-btn" onclick="launchSession('${s.label}', CUSTOM_SESSIONS.find(x=>x.key==='${s.key}').exercices); closeRestModal()">
      <span style="font-size:22px">${s.icon}</span>
      <span>${s.label}</span>
    </button>`).join('');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeRestModal() {
  document.getElementById('rest-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function launchSession(label, exercices) {
  // Enrichit chaque exo avec un _setCount éditable (par défaut le nombre de séries du programme)
  activeSession = {
    label,
    exercices: exercices.map(ex => ({
      ...ex,
      _setCount: Math.min(parseInt(ex.sets?.match(/\d+/)?.[0]) || 3, 5),
    })),
    logs: {},
  };
  // Pré-remplit les logs avec les valeurs suggérées pour que tout soit sauvegardable
  activeSession.exercices.forEach((ex, i) => {
    if (!ex.muscle) return; // cardio géré séparément
    const def = getSetDefaults(ex);
    if (!def.weight) return;
    activeSession.logs[i] = {};
    for (let s = 0; s < ex._setCount; s++) {
      activeSession.logs[i][s] = { weight: def.weight, reps: def.reps };
    }
  });

  document.getElementById('session-title').textContent = label;
  document.getElementById('session-card').classList.remove('hidden');
  renderActiveSession();
  document.getElementById('session-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderActiveSession() {
  document.getElementById('session-log').innerHTML = activeSession.exercices.map((ex, i) => {
    const isCardio = !ex.muscle;

    if (isCardio) {
      const done = activeSession.logs[i]?.[0]?.done;
      return `
        <div class="session-exercise">
          <div class="session-ex-header">
            <div style="flex:1;min-width:0"><span class="session-ex-name">${ex.nom}</span></div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="session-ex-sets-label">${ex.sets}</span>
              <button class="session-rm-btn" onclick="removeSessionExercise(${i})" title="Retirer">✕</button>
            </div>
          </div>
          <div class="cardio-done-row">
            <label class="cardio-check-label">
              <input type="checkbox" ${done ? 'checked' : ''} onchange="logCardio(${i}, this.checked)" style="width:18px;height:18px;accent-color:#f97316;cursor:pointer"/>
              <span>Effectué</span>
            </label>
          </div>
        </div>`;
    }

    const hint = _lastExerciseLogs[ex.nom]
      ? '<span style="color:#6b7280;font-size:11px">basé sur la dernière fois</span>'
      : `<span style="color:#6b7280;font-size:11px">suggéré · ${state.niveau}</span>`;

    const rows = Array.from({ length: ex._setCount }, (_, s) => {
      const log = activeSession.logs[i]?.[s] || {};
      return `
        <div class="set-row">
          <span class="set-num">Série ${s + 1}</span>
          <div class="input-with-unit" style="flex:1">
            <input type="number" value="${log.weight ?? ''}" placeholder="kg" min="0" step="0.5" onchange="logSet(${i},${s},'weight',this.value)" style="padding:8px 12px;font-size:14px"/>
            <span>kg</span>
          </div>
          <div class="input-with-unit" style="flex:1">
            <input type="number" value="${log.reps ?? ''}" placeholder="reps" min="1" onchange="logSet(${i},${s},'reps',this.value)" style="padding:8px 12px;font-size:14px"/>
            <span>rép</span>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="session-exercise">
        <div class="session-ex-header">
          <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0">
            <span class="session-ex-name">${ex.nom}</span>
            ${hint}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span class="session-ex-sets-label">${ex._setCount}×</span>
            <button class="session-rm-btn" onclick="removeSessionExercise(${i})" title="Retirer l'exercice">✕</button>
          </div>
        </div>
        <div class="session-sets-input">${rows}</div>
        <div class="session-set-actions">
          <button class="btn-set-toggle" onclick="removeSet(${i})" ${ex._setCount <= 1 ? 'disabled' : ''}>− Série</button>
          <button class="btn-set-toggle" onclick="addSet(${i})"    ${ex._setCount >= 8 ? 'disabled' : ''}>+ Série</button>
        </div>
      </div>`;
  }).join('');

  if (activeSession.exercices.length === 0) {
    document.getElementById('session-log').innerHTML =
      '<p style="text-align:center;color:#6b7280;padding:20px 0;font-size:14px">Tous les exercices ont été retirés. Annule ou enregistre une séance vide.</p>';
  }
}

function removeSessionExercise(idx) {
  const name = activeSession.exercices[idx]?.nom ?? '';
  if (!confirm(`Retirer "${name}" de cette séance ?`)) return;
  activeSession.exercices.splice(idx, 1);
  // Réindexe les logs (les clés > idx descendent de 1)
  const next = {};
  Object.entries(activeSession.logs).forEach(([k, v]) => {
    const n = parseInt(k);
    if (n === idx) return;
    next[n > idx ? n - 1 : n] = v;
  });
  activeSession.logs = next;
  renderActiveSession();
}

function removeSet(exIdx) {
  const ex = activeSession.exercices[exIdx];
  if (!ex || ex._setCount <= 1) return;
  if (activeSession.logs[exIdx]) delete activeSession.logs[exIdx][ex._setCount - 1];
  ex._setCount--;
  renderActiveSession();
}

function addSet(exIdx) {
  const ex = activeSession.exercices[exIdx];
  if (!ex || ex._setCount >= 8) return;
  // Copie les valeurs de la dernière série comme défaut
  if (activeSession.logs[exIdx]?.[ex._setCount - 1]) {
    activeSession.logs[exIdx][ex._setCount] = { ...activeSession.logs[exIdx][ex._setCount - 1] };
  }
  ex._setCount++;
  renderActiveSession();
}

function logSet(exIdx, setIdx, field, value) {
  if (!activeSession.logs[exIdx]) activeSession.logs[exIdx] = {};
  if (!activeSession.logs[exIdx][setIdx]) activeSession.logs[exIdx][setIdx] = {};
  const v = parseFloat(value);
  if (isNaN(v) || value === '') delete activeSession.logs[exIdx][setIdx][field];
  else activeSession.logs[exIdx][setIdx][field] = v;
}

function logCardio(exIdx, done) {
  if (!activeSession.logs[exIdx]) activeSession.logs[exIdx] = {};
  activeSession.logs[exIdx][0] = { done };
}

function cancelSession() {
  activeSession = null;
  document.getElementById('session-card').classList.add('hidden');
}

async function saveSession() {
  // Re-vérifier la session si currentUser a été effacé par une race condition
  if (!currentUser) {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (user) currentUser = user;
    } catch { /* ignore */ }
  }
  if (!currentUser) {
    showToast('⚠️ Connecte-toi pour enregistrer ta séance');
    openAuthModal('login');
    return;
  }
  if (!activeSession) { showToast('⚠️ Aucune séance active'); return; }

  try {
    const { data: session, error } = await sb.from('sessions').insert({
      user_id: currentUser.id,
      objectif: state.objectif,
      jours: state.jours,
      label: activeSession.label,
    }).select().single();

    if (error) throw error;

    const logs = activeSession.exercices
      .map((ex, i) => ({
        session_id:    session.id,
        user_id:       currentUser.id,
        exercise_name: ex.nom,
        sets:          Object.values(activeSession.logs[i] ?? {}),
      }))
      .filter(l => l.sets.length > 0);

    if (logs.length > 0) {
      const { error: logErr } = await sb.from('exercise_logs').insert(logs);
      if (logErr) console.error('[FitPlan] exercise_logs error:', logErr);
    }

    cancelSession();
    showToast('✓ Séance enregistrée !');
    loadHistory();
    loadLastLogs();
    renderProgression();
  } catch (e) {
    console.error('[FitPlan] saveSession error:', e);
    showToast('❌ ' + (e.message ?? 'Erreur sauvegarde — vérifie la console'));
  }
}

// ── Dernières perfs par exercice (pour pré-remplir les séances) ──
async function loadLastLogs() {
  if (!currentUser) { _lastExerciseLogs = {}; return; }
  try {
    const { data: sessions } = await sb.from('sessions')
      .select('id, created_at, exercise_logs(exercise_name, sets)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(30);
    const seen = {};
    for (const sess of sessions || []) {
      for (const log of sess.exercise_logs || []) {
        if (seen[log.exercise_name]) continue;
        const bestSet = (log.sets || []).reduce(
          (a, b) => (b?.weight ?? 0) > (a?.weight ?? 0) ? b : a, {}
        );
        if (bestSet?.weight) seen[log.exercise_name] = { weight: bestSet.weight, reps: bestSet.reps };
      }
    }
    _lastExerciseLogs = seen;
  } catch (e) {
    console.error('[FitPlan] loadLastLogs:', e);
  }
}

// ── Progression hebdomadaire ──────────────────────
async function renderProgression() {
  const el = document.getElementById('dash-progression');
  if (!el || !currentUser) return;
  const now = Date.now();
  const oneWeekAgo  = new Date(now - 7  * 24 * 3600 * 1000);
  const twoWeeksAgo = new Date(now - 14 * 24 * 3600 * 1000);

  try {
    const { data: sessions, error } = await sb.from('sessions')
      .select('created_at, exercise_logs(exercise_name, sets)')
      .eq('user_id', currentUser.id)
      .gte('created_at', twoWeeksAgo.toISOString());
    if (error) throw error;

    const vol = { now: {}, prev: {} };
    for (const sess of sessions || []) {
      const bucket = new Date(sess.created_at) >= oneWeekAgo ? 'now' : 'prev';
      for (const log of sess.exercise_logs || []) {
        const total = (log.sets || []).reduce(
          (s, set) => s + (set?.weight || 0) * (set?.reps || 0), 0
        );
        if (total > 0) vol[bucket][log.exercise_name] = (vol[bucket][log.exercise_name] || 0) + total;
      }
    }

    const names = new Set([...Object.keys(vol.now), ...Object.keys(vol.prev)]);
    if (names.size === 0) {
      el.innerHTML = '<p style="color:#6b7280;font-size:13px;padding:8px 0">Enregistre quelques séances pour voir ta progression.</p>';
      return;
    }

    const rows = [...names].map(nom => {
      const t = vol.now[nom]  || 0;
      const l = vol.prev[nom] || 0;
      const change = l > 0 ? ((t - l) / l) * 100 : (t > 0 ? 100 : -100);
      const dir = !l && t ? 'new' : change > 2 ? 'up' : change < -2 ? 'down' : 'flat';
      return { nom, t, l, change, dir };
    }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    const arrow = { up:'↑', down:'↓', flat:'→', new:'✨' };
    el.innerHTML = `<div class="prog-grid">` + rows.map(r => `
      <div class="prog-item prog-${r.dir}">
        <div class="prog-name">${r.nom}</div>
        <div class="prog-stats">
          <span class="prog-vol">${Math.round(r.t)} <span style="color:#6b7280;font-weight:400">vs ${Math.round(r.l)}</span></span>
          <span class="prog-change">${arrow[r.dir]} ${r.dir === 'new' ? 'Nouveau' : Math.abs(r.change).toFixed(0) + '%'}</span>
        </div>
      </div>`).join('') + '</div>';
  } catch (e) {
    console.error('[FitPlan] renderProgression:', e);
    el.innerHTML = '<p style="color:#9ca3af;font-size:13px">⚠️ Erreur chargement progression.</p>';
  }
}

// ── Historique ────────────────────────────────────
async function loadHistory() {
  if (!currentUser) return;

  try {
    const { data: sessions, error } = await sb
      .from('sessions').select('*, exercise_logs(*)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!sessions?.length) {
      const empty = '<p style="color:#6b7280;font-size:13px">Aucune séance enregistrée pour l\'instant.</p>';
      ['dash-history', 'profile-history'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = empty;
      });
      return;
    }

    const makeHtml = (list) => list.map(s => {
      const date    = new Date(s.created_at).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
      const exCount = s.exercise_logs?.length ?? 0;
      return `
        <div class="history-item" onclick="openSessionDetail('${s.id}')" title="Voir le détail">
          <div class="history-date">${date}</div>
          <div class="history-label">${s.label}</div>
          <div class="history-meta">${exCount} exercice${exCount > 1 ? 's' : ''} →</div>
        </div>`;
    }).join('');

    const dashHistory = document.getElementById('dash-history');
    if (dashHistory) dashHistory.innerHTML = makeHtml(sessions.slice(0, 3));

    const profileHistory = document.getElementById('profile-history');
    if (profileHistory) profileHistory.innerHTML = makeHtml(sessions);
  } catch (e) {
    console.error('[FitPlan] loadHistory error:', e);
  }
}

// ── Détail d'une séance passée ────────────────────
async function openSessionDetail(sessionId) {
  const modal = document.getElementById('session-detail-modal');
  const body  = document.getElementById('session-detail-body');
  const title = document.getElementById('session-detail-title');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Chargement…</p></div>';
  title.textContent = 'Détail de la séance';

  try {
    const { data: session, error } = await sb.from('sessions')
      .select('*, exercise_logs(*)')
      .eq('id', sessionId)
      .single();
    if (error) throw error;

    const date = new Date(session.created_at).toLocaleDateString('fr-FR', {
      weekday:'long', day:'numeric', month:'long', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });
    title.textContent = session.label || 'Séance';

    const logs = session.exercise_logs || [];
    if (logs.length === 0) {
      body.innerHTML = `<p style="color:#6b7280;font-size:13px;margin-bottom:8px">${date}</p>
        <p style="color:#9ca3af;text-align:center;padding:20px 0">Aucun exercice enregistré.</p>`;
      return;
    }

    // Volume total
    let totalVol = 0, totalSets = 0;
    logs.forEach(log => (log.sets || []).forEach(set => {
      if (set?.weight && set?.reps) { totalVol += set.weight * set.reps; totalSets++; }
    }));

    body.innerHTML = `
      <p style="color:#6b7280;font-size:13px;margin-bottom:14px">${date}</p>
      <div class="detail-summary">
        <div class="detail-stat"><div class="detail-stat-val">${logs.length}</div><div class="detail-stat-lab">Exercices</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${totalSets}</div><div class="detail-stat-lab">Séries</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${Math.round(totalVol)}</div><div class="detail-stat-lab">Volume kg·rép</div></div>
      </div>
      ${logs.map(log => {
        const sets = log.sets || [];
        const setsHtml = sets.map((set, si) => {
          if (!set) return '';
          if (set.done !== undefined) {
            return `<div class="detail-set"><span class="detail-set-num">${si+1}</span><span class="detail-set-val">${set.done ? '✓ Effectué' : '✗ Non effectué'}</span></div>`;
          }
          const parts = [];
          if (set.weight) parts.push(`<span class="detail-set-val">${set.weight} kg</span>`);
          if (set.reps)   parts.push(`<span class="detail-set-val">${set.reps} rép</span>`);
          if (!parts.length) return '';
          return `<div class="detail-set"><span class="detail-set-num">S${si+1}</span>${parts.join('')}</div>`;
        }).filter(Boolean).join('');
        return `
          <div class="detail-exercise">
            <div class="detail-ex-name">${log.exercise_name}</div>
            <div class="detail-sets">${setsHtml || '<span style="color:#6b7280;font-size:12px">Pas de données</span>'}</div>
          </div>`;
      }).join('')}`;
  } catch (e) {
    console.error('[FitPlan] openSessionDetail:', e);
    body.innerHTML = `<p style="color:#9ca3af;text-align:center;padding:20px 0">⚠️ Erreur : ${e.message}</p>`;
  }
}
function closeSessionDetail() {
  document.getElementById('session-detail-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Toast ─────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}
