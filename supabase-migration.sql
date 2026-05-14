-- ============================================
-- FitPlan — Migration : prenom / nom / niveau
-- À exécuter dans Supabase Dashboard → SQL Editor
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS prenom TEXT,
  ADD COLUMN IF NOT EXISTS nom    TEXT,
  ADD COLUMN IF NOT EXISTS niveau TEXT DEFAULT 'debutant';

-- niveau : 'debutant' | 'intermediaire' | 'avance'
