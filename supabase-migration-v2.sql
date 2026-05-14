-- ============================================
-- FitPlan — Migration v2
-- Notes / Body weights / Custom programme
-- ============================================

-- 1) Notes par séance
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2) Suivi du poids corporel
CREATE TABLE IF NOT EXISTS body_weights (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight      NUMERIC NOT NULL,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS body_weights_user_date ON body_weights(user_id, measured_at DESC);
ALTER TABLE body_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "body_weights_own" ON body_weights;
CREATE POLICY "body_weights_own" ON body_weights
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Programme personnalisé (pour le prochain message)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS custom_programme JSONB;
