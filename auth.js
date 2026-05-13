/* =============================================
   FitPlan — Supabase Auth + Profile + Sessions
   ============================================= */

const SUPABASE_URL  = 'https://gllhxhcxvrfxnomsylve.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsbGh4aGN4dnJmeG5vbXN5bHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTUyNjcsImV4cCI6MjA5NDI3MTI2N30.YcF4TvYU3SI-MStMvpwSvy-I1Nhi3TIKz_yQ60i7ECw';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser  = null;
let activeSession = null; // séance en cours

// ── Init ──────────────────────────────────────────
sb.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user ?? null;
  renderAuthHeader();
  if (currentUser) {
    await loadProfile();
    loadHistory();
  }
});

// ── Header auth ───────────────────────────────────
function renderAuthHeader() {
  const el = document.getElementById('auth-header');
  if (!currentUser) {
    el.innerHTML = `<button class="btn-auth" onclick="openAuthModal('login')">Connexion</button>
                    <button class="btn-primary" style="padding:8px 16px;font-size:13px" onclick="openAuthModal('signup')">Créer un compte</button>`;
  } else {
    const email = currentUser.email;
    const initials = email.slice(0, 2).toUpperCase();
    el.innerHTML = `
      <span class="user-avatar">${initials}</span>
      <span class="user-email">${email}</span>
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
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
  });

  const area = document.getElementById('auth-form-area');

  if (tab === 'login') {
    area.innerHTML = `
      <div class="field-group mb-4">
        <label for="auth-email">Email</label>
        <div class="input-with-unit" style="margin-top:6px">
          <input type="email" id="auth-email" placeholder="toi@email.com" style="padding:12px 16px" />
        </div>
      </div>
      <div class="field-group mb-6">
        <label for="auth-pwd">Mot de passe</label>
        <div class="input-with-unit" style="margin-top:6px">
          <input type="password" id="auth-pwd" placeholder="••••••••" style="padding:12px 16px" />
        </div>
      </div>
      <div id="auth-error" class="hidden mb-4 text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg"></div>
      <button class="btn-primary w-full" onclick="signIn()">Se connecter</button>
      <p class="text-center text-gray-500 text-sm mt-4">Pas encore de compte ? <button class="text-orange-400 font-semibold" onclick="switchAuthTab('signup')">S'inscrire</button></p>`;
  } else {
    area.innerHTML = `
      <div class="field-group mb-4">
        <label for="auth-email">Email</label>
        <div class="input-with-unit" style="margin-top:6px">
          <input type="email" id="auth-email" placeholder="toi@email.com" style="padding:12px 16px" />
        </div>
      </div>
      <div class="field-group mb-6">
        <label for="auth-pwd">Mot de passe <span style="color:#6b7280;font-weight:400">(min. 6 caractères)</span></label>
        <div class="input-with-unit" style="margin-top:6px">
          <input type="password" id="auth-pwd" placeholder="••••••••" style="padding:12px 16px" />
        </div>
      </div>
      <div id="auth-error" class="hidden mb-4 text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg"></div>
      <button class="btn-primary w-full" onclick="signUp()">Créer mon compte</button>
      <p class="text-center text-gray-500 text-sm mt-4">Déjà un compte ? <button class="text-orange-400 font-semibold" onclick="switchAuthTab('login')">Se connecter</button></p>`;
  }
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const pwd   = document.getElementById('auth-pwd').value;
  const err   = document.getElementById('auth-error');

  const { error } = await sb.auth.signInWithPassword({ email, password: pwd });
  if (error) {
    err.textContent = 'Email ou mot de passe incorrect.';
    err.classList.remove('hidden');
    return;
  }
  closeAuthModal();
  showToast('✓ Connecté !');
}

async function signUp() {
  const email = document.getElementById('auth-email').value.trim();
  const pwd   = document.getElementById('auth-pwd').value;
  const err   = document.getElementById('auth-error');

  if (pwd.length < 6) {
    err.textContent = 'Le mot de passe doit faire au moins 6 caractères.';
    err.classList.remove('hidden');
    return;
  }

  const { error } = await sb.auth.signUp({ email, password: pwd });
  if (error) {
    err.textContent = error.message;
    err.classList.remove('hidden');
    return;
  }
  closeAuthModal();
  showToast('✓ Compte créé ! Vérifie ta boîte mail pour confirmer.');
}

async function signOut() {
  await sb.auth.signOut();
  showToast('À bientôt !');
}

// ── Profile persistence ───────────────────────────
async function loadProfile() {
  if (!currentUser) return;
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (!data) return;

  // Remplir le formulaire avec les données sauvegardées
  if (data.genre) {
    state.genre = data.genre;
    document.querySelectorAll('.genre-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.value === data.genre);
    });
  }
  if (data.age)      { state.age = data.age;           document.getElementById('age').value = data.age; }
  if (data.taille)   { state.taille = data.taille;     document.getElementById('taille').value = data.taille; }
  if (data.poids)    { state.poids = data.poids;       document.getElementById('poids').value = data.poids; }
  if (data.activite) {
    state.activite = data.activite;
    document.getElementById('activite').value = data.activite;
  }
  if (data.objectif) {
    state.objectif = data.objectif;
    const card = document.querySelector(`.objectif-card[data-value="${data.objectif}"]`);
    if (card) { card.classList.add('selected'); showDaysSection(); }
  }
  if (data.jours) { state.jours = data.jours; setJours(data.jours); }
}

