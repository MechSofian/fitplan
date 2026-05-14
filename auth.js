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
if (['#dashboard', '#profile', '#agenda'].includes(location.hash)) {
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

  // Récupération de mot de passe : Supabase a établi une session temporaire
  // pour permettre la mise à jour. On affiche la modal de définition.
  if (event === 'PASSWORD_RECOVERY') {
    setTimeout(() => openSetPasswordModal(), 200);
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
  state.customExercises = [];
  state.customProgramme = null;

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
    // login & reset partagent l'onglet 0 (Connexion), signup l'onglet 1
    t.classList.toggle('active', (i === 0) === (tab !== 'signup'));
  });
  if (tab === 'reset') {
    document.getElementById('auth-form-area').innerHTML = `
      <p style="font-size:13px;color:#9ca3af;margin-bottom:14px;text-align:center">Reçois un lien par email pour redéfinir ton mot de passe.</p>
      <div class="field-group mb-6"><label>Email</label><div class="input-with-unit" style="margin-top:6px"><input type="email" id="auth-email" placeholder="toi@email.com" style="padding:12px 16px"/></div></div>
      <div id="auth-error" class="hidden mb-4 text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg"></div>
      <button class="btn-primary w-full" onclick="sendPasswordReset()">📧 Envoyer le lien</button>
      <p class="text-center text-gray-500 text-sm mt-4"><button class="text-orange-400 font-semibold" onclick="switchAuthTab('login')">← Retour à la connexion</button></p>`;
    return;
  }
  document.getElementById('auth-form-area').innerHTML = tab === 'login' ? `
    <div class="field-group mb-4"><label>Email</label><div class="input-with-unit" style="margin-top:6px"><input type="email" id="auth-email" placeholder="toi@email.com" style="padding:12px 16px"/></div></div>
    <div class="field-group mb-2"><label>Mot de passe</label><div class="input-with-unit" style="margin-top:6px"><input type="password" id="auth-pwd" placeholder="••••••••" style="padding:12px 16px"/></div></div>
    <p class="text-right mb-4"><button class="text-xs text-gray-500 hover:text-orange-400" onclick="switchAuthTab('reset')">Mot de passe oublié ?</button></p>
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

async function sendPasswordReset() {
  const email = document.getElementById('auth-email').value.trim();
  const err   = document.getElementById('auth-error');
  err.classList.add('hidden');
  if (!email) {
    err.textContent = 'Email requis.';
    err.classList.remove('hidden');
    return;
  }
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname + '#recovery',
    });
    if (error) throw error;
    closeAuthModal();
    showToast('📧 Email envoyé — vérifie ta boîte (et les spams)');
  } catch (e) {
    console.error('[FitPlan] reset:', e);
    err.textContent = `Erreur : ${e.message}`;
    err.classList.remove('hidden');
  }
}

// ─ Définir un nouveau mot de passe après clic sur le lien email
function openSetPasswordModal() {
  document.getElementById('set-pwd-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('set-pwd-input')?.focus(), 50);
}
function closeSetPasswordModal() {
  document.getElementById('set-pwd-modal').classList.add('hidden');
  document.body.style.overflow = '';
}
async function submitNewPassword() {
  const pwd  = document.getElementById('set-pwd-input').value;
  const pwd2 = document.getElementById('set-pwd-input2').value;
  const err  = document.getElementById('set-pwd-error');
  err.classList.add('hidden');
  if (!pwd || pwd.length < 6) { err.textContent = 'Min. 6 caractères.'; err.classList.remove('hidden'); return; }
  if (pwd !== pwd2)            { err.textContent = 'Les mots de passe ne correspondent pas.'; err.classList.remove('hidden'); return; }
  try {
    const { error } = await sb.auth.updateUser({ password: pwd });
    if (error) throw error;
    closeSetPasswordModal();
    showToast('✓ Mot de passe mis à jour');
    // Nettoie le hash de recovery
    history.replaceState(null, '', location.pathname);
  } catch (e) {
    err.textContent = `Erreur : ${e.message}`;
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

// ═══ Paramètres du compte ════════════════════════════
function openSettingsModal() {
  if (!currentUser) return;
  document.getElementById('settings-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('set-prenom').value = state.prenom ?? '';
  document.getElementById('set-nom').value    = state.nom ?? '';
  document.getElementById('set-email-current').textContent = currentUser.email;
  document.getElementById('set-confirmed').textContent =
    currentUser.email_confirmed_at ? '✓ Email confirmé' : '⚠ Email non confirmé';
  document.getElementById('set-confirmed').style.color =
    currentUser.email_confirmed_at ? '#4ade80' : '#fbbf24';
}
function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function saveIdentityChanges() {
  const prenom = document.getElementById('set-prenom').value.trim();
  const nom    = document.getElementById('set-nom').value.trim();
  if (!prenom) { showToast('⚠️ Prénom requis'); return; }
  state.prenom = prenom;
  state.nom    = nom;
  try {
    await saveProfile();
    renderDashboard();
    renderProfile();
    showToast('✓ Identité mise à jour');
  } catch (e) {
    showToast('❌ ' + e.message);
  }
}

async function changeEmailFlow() {
  const newEmail = prompt('Nouvel email :', currentUser.email);
  if (!newEmail || newEmail.trim() === currentUser.email) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    showToast('⚠️ Email invalide');
    return;
  }
  try {
    const { error } = await sb.auth.updateUser({ email: newEmail.trim() });
    if (error) throw error;
    showToast('📧 Lien de confirmation envoyé au NOUVEL email');
  } catch (e) {
    showToast('❌ ' + e.message);
  }
}

async function changePasswordFlow() {
  const pwd  = prompt('Nouveau mot de passe (min. 6 caractères) :');
  if (!pwd) return;
  if (pwd.length < 6) { showToast('⚠️ Min. 6 caractères'); return; }
  const pwd2 = prompt('Confirme le mot de passe :');
  if (pwd !== pwd2) { showToast('⚠️ Les mots de passe ne correspondent pas'); return; }
  try {
    const { error } = await sb.auth.updateUser({ password: pwd });
    if (error) throw error;
    showToast('✓ Mot de passe mis à jour');
  } catch (e) {
    showToast('❌ ' + e.message);
  }
}

async function deleteAccountFlow() {
  if (!confirm('⚠️ Supprimer DÉFINITIVEMENT ton compte et TOUTES tes données ?\n\nCette action est IRRÉVERSIBLE.')) return;
  const confirmWord = prompt('Pour confirmer, tape : SUPPRIMER');
  if (confirmWord !== 'SUPPRIMER') {
    showToast('Suppression annulée');
    return;
  }
  try {
    const { error } = await sb.rpc('delete_user');
    if (error) throw error;
    closeSettingsModal();
    showToast('✓ Compte supprimé. À bientôt !');
    // Vide le localStorage et déconnecte proprement
    try {
      Object.keys(localStorage).filter(k => k.startsWith('sb-') || k.startsWith('fitplan-')).forEach(k => localStorage.removeItem(k));
    } catch {}
    setTimeout(() => { sb.auth.signOut(); location.reload(); }, 1500);
  } catch (e) {
    console.error('[FitPlan] deleteAccount:', e);
    showToast('❌ ' + (e.message ?? 'Erreur — la fonction delete_user existe-t-elle ?'));
  }
}

// ═══ Banner email non confirmé ═══════════════════════
async function resendConfirmation() {
  if (!currentUser) return;
  try {
    const { error } = await sb.auth.resend({ type: 'signup', email: currentUser.email });
    if (error) throw error;
    showToast('📧 Email de confirmation renvoyé');
  } catch (e) {
    showToast('❌ ' + e.message);
  }
}
function updateEmailBanner() {
  const banner = document.getElementById('email-confirm-banner');
  if (!banner) return;
  banner.classList.toggle('hidden', !currentUser || !!currentUser.email_confirmed_at);
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
    if (data.custom_programme && Array.isArray(data.custom_programme) && data.custom_programme.length === 7) {
      state.customProgramme = data.custom_programme;
    }
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

    // Chargement parallèle des données dérivées avant le 1er render
    await Promise.all([loadStreak(), loadPRs(), loadBodyWeights()]);

    renderDashboard();
    renderProfile();
    renderBodyWeightCard();
    document.getElementById('main-nav').classList.remove('hidden');
    const initialView = location.hash === '#profile' ? 'profile'
                      : location.hash === '#agenda'  ? 'calendar'
                      : 'dashboard';
    showView(initialView);
    updateEmailBanner();
    if (initialView === 'dashboard' && typeof maybeShowTutorial === 'function') maybeShowTutorial();
    await loadHistory();
    loadLastLogs();
    renderProgression();
    renderStagnation();
    renderVolumeByMuscle();
    renderBadges();
    renderHeatmap();
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
      custom_programme: state.customProgramme,
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
          <button class="btn-rest-start" onclick="startRestTimer(${getRestTime(ex)})">⏱ Repos ${getRestTime(ex)}s</button>
        </div>
      </div>`;
  }).join('');

  if (activeSession.exercices.length === 0) {
    document.getElementById('session-log').innerHTML =
      '<p style="text-align:center;color:#6b7280;padding:20px 0;font-size:14px">Tous les exercices ont été retirés. Annule ou enregistre une séance vide.</p>';
  }

  // Champ notes en bas
  const notesHtml = `
    <div class="session-notes-block">
      <label class="session-notes-label">📝 Notes <span style="color:#6b7280;font-weight:400">(sensations, douleurs, énergie…)</span></label>
      <textarea class="session-notes-textarea" placeholder="Ex: super forme, +5kg au bench…" oninput="activeSession.notes = this.value">${activeSession.notes ?? ''}</textarea>
    </div>`;
  document.getElementById('session-log').insertAdjacentHTML('beforeend', notesHtml);
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
  restTimerStop();
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
    const notes = activeSession.notes?.trim() || null;
    const { data: session, error } = await sb.from('sessions').insert({
      user_id: currentUser.id,
      objectif: state.objectif,
      jours: state.jours,
      label: activeSession.label,
      notes,
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
    // Détection des nouveaux PR
    const beforePRs = JSON.parse(JSON.stringify(_personalRecords));
    await loadPRs();
    const newPRs = [];
    for (const [name, r] of Object.entries(_personalRecords)) {
      const old = beforePRs[name] || { maxWeight: 0, est1RM: 0 };
      if (r.maxWeight > (old.maxWeight ?? 0)) {
        newPRs.push({ name, weight: r.maxWeight, reps: r.maxReps });
      }
    }
    if (newPRs.length > 0) {
      const p = newPRs[0];
      setTimeout(() => showToast(`🏆 NOUVEAU PR — ${p.name} : ${p.weight}kg × ${p.reps}${newPRs.length > 1 ? ` (+${newPRs.length - 1})` : ''}`), 600);
    } else {
      showToast('✓ Séance enregistrée !');
    }
    await loadHistory();
    loadLastLogs();
    renderProgression();
    renderStagnation();
    renderVolumeByMuscle();
    renderBadges();
    renderHeatmap();
    loadStreak().then(() => renderDashboard());
  } catch (e) {
    console.error('[FitPlan] saveSession error:', e);
    showToast('❌ ' + (e.message ?? 'Erreur sauvegarde — vérifie la console'));
  }
}

