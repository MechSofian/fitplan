-- ============================================
-- FitPlan — Migration v3
-- Fonction pour suppression du compte par l'utilisateur lui-même
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Supprime toutes les données utilisateur (cascade au cas où les FK ne le font pas)
  DELETE FROM public.body_weights  WHERE user_id = auth.uid();
  DELETE FROM public.exercise_logs WHERE user_id = auth.uid();
  DELETE FROM public.sessions      WHERE user_id = auth.uid();
  DELETE FROM public.profiles      WHERE id      = auth.uid();
  -- Puis le compte auth
  DELETE FROM auth.users           WHERE id      = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user TO authenticated;
