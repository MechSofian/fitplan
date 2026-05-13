/* =============================================
   FitPlan — Supabase Auth + Profile + Sessions
   ============================================= */

const SUPABASE_URL  = 'https://gllhxhcxvrfxnomsylve.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbGh4aGN4dnJmeG5vbXN5bHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTUyNjcsImV4cCI6MjA5NDI3MTI2N30.YcF4TvYU3SI-MStMvpwSvy-I1Nhi3TIKz_yQ60i7ECw';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let currentUser   = null;
let activeSession = null;
let authInitialized = false;

// ── Auth state ────────────────────────────────────
sb.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  renderAuthHeader();

  if (event === 'INITIAL_SESSION') {
    // Premier chargement / refresh de page
    if (currentUser) {
      await loadProfile();
    } else {
      showView('onboarding');
    }
  } else if (event === 'SIGNED_IN') {
    // Connexion → charger le profil et router
    await loadProfile();
  }
  // SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED → géré ailleurs ou sans routing
});

// ── Reset UI state ────────────────────────────────
function resetState() {
  state.genre    = 'male';
  state.age      = null;
  state.taille   = null;
  state.poids    = null;
  state.activite = 1.55;
  state.objectif = null;
  state.jours    = 4;

  // Remettre les inputs à zéro
  const ageEl = document.getElementById('age');
  const tailleEl = document.getElementById('taille');
  const poidsEl = document.getElementById('poids');
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
  const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
  if (error) { err.textContent = 'Email ou mot de passe incorrect.'; err.classList.remove('hidden'); return; }
  closeAuthModal();
  showToast('✓ Connecté !');
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const pwd   = document.getElementById('auth-pwd').value;
  const err   = document.getElementById('auth-error');
  if (pwd.length < 6) { err.textContent = 'Mot de passe trop court (min. 6 caractères).'; err.classList.remove('hidden'); return; }
  const { error } = await sb.auth.signUp({ email, password: pwd });
  if (error) { err.textContent = error.message; err.classList.remove('hidden'); return; }
  closeAuthModal();
  showToast('✓ Compte créé ! Vérifie ta boîte mail pour confirmer.');
}

async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  renderAuthHeader();
  resetState();
  document.getElementById('main-nav').classList.add('hidden');
  goToOnboardingStep(1);
  showView('onboarding');
  showToast('À bientôt !');
}

// ── Profile persistence ───────────────────────────
async function loadProfile() {
  if (!currentUser) return;
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (!data?.objectif) {
    // Premier passage → onboarding
    goToOnboardingStep(1);
    showView('onboarding');
    return;
  }

  // Restaurer state
  if (data.genre)    { state.genre = data.genre; document.querySelectorAll('.genre-btn').forEach(b => b.classList.toggle('active', b.dataset.value === data.genre)); }
  if (data.age)      { state.age = data.age;         document.getElementById('age').value = data.age; }
  if (data.taille)   { state.taille = data.taille;   document.getElementById('taille').value = data.taille; }
  if (data.poids)    { state.poids = data.poids;     document.getElementById('poids').value = data.poids; }
  if (data.activite) { state.activite = data.activite; document.getElementById('activite').value = data.activite; }
  if (data.objectif) {
    state.objectif = data.objectif;
    const card = document.querySelector(`.objectif-card[data-value="${data.objectif}"]`);
    if (card) { card.classList.add('selected'); showDaysSection(); }
  }
  if (data.jours) { state.jours = data.jours; setJours(data.jours); }

  renderDashboard();
  renderProfile();
  document.getElementById('main-nav').classList.remove('hidden');
  showView('dashboard');
  loadHistory();
}