// ── Records personnels (PR) ───────────────────────
async function loadPRs() {
  if (!currentUser) { _personalRecords = {}; return; }
  try {
    const { data: sessions } = await sb.from('sessions')
      .select('id, created_at, exercise_logs(exercise_name, sets)')
      .eq('user_id', currentUser.id);
    const prs = {};
    for (const sess of sessions || []) {
      const sessionVolumes = {};
      for (const log of sess.exercise_logs || []) {
        const name = log.exercise_name;
        prs[name] = prs[name] || { maxWeight: 0, maxReps: 0, maxVolume: 0, est1RM: 0, date: null };
        sessionVolumes[name] = sessionVolumes[name] || 0;
        for (const set of log.sets || []) {
          if (!set?.weight || !set?.reps) continue;
          if (set.weight > prs[name].maxWeight) {
            prs[name].maxWeight = set.weight;
            prs[name].maxReps   = set.reps;
            prs[name].date      = sess.created_at;
          }
          const est = calcEst1RM(set.weight, set.reps);
          if (est > prs[name].est1RM) prs[name].est1RM = est;
          sessionVolumes[name] += set.weight * set.reps;
        }
      }
      Object.entries(sessionVolumes).forEach(([n, v]) => {
        if (v > (prs[n]?.maxVolume || 0)) prs[n].maxVolume = v;
      });
    }
    _personalRecords = prs;
    renderPRs();
  } catch (e) {
    console.error('[FitPlan] loadPRs:', e);
  }
}

