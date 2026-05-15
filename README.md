# 🏋️ FitPlan

> Application web de suivi de musculation personnalisée — programme automatique ou sur-mesure, logging de séances, analyses de progression, records personnels, et plus encore.

**Live demo :** [https://mechsofian.github.io/fitplan/](https://mechsofian.github.io/fitplan/)

---

## 📸 Aperçu

FitPlan est une PWA (Progressive Web App) complète qui calcule un programme d'entraînement adapté à ton profil (genre, âge, poids, taille, activité, objectif, niveau, jours/sem), te permet de **logger tes séances en direct** avec un rest timer intégré, et te donne des **analyses fines** de ta progression sur le long terme.

L'app est installable sur mobile (icône sur l'écran d'accueil) et fonctionne hors ligne.

---

## ✨ Fonctionnalités principales

### 👤 Compte & profil
- **Authentification complète** : signup/login, mot de passe oublié, confirmation email, changement email/mot de passe, suppression de compte (RGPD compliant)
- **Mode invité** : utilise l'app sans compte (data en `localStorage`) avec migration auto vers Supabase à l'inscription
- **Validation forte** : email regex, mot de passe min. 8 caractères + 1 lettre + 1 chiffre
- **Tutoriel interactif** au premier login (6 étapes guidées)

### 📋 Programmes d'entraînement
- **Programmes auto-générés** selon ton objectif (perte / maintien / prise de masse) et tes jours/semaine (2 à 6)
  - Full Body, Upper / Lower, Push / Pull / Legs, avec variantes
- **Éditeur de programme personnalisé** : crée tes 7 jours sur-mesure (type, label, exercices ordonnés)
- **Swap d'exercice** : remplace n'importe quel exo par un autre (modal accordéon + barre de recherche + highlight des résultats)
- **Swap de jour** : intervertit 2 jours de la semaine
- **80+ exercices** organisés en 8 groupes musculaires : pec, dos, épaules, biceps, triceps, jambes Q, jambes I, abdos, cardio
- **Exercices personnalisés** créables par l'utilisateur

### 🏃 Logging de séances
- **Valeurs pré-remplies intelligentes** : reprend les dernières perfs, sinon suggère un poids selon le niveau (algorithme basé sur le poids de corps × ratio par exercice)
- **Rest timer flottant** : compte à rebours visuel (90s par défaut, adapté par exo), avec bip sonore (Web Audio API) + vibration mobile à la fin
- **Ajout/retrait de séries & d'exos** en cours de séance
- **Mode focus plein écran** : un exo à la fois, gros chiffres, validation rapide + repos auto
- **Notes par séance** (sensations, douleurs, énergie)

### 📊 Analyses & motivation
- **Records personnels** (PR) auto-calculés + ajouts manuels possibles + formule Brzycki pour le 1RM estimé
- **Streak hebdomadaire** : nombre de semaines consécutives avec ≥ 1 séance
- **Détection de stagnation** : alerte si plateau sur 3 semaines, avec suggestion de progression
- **Volume hebdomadaire par groupe musculaire** : nombre de séries sur 7 jours vs recommandations scientifiques (10-20 sets/sem)
- **Heat map des muscles travaillés** : 2 silhouettes (face + dos) colorées selon le volume
- **Graphiques d'évolution** par exercice (SVG, poids max par séance sur les 20 dernières)
- **Progression vs semaine précédente** (volume total kg·rép par exo)
- **23 badges débloquables** : séances, streak, PR, volume, ratios poids/corps, engagement

### ⚖️ Suivi du poids corporel
- Enregistrement de mesures à date custom
- Graphique d'évolution + delta depuis la 1ère mesure
- Synchronisation auto avec `state.poids` (recalcule BMR/TDEE/macros)

### 📅 Agenda & historique
- **Vue calendrier mensuel** : séances faites en vert, manquées en rouge, prévues en orange, repos en violet
- **Historique complet** avec recherche multi-critères (label, date, exo, contenu des notes)
- **Pagination client-side** (20 séances par défaut, "voir plus")
- **Édition complète** d'une séance passée : modifier poids/reps, ajouter/retirer séries ou exos, supprimer

### 🎁 Polish
- **Themes** : sombre (défaut) / clair / auto (suit le système)
- **Export PDF** du programme via jsPDF (layout custom, pas de window.print)
- **PWA installable** : manifeste, icônes SVG, service worker offline
- **Empty states encouragés** pour les nouveaux utilisateurs
- **Mobile-first responsive** (4 breakpoints : 768, 640, 480, 380 px)
- **Mentions légales / RGPD** light

---

## 🛠️ Tech Stack

| Composant | Tech |
|-----------|------|
| Frontend | Vanilla JavaScript (pas de framework), HTML5, CSS3 |
| UI utility | [Tailwind CSS](https://tailwindcss.com/) (via CDN, pour les utilities) |
| Backend / Auth / DB | [Supabase](https://supabase.com/) (Postgres + RLS + Auth) |
| PDF Export | [jsPDF](https://github.com/parallax/jsPDF) (via CDN) |
| Hosting | GitHub Pages |
| PWA | Manifest + Service Worker custom |

**Pourquoi pas de framework ?** Pour rester léger, rapide à charger, et facile à maintenir. Tout tient en ~4 fichiers JS/HTML/CSS.

---

## 🚀 Setup local / Self-host

### 1. Cloner le repo
```bash
git clone https://github.com/MechSofian/fitplan.git
cd fitplan
```

### 2. Créer un projet Supabase
- Va sur [supabase.com](https://supabase.com), crée un projet gratuit
- Récupère l'URL du projet et la clé `anon` publique
- Édite `auth.js` lignes 5-6 :
```js
const SUPABASE_URL  = 'https://TON-PROJET.supabase.co';
const SUPABASE_ANON = 'ta-cle-anon';
```

### 3. Initialiser la base de données

Exécute dans l'éditeur SQL de Supabase, dans l'ordre :

#### a) Schéma initial
```sql
-- profiles
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom      TEXT,
  nom         TEXT,
  niveau      TEXT DEFAULT 'debutant',
  genre       TEXT,
  age         INT,
  taille      INT,
  poids       NUMERIC,
  activite    NUMERIC,
  objectif    TEXT,
  jours       INT,
  custom_programme JSONB,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- sessions
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objectif    TEXT,
  jours       INT,
  label       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX sessions_user_date ON sessions(user_id, created_at DESC);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_own" ON sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- exercise_logs
CREATE TABLE exercise_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sets          JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX exercise_logs_session ON exercise_logs(session_id);
ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercise_logs_own" ON exercise_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- body_weights
CREATE TABLE body_weights (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight      NUMERIC NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX body_weights_user_date ON body_weights(user_id, measured_at DESC);
ALTER TABLE body_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "body_weights_own" ON body_weights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

#### b) Fonction de suppression de compte (RGPD)
```sql
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.body_weights  WHERE user_id = auth.uid();
  DELETE FROM public.exercise_logs WHERE user_id = auth.uid();
  DELETE FROM public.sessions      WHERE user_id = auth.uid();
  DELETE FROM public.profiles      WHERE id      = auth.uid();
  DELETE FROM auth.users           WHERE id      = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user TO authenticated;
```

### 4. Configurer les redirects Supabase

Dashboard → **Authentication → URL Configuration** :
- **Site URL** : `https://TON-DOMAINE/CHEMIN/` (slash final obligatoire)
- **Redirect URLs** : ajoute `https://TON-DOMAINE/CHEMIN/**` (avec wildcard)

### 5. Servir l'app

L'app est 100% statique, n'importe quel serveur HTTP suffit :

```bash
# Avec Python
python -m http.server 8080

# Avec Node
npx serve .

# Ou directement GitHub Pages : push sur main, active Pages dans Settings
```

⚠️ Le service worker requiert **HTTPS** (ou `localhost` en dev).

---

## 📁 Structure du projet

```
fitplan/
├── index.html              # Toute l'UI (vues, modales, structure)
├── style.css               # Styles + thèmes light/dark + responsive
├── app.js                  # Logique métier : programmes, calculs, modales,
│                           # rendering, customizations, focus mode, heatmap...
├── auth.js                 # Auth Supabase + sessions + logging + analytics
│                           # (PR, streak, volume, body weights, history...)
├── manifest.json           # PWA manifest
├── service-worker.js       # Cache offline (stale-while-revalidate)
├── icon.svg                # Icône standard
├── icon-maskable.svg       # Icône maskable Android
└── supabase-migration*.sql # Migrations DB par étape
```

### Organisation du code

**`app.js`** (~2000 lignes) :
- État global (`state`)
- Customizations (localStorage par user)
- View management + hash routing (`#dashboard`, `#profile`, `#agenda`)
- Programmes & exercices (DB statique de 80+ exos)
- Calculs : BMR Mifflin-St Jeor, TDEE, macros, suggested weights
- Rest timer, mode focus, heatmap
- Badges, volume par muscle, charts SVG
- Modales : swap exos, swap jours, create exo, edit PR, body weight, etc.
- Tutoriel onboarding
- PWA registration
- Theme manager

**`auth.js`** (~1500 lignes) :
- Connection Supabase + init flow
- Auth flows : signin / signup / reset / change pwd / change email / delete account
- Profile load/save (avec migration guest)
- Session logging (avec render, edit, delete)
- Loaders : history, last logs, PRs, streak, body weights, calendar
- Renderers : history, PR, body weight, calendar, stagnation, progression, badges (delegate to app.js)
- Settings modal
- Email confirmation banner

---

## 🗄️ Schéma de la base

```
auth.users (Supabase Auth)
    │
    └─── profiles (1:1)
              │
              └─── custom_programme (JSONB)
    │
    └─── sessions (1:N)
              │
              └─── exercise_logs (1:N)
                        │
                        └─── sets (JSONB: [{weight, reps}, ...])
    │
    └─── body_weights (1:N)
```

**RLS** : toutes les tables ont `auth.uid() = user_id` comme policy → isolation totale entre utilisateurs.

---

## 🧮 Algorithmes & formules

### BMR (Mifflin-St Jeor)
```
BMR = 10 × poids + 6.25 × taille − 5 × age
    + 5  (hommes)
    − 161 (femmes)
```

### TDEE
```
TDEE = BMR × facteur d'activité (1.2 à 1.9)
```

### Calories cibles
```
- Perte    : TDEE − 500 kcal
- Maintien : TDEE
- Masse    : TDEE + 300 kcal
```

### Macros
- Protéines : `poids × 1.8–2.2 g` (ratio selon objectif)
- Lipides : `25–28% kcal`
- Glucides : reste

### 1RM estimé (Brzycki)
```
1RM = poids / (1.0278 − 0.0278 × min(reps, 12))
```

### Suggested weight par exo
```
type 'bw'  : poids_corps × ratio_niveau × (genre === 'female' ? 0.65 : 1)
type 'kg'  : valeur_fixe × (genre === 'female' ? 0.65 : 1)
```

### Streak (ISO weeks)
```
Compte les semaines consécutives (en remontant depuis la sem. courante)
contenant au moins 1 session. Tolère l'absence de session cette semaine
(commence à compter depuis la semaine précédente).
```

---

## 🔐 Sécurité

- **RLS Supabase** : chaque user accède uniquement à ses données
- **JWT** : auth gérée par Supabase, tokens stockés en `localStorage` (sb-* keys)
- **Password** : hashé côté Supabase (bcrypt), jamais en clair
- **Validation côté client** : email regex + complexité mot de passe (defense-in-depth)
- **Suppression de compte RGPD** : fonction SQL `SECURITY DEFINER` qui efface cascade toutes les données

---

## 🎨 Customisation

### Changer la couleur d'accent
Dans `index.html`, modifie la config Tailwind :
```js
tailwind.config = {
  theme: { extend: { colors: { brand: { 500: '#f97316', 600: '#ea580c' } } } }
}
```
Et dans `style.css`, fais un find-replace sur `#f97316` → ta couleur.

### Ajouter un exercice prédéfini
Dans `app.js`, ajoute une entrée dans l'objet `EX` :
```js
pec: [
  // ...
  { nom: 'Mon nouvel exo', sets: '3×10', muscle: 'Pectoraux' },
]
```
Optionnellement dans `SUGGESTED` pour le poids suggéré :
```js
'Mon nouvel exo': { type: 'kg', debutant: 15, intermediaire: 25, avance: 35 }
```

### Ajouter un badge
Dans `app.js`, ajoute dans `BADGES` :
```js
{ id:'mon-badge', icon:'🎯', name:'Mon défi', desc:'X séances en 30 jours', check: s => /* condition sur stats */ }
```

---

## 🐛 Troubleshooting

### Le lien de confirmation email pointe vers la mauvaise URL
- Vérifie **Site URL** dans Supabase Dashboard (doit pointer vers `/chemin/` complet avec slash final)
- Ajoute `/chemin/**` aux **Redirect URLs**
- Les anciens emails sont obsolètes — fais re-signup ou utilise "Renvoyer"

### Le service worker sert du contenu obsolète
- Hard refresh (Ctrl+Shift+R)
- Ou DevTools → Application → Service Workers → Unregister + reload

### Erreur "function delete_user does not exist"
- Exécute la migration v3 dans Supabase SQL Editor (voir setup §3b)

### Les graphiques ne s'affichent pas
- Vérifie que les colonnes SQL existent : `notes` dans `sessions`, table `body_weights`
- Console → cherche des erreurs Supabase (probablement RLS ou colonne manquante)

---

## 📝 Licence

Projet personnel, libre d'utilisation pour usage perso/éducatif. Pas de garantie. Consulte un professionnel de santé avant de débuter un programme sportif.

---

## 🤝 Contributions

PRs bienvenues. Pour proposer une feature majeure, ouvre d'abord une issue pour discuter.

Idées d'évolution possible :
- Mode hors-ligne complet (queue des actions DB en attendant la reconnexion)
- Plan de progression structuré (5/3/1, GZCL, etc.)
- Tracker nutrition simple (kcal/macros par jour)
- Partage d'un programme via URL publique
- Multilangue (i18n)

---

**Made with 💪 by [MechSofian](https://github.com/MechSofian)**