async function saveProfile() {
  if (!currentUser) return;
  await sb.from('profiles').upsert({
    id:       currentUser.id,
    genre:    state.genre,
    age:      state.age,
    taille:   state.taille,
    poids:    state.poids,
    activite: state.activite,
    objectif: state.objectif,
    jours:    state.jours,
    updated_at: new Date().toISOString(),
  });
}

// ── Session logging ───────────────────────────────
function startSession() {
  if (!currentUser) {
    openAuthModal('login');
    showToast('⚠️ Connecte-toi pour enregistrer tes séances');
    return;
  }

  const programme = buildProgramme(state.objectif, state.jours);
  const today     = new Date().getDay(); // 0=dim, 1=lun...
  const dayIndex  = today === 0 ? 6 : today - 1;
  const todayProg = programme[dayIndex] ?? programme[0];

  if (todayProg.type === 'rest') {
    showToast("💤 C'est jour de repos aujourd'hui !");
    return;
  }

  activeSession = { label: todayProg.label, exercices: todayProg.exercices, logs: {} };

  const card = document.getElementById('session-card');
  card.classList.remove('hidden');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  renderSessionLog();
}

function renderSessionLog() {
  const log = document.getElementById('session-log');
  if (!activeSession) return;

  log.innerHTML = `
    <p class="text-orange-400 font-semibold mb-4">${activeSession.label}</p>
    ${activeSession.exercices.map((ex, i) => `
      <div class="session-exercise" id="sexo-${i}">
        <div class="session-ex-header">
          <span class="session-ex-name">${ex.nom}</span>
          <span class="session-ex-sets-label">${ex.sets}</span>
        </div>
        <div class="session-sets-input">
          ${[1,2,3,4].slice(0, parseInt(ex.sets) || 3).map((_, s) => `
            <div class="set-row">
              <span class="set-num">Série ${s+1}</span>
              <div class="input-with-unit" style="flex:1">
                <input type="number" placeholder="kg" min="0" step="0.5"
                  onchange="logSet(${i},${s},'weight',this.value)" style="padding:8px 12px;font-size:14px" />
                <span>kg</span>
              </div>
              <div class="input-with-unit" style="flex:1">
                <input type="number" placeholder="reps" min="1"
                  onchange="logSet(${i},${s},'reps',this.value)" style="padding:8px 12px;font-size:14px" />
                <span>rép</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}`;
}

function logSet(exIndex, setIndex, field, value) {
  if (!activeSession.logs[exIndex]) activeSession.logs[exIndex] = {};
  if (!activeSession.logs[exIndex][setIndex]) activeSession.logs[exIndex][setIndex] = {};
  activeSession.logs[exIndex][setIndex][field] = parseFloat(value);
}

async function saveSession() {
  if (!currentUser || !activeSession) return;

  const { data: session, error } = await sb.from('sessions').insert({
    user_id:  currentUser.id,
    objectif: state.objectif,
    jours:    state.jours,
    label:    activeSession.label,
  }).select().single();

  if (error) { showToast('❌ Erreur lors de la sauvegarde'); return; }

  const logs = activeSession.exercices.map((ex, i) => {
    const sets = Object.values(activeSession.logs[i] ?? {});
    return { session_id: session.id, user_id: currentUser.id, exercise_name: ex.nom, sets };
  }).filter(l => l.sets.length > 0);

  if (logs.length > 0) await sb.from('exercise_logs').insert(logs);

  document.getElementById('session-card').classList.add('hidden');
  activeSession = null;
  showToast('✓ Séance enregistrée !');
  loadHistory();
}

// ── Historique ────────────────────────────────────
async function loadHistory() {
  if (!currentUser) return;

  const { data: sessions } = await sb
    .from('sessions')
    .select('*, exercise_logs(*)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!sessions?.length) return;

  const card = document.getElementById('history-card');
  card.classList.remove('hidden');

  document.getElementById('history-section').innerHTML = sessions.map(s => {
    const date = new Date(s.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const exCount = s.exercise_logs?.length ?? 0;
    return `
      <div class="history-item">
        <div class="history-date">${date}</div>
        <div class="history-label">${s.label}</div>
        <div class="history-meta">${exCount} exercice${exCount > 1 ? 's' : ''} loggé${exCount > 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
}

// ── Utils ─────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// Sauvegarder le profil quand on génère le programme
const _origGoToResults = goToResults;
window.goToResults = function() {
  _origGoToResults();
  saveProfile();
};