// Fusionne records calculés + overrides manuels (max des deux par champ)
function getMergedPRs() {
  const out = {};
  const allNames = new Set([...Object.keys(_personalRecords), ...Object.keys(_prOverrides)]);
  for (const name of allNames) {
    const c = _personalRecords[name] || {};
    const o = _prOverrides[name]    || {};
    const maxWeight = Math.max(c.maxWeight || 0, o.maxWeight || 0);
    let maxReps    = c.maxReps  || 0;
    let est1RM     = c.est1RM   || 0;
    let date       = c.date     || null;
    // Si l'override a un poids supérieur, ses reps et date prennent le dessus
    if ((o.maxWeight || 0) > (c.maxWeight || 0)) {
      maxReps = o.maxReps || maxReps;
      date    = o.date    || date;
    }
    // 1RM : max entre calculé et override (recalcule depuis l'override si fourni)
    if (o.maxWeight && o.maxReps) {
      const oEst = calcEst1RM(o.maxWeight, o.maxReps);
      if (oEst > est1RM) est1RM = oEst;
    }
    out[name] = { maxWeight, maxReps, est1RM, date, hasOverride: !!_prOverrides[name] };
  }
  return out;
}

function renderPRs() {
  const el = document.getElementById('profile-prs');
  if (!el) return;
  const merged  = getMergedPRs();
  const records = Object.entries(merged)
    .filter(([, r]) => r.maxWeight > 0)
    .sort((a, b) => b[1].est1RM - a[1].est1RM);

  const addBtn = `<button class="pr-add-btn" onclick="openEditPR(null)">＋ Ajouter un record</button>`;

  if (!records.length) {
    el.innerHTML = `${addBtn}<p style="color:#6b7280;font-size:13px;padding:12px 0">Aucun record pour l'instant. Enregistre des séances ou ajoute un record manuellement.</p>`;
    return;
  }
  el.innerHTML = addBtn + records.map(([name, r]) => {
    const dateStr = r.date ? new Date(r.date).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'2-digit' }) : '';
    const badge = r.hasOverride ? '<span class="pr-override-badge" title="Modifié manuellement">✏️</span>' : '';
    const safeName = name.replace(/'/g, "\\'");
    return `
      <div class="pr-row">
        <div class="pr-name">${name} ${badge}</div>
        <div class="pr-vals">
          <span class="pr-val"><span class="pr-lab">Max</span>${r.maxWeight} kg × ${r.maxReps}</span>
          <span class="pr-val"><span class="pr-lab">1RM est.</span>${Math.round(r.est1RM)} kg</span>
          ${dateStr ? `<span class="pr-date">${dateStr}</span>` : ''}
          <button class="pr-edit-btn" onclick="openEditPR('${safeName}')" title="Modifier">✏️</button>
        </div>
      </div>`;
  }).join('');
}

// ── Suivi du poids corporel ───────────────────────
let _bodyWeights = []; // [{id, weight, measured_at}, ...] desc par date