async function saveProfile() {
  if (!currentUser) return;
  await sb.from('profiles').upsert({
    id: currentUser.id,
    genre: state.genre, age: state.age, taille: state.taille, poids: state.poids,
    activite: state.activite, objectif: state.objectif, jours: state.jours,
    updated_at: new Date().toISOString(),
  });
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

  const programme = buildProgramme(state.objectif, state.jours);
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
  activeSession = { label, exercices, logs: {} };
  document.getElementById('session-title').textContent = label;

  const card = document.getElementById('session-card');
  card.classList.remove('hidden');

  document.getElementById('session-log').innerHTML = exercices.map((ex, i) => {
    const isCardio = !ex.muscle;

    if (isCardio) {
      return `
        <div class="session-exercise">
          <div class="session-ex-header">
            <span class="session-ex-name">${ex.nom}</span>
            <span class="session-ex-sets-label">${ex.sets}</span>
          </div>
          <div class="cardio-done-row">
            <label class="cardio-check-label">
              <input type="checkbox" onchange="logCardio(${i}, this.checked)" style="width:18px;height:18px;accent-color:#f97316;cursor:pointer"/>
              <span>Effectué</span>
            </label>
          </div>
        </div>`;
    }

    const setCount = parseInt(ex.sets?.match(/\d+/)?.[0]) || 3;
    const rows = Array.from({ length: Math.min(setCount, 5) }, (_, s) => `
      <div class="set-row">
        <span class="set-num">Série ${s + 1}</span>
        <div class="input-with-unit" style="flex:1">
          <input type="number" placeholder="kg" min="0" step="0.5" onchange="logSet(${i},${s},'weight',this.value)" style="padding:8px 12px;font-size:14px"/>
          <span>kg</span>
        </div>
        <div class="input-with-unit" style="flex:1">
          <input type="number" placeholder="reps" min="1" onchange="logSet(${i},${s},'reps',this.value)" style="padding:8px 12px;font-size:14px"/>
          <span>rép</span>
        </div>
      </div>`).join('');
    return `
      <div class="session-exercise">
        <div class="session-ex-header">
          <span class="session-ex-name">${ex.nom}</span>
          <span class="session-ex-sets-label">${ex.sets}</span>
        </div>
        <div class="session-sets-input">${rows}</div>
      </div>`;
  }).join('');

  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function logSet(exIdx, setIdx, field, value) {
  if (!activeSession.logs[exIdx]) activeSession.logs[exIdx] = {};
  if (!activeSession.logs[exIdx][setIdx]) activeSession.logs[exIdx][setIdx] = {};
  activeSession.logs[exIdx][setIdx][field] = parseFloat(value);
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
  if (!currentUser) { showToast('⚠️ Connecte-toi pour enregistrer'); return; }
  if (!activeSession) { showToast('⚠️ Aucune séance active'); return; }

  const { data: session, error } = await sb.from('sessions').insert({
    user_id: currentUser.id,
    objectif: state.objectif,
    jours: state.jours,
    label: activeSession.label,
  }).select().single();

  if (error) {
    console.error('[FitPlan] saveSession error:', error);
    showToast('❌ ' + (error.message ?? 'Erreur sauvegarde — vérifie la console'));
    return;
  }

  // Log les exercices où au moins une série a été renseignée
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
}

// ── Historique ────────────────────────────────────
async function loadHistory() {
  if (!currentUser) return;
  const { data: sessions } = await sb
    .from('sessions').select('*, exercise_logs(*)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!sessions?.length) {
    const empty = '<p style="color:#6b7280;font-size:13px">Aucune séance enregistrée pour l\'instant.</p>';
    ['dash-history', 'profile-history'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = empty;
    });
    return;
  }

  const html = sessions.map(s => {
    const date     = new Date(s.created_at).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
    const exCount  = s.exercise_logs?.length ?? 0;
    return `
      <div class="history-item">
        <div class="history-date">${date}</div>
        <div class="history-label">${s.label}</div>
        <div class="history-meta">${exCount} exercice${exCount > 1 ? 's' : ''}</div>
      </div>`;
  }).join('');

  const dashHistory = document.getElementById('dash-history');
  if (dashHistory) dashHistory.innerHTML = sessions.length ? html.split('</div>').slice(0,5).join('</div>') + '</div>' : '<p style="color:#6b7280;font-size:13px">Aucune séance.</p>';

  const profileHistory = document.getElementById('profile-history');
  if (profileHistory) profileHistory.innerHTML = html;
}

// ── Toast ─────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}
