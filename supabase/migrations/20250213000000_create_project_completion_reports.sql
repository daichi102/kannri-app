-- 完了報告テーブル（1案件1件、署名画像は data URL で保存）
CREATE TABLE IF NOT EXISTS public.project_completion_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  completed_at DATE,
  signer_name TEXT,
  signature_data_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.project_completion_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on project_completion_reports"
  ON public.project_completion_reports FOR ALL
  USING (public.is_admin());

CREATE POLICY "Authenticated can all on project_completion_reports"
  ON public.project_completion_reports FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_project_completion_reports_project_id ON public.project_completion_reports(project_id);