async function loadBodyWeights() {
  if (!currentUser) { _bodyWeights = []; return; }
  try {
    const { data, error } = await sb.from('body_weights')
      .select('id, weight, measured_at')
      .eq('user_id', currentUser.id)
      .order('measured_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    _bodyWeights = data || [];
  } catch (e) {
    console.error('[FitPlan] loadBodyWeights:', e);
    _bodyWeights = [];
  }
}

function renderBodyWeightCard() {
  const el = document.getElementById('profile-bodyweight');
  if (!el) return;

  const latest  = _bodyWeights[0];
  const oldest  = _bodyWeights[_bodyWeights.length - 1];
  const delta   = (latest && oldest && latest.id !== oldest.id) ? (latest.weight - oldest.weight) : null;
  const deltaStr = delta !== null
    ? `<span class="bw-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg</span>`
    : '';

  const currentW = latest?.weight ?? state.poids;
  const dateStr = latest ? new Date(latest.measured_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'2-digit' }) : '';

  // Chart : points triés chronologiquement
  const points = [..._bodyWeights]
    .reverse()
    .map(b => ({ x: new Date(b.measured_at).getTime(), y: parseFloat(b.weight) }));
  const chart = renderLineChart(points, { color: '#a5b4fc', height: 110, unit: 'kg' });

  el.innerHTML = `
    <div class="bw-top">
      <div class="bw-current">
        <span class="bw-val">${currentW ?? '—'}</span>
        <span class="bw-unit">kg</span>
        ${deltaStr}
      </div>
      <button class="btn-primary" onclick="openBodyWeightModal()" style="padding:9px 16px;font-size:13px">＋ Pèse-toi</button>
    </div>
    ${dateStr ? `<div class="bw-date">Dernière mesure : ${dateStr}</div>` : ''}
    <div class="bw-chart">${chart}</div>
    ${_bodyWeights.length > 1 ? `<div class="bw-list-toggle" onclick="toggleBwList()">Voir historique (${_bodyWeights.length})</div>
      <div class="bw-list hidden" id="bw-list">${_bodyWeights.map(b => `
        <div class="bw-list-item">
          <span>${new Date(b.measured_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'2-digit' })}</span>
          <span style="font-weight:700">${b.weight} kg</span>
          <button class="bw-rm-btn" onclick="deleteBodyWeight(${b.id})" title="Supprimer">✕</button>
        </div>`).join('')}</div>` : ''}`;
}

function toggleBwList() {
  document.getElementById('bw-list')?.classList.toggle('hidden');
}

function openBodyWeightModal() {
  document.getElementById('bw-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('bw-input').value = state.poids ?? '';
  document.getElementById('bw-date').value = today;
  document.getElementById('bw-error').classList.add('hidden');
  setTimeout(() => document.getElementById('bw-input').focus(), 50);
}
function closeBodyWeightModal() {
  document.getElementById('bw-modal').classList.add('hidden');
  document.body.style.overflow = '';
}
async function saveBodyWeight() {
  const w    = parseFloat(document.getElementById('bw-input').value);
  const date = document.getElementById('bw-date').value;
  const err  = document.getElementById('bw-error');
  if (!w || w < 30 || w > 250) {
    err.textContent = 'Poids invalide (30–250 kg).';
    err.classList.remove('hidden');
    return;
  }
  try {
    const { error } = await sb.from('body_weights').insert({
      user_id: currentUser.id,
      weight: w,
      measured_at: date ? new Date(date).toISOString() : new Date().toISOString(),
    });
    if (error) throw error;
    // Met à jour state.poids si c'est la mesure la plus récente
    await loadBodyWeights();
    const latest = _bodyWeights[0];
    if (latest && parseFloat(latest.weight) !== state.poids) {
      state.poids = parseFloat(latest.weight);
      document.getElementById('poids') && (document.getElementById('poids').value = state.poids);
      await saveProfile();
      renderDashboard();
      renderProfile();
    }
    renderBodyWeightCard();
    closeBodyWeightModal();
    showToast('✓ Poids enregistré');
  } catch (e) {
    console.error('[FitPlan] saveBodyWeight:', e);
    err.textContent = `Erreur : ${e.message}`;
    err.classList.remove('hidden');
  }
}
async function deleteBodyWeight(id) {
  if (!confirm('Supprimer cette mesure ?')) return;
  try {
    const { error } = await sb.from('body_weights').delete().eq('id', id);
    if (error) throw error;
    await loadBodyWeights();
    // Met à jour state.poids depuis la nouvelle plus récente
    const latest = _bodyWeights[0];
    if (latest) {
      state.poids = parseFloat(latest.weight);
      await saveProfile();
      renderDashboard();
      renderProfile();
    }
    renderBodyWeightCard();
    showToast('✓ Mesure supprimée');
  } catch (e) {
    console.error('[FitPlan] deleteBodyWeight:', e);
    showToast('❌ ' + e.message);
  }
}

// ── Streak / Consistance ──────────────────────────
async function loadStreak() {
  if (!currentUser) { _currentStreak = { weeks: 0, thisWeek: 0 }; return; }
  try {
    const { data: sessions } = await sb.from('sessions')
      .select('created_at')
      .eq('user_id', currentUser.id);
    if (!sessions?.length) { _currentStreak = { weeks: 0, thisWeek: 0 }; return; }
    const weekSet = new Set(sessions.map(s => getISOWeek(s.created_at)));
    const currentWeek = getISOWeek(new Date());
    const thisWeek = sessions.filter(s => getISOWeek(s.created_at) === currentWeek).length;

    let streak = 0;
    let cur = currentWeek;
    // Cas 1 : il y a une séance cette semaine → on compte cette semaine + précédentes
    // Cas 2 : pas de séance cette semaine mais une dans la précédente → on compte à partir de la précédente
    if (!weekSet.has(cur)) cur = previousISOWeek(cur);
    while (weekSet.has(cur)) {
      streak++;
      cur = previousISOWeek(cur);
    }
    _currentStreak = { weeks: streak, thisWeek };
  } catch (e) {
    console.error('[FitPlan] loadStreak:', e);
    _currentStreak = { weeks: 0, thisWeek: 0 };
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
let _allHistorySessions = [];

async function loadHistory() {
  if (!currentUser) return;

  try {
    const { data: sessions, error } = await sb
      .from('sessions').select('*, exercise_logs(*)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    _allHistorySessions = sessions || [];

    if (!_allHistorySessions.length) {
      const empty = '<p style="color:#6b7280;font-size:13px">Aucune séance enregistrée pour l\'instant.</p>';
      ['dash-history', 'profile-history'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = empty;
      });
      return;
    }
    renderHistory();
  } catch (e) {
    console.error('[FitPlan] loadHistory error:', e);
  }
}

function _historyItemHtml(s) {
  const date    = new Date(s.created_at).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
  const exCount = s.exercise_logs?.length ?? 0;
  const noteIcon = s.notes ? '<span class="history-note-icon" title="Note présente">📝</span>' : '';
  return `
    <div class="history-item" onclick="openSessionDetail('${s.id}')" title="Voir le détail">
      <div class="history-date">${date}</div>
      <div class="history-label">${noteIcon}${s.label}</div>
      <div class="history-meta">${exCount} exercice${exCount > 1 ? 's' : ''} →</div>
    </div>`;
}

function renderHistory(queryRaw = '') {
  const query = (queryRaw || document.getElementById('history-search')?.value || '').trim().toLowerCase();
  let list = _allHistorySessions;
  if (query) {
    list = list.filter(s => {
      const date = new Date(s.created_at).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      const exoNames = (s.exercise_logs || []).map(l => l.exercise_name).join(' ');
      const hay = `${s.label ?? ''} ${date} ${s.notes ?? ''} ${exoNames}`.toLowerCase();
      return hay.includes(query);
    });
  }
  const dashHistory = document.getElementById('dash-history');
  if (dashHistory) dashHistory.innerHTML = list.slice(0, 3).map(_historyItemHtml).join('') || '<p style="color:#6b7280;font-size:13px">Aucune séance.</p>';
  const profileHistory = document.getElementById('profile-history');
  if (profileHistory) {
    profileHistory.innerHTML = list.length
      ? list.map(_historyItemHtml).join('')
      : `<p style="color:#6b7280;font-size:13px;padding:8px 0">Aucun résultat pour "${query}".</p>`;
  }
  const countEl = document.getElementById('history-count');
  if (countEl) countEl.textContent = query ? `${list.length} / ${_allHistorySessions.length} séance${list.length > 1 ? 's' : ''}` : `${_allHistorySessions.length} séance${_allHistorySessions.length > 1 ? 's' : ''}`;
}

// ── Détail / édition d'une séance passée ──────────
let _detailSession = null;     // session courante (avec exercise_logs)
let _detailEditing = false;    // mode lecture vs édition
let _detailDeletedLogIds = []; // ids des exercise_logs supprimés (à effacer en DB au save)

async function openSessionDetail(sessionId) {
  const modal = document.getElementById('session-detail-modal');
  const body  = document.getElementById('session-detail-body');
  const title = document.getElementById('session-detail-title');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<div class="modal-loading"><div class="spinner"></div><p>Chargement…</p></div>';
  title.textContent = 'Détail de la séance';
  _detailEditing = false;
  _detailDeletedLogIds = [];

  try {
    const { data: session, error } = await sb.from('sessions')
      .select('*, exercise_logs(*)')
      .eq('id', sessionId)
      .single();
    if (error) throw error;
    _detailSession = session;
    renderSessionDetail();
  } catch (e) {
    console.error('[FitPlan] openSessionDetail:', e);
    body.innerHTML = `<p style="color:#9ca3af;text-align:center;padding:20px 0">⚠️ Erreur : ${e.message}</p>`;
  }
}

function renderSessionDetail() {
  const body  = document.getElementById('session-detail-body');
  const title = document.getElementById('session-detail-title');
  if (!_detailSession) return;
  const s = _detailSession;
  const date = new Date(s.created_at).toLocaleDateString('fr-FR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit',
  });
  title.textContent = s.label || 'Séance';
  const logs = s.exercise_logs || [];

  // Volume / résumé
  let totalVol = 0, totalSets = 0;
  logs.forEach(log => (log.sets || []).forEach(set => {
    if (set?.weight && set?.reps) { totalVol += set.weight * set.reps; totalSets++; }
  }));

  const summaryHtml = `
    <div class="detail-summary">
      <div class="detail-stat"><div class="detail-stat-val">${logs.length}</div><div class="detail-stat-lab">Exercices</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${totalSets}</div><div class="detail-stat-lab">Séries</div></div>
      <div class="detail-stat"><div class="detail-stat-val">${Math.round(totalVol)}</div><div class="detail-stat-lab">Volume</div></div>
    </div>`;

  const actionBar = _detailEditing ? `
    <div class="detail-action-bar">
      <button class="btn-secondary" onclick="cancelDetailEdit()">Annuler</button>
      <button class="btn-primary"   onclick="saveSessionDetail()">✓ Enregistrer</button>
    </div>` : `
    <div class="detail-action-bar">
      <button class="btn-secondary detail-danger" onclick="deleteWholeSession()">🗑 Supprimer</button>
      <button class="btn-primary" onclick="enableDetailEdit()">✏️ Modifier</button>
    </div>`;

  // Bloc notes (lecture ou édition)
  const notesBlock = _detailEditing
    ? `<div class="detail-notes-edit">
         <label class="session-notes-label">📝 Notes</label>
         <textarea class="session-notes-textarea" id="detail-notes-input" placeholder="Sensations, douleurs, énergie…" oninput="_detailSession.notes = this.value">${s.notes ?? ''}</textarea>
       </div>`
    : (s.notes
        ? `<div class="detail-notes-view"><div class="detail-notes-icon">📝</div><div class="detail-notes-text">${s.notes.replace(/</g,'&lt;')}</div></div>`
        : '');

  if (logs.length === 0) {
    body.innerHTML = `<p style="color:#6b7280;font-size:13px;margin-bottom:14px">${date}</p>
      ${notesBlock}
      <p style="color:#9ca3af;text-align:center;padding:20px 0">Aucun exercice enregistré.</p>${actionBar}`;
    return;
  }

  const logsHtml = logs.map((log, li) => {
    const sets = log.sets || [];
    // Mini-chart d'évolution sur cet exercice (poids max par séance)
    const chartHtml = !_detailEditing && log.exercise_name
      ? `<div class="detail-mini-chart" id="chart-${li}"></div>`
      : '';
    if (chartHtml) setTimeout(() => renderExerciseChart(log.exercise_name, `chart-${li}`), 10);

    const setsHtml = sets.map((set, si) => {
      if (!set) return '';
      // Cardio (set.done défini)
      if (set.done !== undefined) {
        if (_detailEditing) {
          return `<div class="detail-set">
            <span class="detail-set-num">${si+1}</span>
            <label class="cardio-check-label" style="font-size:13px">
              <input type="checkbox" ${set.done ? 'checked' : ''} onchange="updateDetailSet(${li},${si},'done',this.checked)" style="width:16px;height:16px;accent-color:#f97316;cursor:pointer"/>
              <span>Effectué</span>
            </label>
          </div>`;
        }
        return `<div class="detail-set"><span class="detail-set-num">${si+1}</span><span class="detail-set-val">${set.done ? '✓ Effectué' : '✗ Non effectué'}</span></div>`;
      }
      // Sets musculation
      if (_detailEditing) {
        return `<div class="detail-set detail-set-edit">
          <span class="detail-set-num">S${si+1}</span>
          <div class="input-with-unit" style="flex:1">
            <input type="number" value="${set.weight ?? ''}" min="0" step="0.5" onchange="updateDetailSet(${li},${si},'weight',this.value)" style="padding:6px 10px;font-size:13px"/>
            <span>kg</span>
          </div>
          <div class="input-with-unit" style="flex:1">
            <input type="number" value="${set.reps ?? ''}" min="1" onchange="updateDetailSet(${li},${si},'reps',this.value)" style="padding:6px 10px;font-size:13px"/>
            <span>rép</span>
          </div>
          <button class="session-rm-btn" onclick="removeDetailSet(${li},${si})" title="Retirer série">✕</button>
        </div>`;
      }
      const parts = [];
      if (set.weight) parts.push(`<span class="detail-set-val">${set.weight} kg</span>`);
      if (set.reps)   parts.push(`<span class="detail-set-val">${set.reps} rép</span>`);
      if (!parts.length) return '';
      return `<div class="detail-set"><span class="detail-set-num">S${si+1}</span>${parts.join('')}</div>`;
    }).filter(Boolean).join('');

    const isCardio = sets.some(s => s?.done !== undefined);
    const addBtn = _detailEditing && !isCardio
      ? `<button class="btn-set-toggle" onclick="addDetailSet(${li})" style="margin-top:8px">+ Ajouter une série</button>`
      : '';
    const rmExBtn = _detailEditing
      ? `<button class="session-rm-btn" onclick="removeDetailExercise(${li})" title="Retirer l'exercice">✕</button>`
      : '';

    return `
      <div class="detail-exercise">
        <div class="detail-ex-header">
          <span class="detail-ex-name">${log.exercise_name}</span>
          ${rmExBtn}
        </div>
        ${chartHtml}
        <div class="detail-sets">${setsHtml || '<span style="color:#6b7280;font-size:12px">Pas de données</span>'}</div>
        ${addBtn}
      </div>`;
  }).join('');

  body.innerHTML = `
    <p style="color:#6b7280;font-size:13px;margin-bottom:14px">${date}</p>
    ${notesBlock}
    ${summaryHtml}
    ${logsHtml}
    ${actionBar}`;
}

function enableDetailEdit() {
  _detailEditing = true;
  _detailDeletedLogIds = [];
  renderSessionDetail();
}

function cancelDetailEdit() {
  // Recharge depuis la DB pour rejeter les modifs locales
  if (_detailSession?.id) openSessionDetail(_detailSession.id);
}

function updateDetailSet(logIdx, setIdx, field, value) {
  const log = _detailSession?.exercise_logs?.[logIdx];
  if (!log) return;
  log.sets = log.sets || [];
  log.sets[setIdx] = log.sets[setIdx] || {};
  if (field === 'done') log.sets[setIdx].done = !!value;
  else {
    const v = parseFloat(value);
    if (isNaN(v) || value === '') delete log.sets[setIdx][field];
    else log.sets[setIdx][field] = v;
  }
}

function removeDetailSet(logIdx, setIdx) {
  const log = _detailSession?.exercise_logs?.[logIdx];
  if (!log?.sets) return;
  log.sets.splice(setIdx, 1);
  renderSessionDetail();
}

function addDetailSet(logIdx) {
  const log = _detailSession?.exercise_logs?.[logIdx];
  if (!log) return;
  log.sets = log.sets || [];
  const last = log.sets[log.sets.length - 1];
  log.sets.push(last ? { ...last } : { weight: null, reps: null });
  renderSessionDetail();
}

function removeDetailExercise(logIdx) {
  const log = _detailSession?.exercise_logs?.[logIdx];
  if (!log) return;
  if (!confirm(`Retirer "${log.exercise_name}" de cette séance ?`)) return;
  if (log.id) _detailDeletedLogIds.push(log.id);
  _detailSession.exercise_logs.splice(logIdx, 1);
  renderSessionDetail();
}

async function saveSessionDetail() {
  if (!_detailSession) return;
  try {
    // 1) Supprime les exercise_logs marqués
    if (_detailDeletedLogIds.length) {
      const { error: delErr } = await sb.from('exercise_logs').delete().in('id', _detailDeletedLogIds);
      if (delErr) throw delErr;
    }
    // 2) Update chaque log restant
    for (const log of _detailSession.exercise_logs || []) {
      if (!log.id) continue;
      const { error: updErr } = await sb.from('exercise_logs').update({ sets: log.sets }).eq('id', log.id);
      if (updErr) throw updErr;
    }
    // 3) Update les notes de la séance
    const { error: noteErr } = await sb.from('sessions')
      .update({ notes: _detailSession.notes?.trim() || null })
      .eq('id', _detailSession.id);
    if (noteErr) throw noteErr;
    showToast('✓ Séance mise à jour');
    _detailEditing = false;
    _detailDeletedLogIds = [];
    // Recharge depuis DB pour afficher les valeurs finales
    await openSessionDetail(_detailSession.id);
    // Rafraîchit l'historique + progression + PR + streak
    await loadHistory();
    loadLastLogs();
    renderProgression();
    renderStagnation();
    renderVolumeByMuscle();
    renderBadges();
    renderHeatmap();
    loadPRs();
    loadStreak().then(() => renderDashboard());
  } catch (e) {
    console.error('[FitPlan] saveSessionDetail:', e);
    showToast('❌ ' + (e.message ?? 'Erreur sauvegarde'));
  }
}

async function deleteWholeSession() {
  if (!_detailSession) return;
  if (!confirm('Supprimer définitivement cette séance ? Cette action est irréversible.')) return;
  try {
    // Supprime d'abord les exercise_logs liés (au cas où le cascade n'est pas configuré)
    await sb.from('exercise_logs').delete().eq('session_id', _detailSession.id);
    const { error } = await sb.from('sessions').delete().eq('id', _detailSession.id);
    if (error) throw error;
    showToast('✓ Séance supprimée');
    closeSessionDetail();
    await loadHistory();
    loadLastLogs();
    renderProgression();
    renderStagnation();
    renderVolumeByMuscle();
    renderBadges();
    renderHeatmap();
    loadPRs();
    loadStreak().then(() => renderDashboard());
  } catch (e) {
    console.error('[FitPlan] deleteWholeSession:', e);
    showToast('❌ ' + (e.message ?? 'Erreur suppression'));
  }
}

async function renderExerciseChart(exerciseName, targetId) {
  const el = document.getElementById(targetId);
  if (!el || !currentUser) return;
  try {
    // Récupère toutes les séances avec ce log d'exercice
    const { data: sessions } = await sb.from('sessions')
      .select('created_at, exercise_logs!inner(exercise_name, sets)')
      .eq('user_id', currentUser.id)
      .eq('exercise_logs.exercise_name', exerciseName)
      .order('created_at', { ascending: true })
      .limit(20);

    const points = [];
    for (const sess of sessions || []) {
      let maxW = 0;
      for (const log of sess.exercise_logs || []) {
        for (const set of log.sets || []) {
          if (set?.weight && set.weight > maxW) maxW = set.weight;
        }
      }
      if (maxW > 0) points.push({ x: new Date(sess.created_at).getTime(), y: maxW });
    }
    if (points.length < 2) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<div class="chart-title">📈 Évolution poids max</div>` +
      renderLineChart(points, { color: '#fb923c', height: 90 });
  } catch (e) {
    console.error('[FitPlan] renderExerciseChart:', e);
  }
}

function closeSessionDetail() {
  document.getElementById('session-detail-modal').classList.add('hidden');
  document.body.style.overflow = '';
  _detailSession = null;
  _detailEditing = false;
  _detailDeletedLogIds = [];
}

// ── Détection de stagnation ───────────────────────
async function renderStagnation() {
  const el = document.getElementById('dash-stagnation');
  if (!el || !currentUser) return;
  try {
    const now = Date.now();
    const threeWeeksAgo = new Date(now - 21 * 24 * 3600 * 1000);
    const { data: sessions } = await sb.from('sessions')
      .select('created_at, exercise_logs(exercise_name, sets)')
      .eq('user_id', currentUser.id)
      .gte('created_at', threeWeeksAgo.toISOString());

    // Max poids par exo par semaine relative (0 = cette semaine)
    const byEx = {};
    for (const sess of sessions || []) {
      const daysAgo = (now - new Date(sess.created_at).getTime()) / (24 * 3600 * 1000);
      const wk = Math.floor(daysAgo / 7);
      if (wk > 2) continue;
      for (const log of sess.exercise_logs || []) {
        const name = log.exercise_name;
        byEx[name] = byEx[name] || [0, 0, 0];
        let maxW = 0;
        for (const set of log.sets || []) if (set?.weight > maxW) maxW = set.weight;
        if (maxW > byEx[name][wk]) byEx[name][wk] = maxW;
      }
    }

    const stagnant = [];
    for (const [name, [w0, w1, w2]] of Object.entries(byEx)) {
      // Besoin de données sur les 3 semaines, et pas de progression
      if (w0 > 0 && w1 > 0 && w2 > 0 && w0 <= w2 && w1 <= w2) {
        const next = Math.round((w2 + 2.5) * 2) / 2;
        stagnant.push({ name, weight: w2, next });
      }
    }

    if (stagnant.length === 0) {
      el.innerHTML = '<p style="color:#6b7280;font-size:13px;padding:6px 0">✓ Aucune stagnation détectée sur les 3 dernières semaines.</p>';
      return;
    }
    el.innerHTML = stagnant.slice(0, 5).map(s => `
      <div class="stag-item">
        <div class="stag-icon">⚠️</div>
        <div class="stag-content">
          <div class="stag-name">${s.name}</div>
          <div class="stag-msg">Bloqué à <b>${s.weight} kg</b> depuis 3 sem. → tente <b>${s.next} kg</b> ou change la variante.</div>
        </div>
      </div>`).join('') + (stagnant.length > 5 ? `<p class="stag-more">+ ${stagnant.length - 5} autre${stagnant.length - 5 > 1 ? 's' : ''}…</p>` : '');
  } catch (e) {
    console.error('[FitPlan] renderStagnation:', e);
  }
}

// ── Agenda / Calendrier ───────────────────────────
let _calendarDate     = new Date();
let _calendarSessions = []; // sessions pour le mois affiché

async function renderCalendar() {
  const titleEl = document.getElementById('calendar-month');
  const gridEl  = document.getElementById('calendar-grid');
  const statsEl = document.getElementById('calendar-stats');
  if (!gridEl) return;

  const year  = _calendarDate.getFullYear();
  const month = _calendarDate.getMonth();
  const monthName = _calendarDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  if (titleEl) titleEl.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Charge les sessions du mois
  const start = new Date(year, month, 1).toISOString();
  const end   = new Date(year, month + 1, 1).toISOString();
  try {
    const { data } = await sb.from('sessions')
      .select('id, created_at, label, exercise_logs(id)')
      .eq('user_id', currentUser.id)
      .gte('created_at', start).lt('created_at', end)
      .order('created_at', { ascending: true });
    _calendarSessions = data || [];
  } catch (e) {
    console.error('[FitPlan] calendar sessions:', e);
    _calendarSessions = [];
  }

  // Index sessions par date locale YYYY-MM-DD
  const byDate = {};
  for (const s of _calendarSessions) {
    const d = new Date(s.created_at);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    (byDate[k] = byDate[k] || []).push(s);
  }

  // Programme actuel pour les jours du mois
  const programme = (typeof getCustomProgramme === 'function') ? getCustomProgramme() : [];

  // Premier jour de la grille = lundi de la semaine du 1er du mois
  const firstOfMonth = new Date(year, month, 1);
  const firstDow = (firstOfMonth.getDay() + 6) % 7; // 0 = lundi
  const gridStart = new Date(year, month, 1 - firstDow);

  const today = new Date(); today.setHours(0,0,0,0);
  const cells = [];
  // En-têtes jours
  ['L','M','M','J','V','S','D'].forEach(d => {
    cells.push(`<div class="cal-head">${d}</div>`);
  });

  let doneInMonth = 0, plannedInMonth = 0;
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    d.setHours(0,0,0,0);
    const inMonth = d.getMonth() === month;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const sessions = byDate[key] || [];
    const isToday = d.getTime() === today.getTime();
    const isPast  = d < today;
    const dayIdx  = (d.getDay() + 6) % 7;
    const prog    = programme[dayIdx];
    const isRest  = prog?.type === 'rest';

    let status, label;
    if (sessions.length > 0) {
      status = 'done';
      label  = sessions.map(s => s.label).join(' · ');
      if (inMonth) doneInMonth++;
    } else if (isRest) {
      status = 'rest';
      label  = 'Repos';
    } else if (isPast) {
      status = 'missed';
      label  = prog?.label || 'Manqué';
    } else {
      status = 'planned';
      label  = prog?.label || 'Séance';
    }

    if (inMonth && !isRest) plannedInMonth++;

    const click = sessions.length === 1
      ? `onclick="openSessionDetail('${sessions[0].id}')"`
      : sessions.length > 1
      ? `onclick="openCalendarDayPicker('${key}')"`
      : '';

    cells.push(`
      <div class="cal-cell cal-${status} ${isToday ? 'cal-today' : ''} ${inMonth ? '' : 'cal-out'}" ${click}>
        <div class="cal-num">${d.getDate()}</div>
        <div class="cal-label">${label}</div>
      </div>`);
  }

  gridEl.innerHTML = cells.join('');
  if (statsEl) {
    statsEl.innerHTML = `<span>✅ ${doneInMonth} séance${doneInMonth > 1 ? 's' : ''} effectuée${doneInMonth > 1 ? 's' : ''} ce mois</span>`;
  }
}

function changeCalendarMonth(delta) {
  _calendarDate = new Date(_calendarDate.getFullYear(), _calendarDate.getMonth() + delta, 1);
  renderCalendar();
}

function openCalendarDayPicker(dateKey) {
  const sessions = _calendarSessions.filter(s => {
    const d = new Date(s.created_at);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === dateKey;
  });
  if (sessions.length === 1) return openSessionDetail(sessions[0].id);
  // Choisir parmi plusieurs
  const choice = sessions.map((s, i) => `${i+1}. ${s.label}`).join('\n');
  const idx = parseInt(prompt(`Plusieurs séances ce jour. Laquelle ouvrir ?\n\n${choice}\n\nEntre le numéro :`, '1'));
  if (idx && sessions[idx - 1]) openSessionDetail(sessions[idx - 1].id);
}

// ── Toast ─────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}
