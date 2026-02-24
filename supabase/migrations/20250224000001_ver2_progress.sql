-- ver2.0 進捗管理: 発生元・問い合わせ・フォロー履歴・失注・月次目標・着信ログ・projects.origin_id
-- 前提: 操作 5（is_admin）, 6（customers）, 7（staff）, 8（projects）が完了していること

-- 1. 発生元マスタ（origins）
CREATE TABLE IF NOT EXISTS public.origins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.origins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on origins"
  ON public.origins FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on origins"
  ON public.origins FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_origins_display_order ON public.origins(display_order);

-- 2. 案件に発生元を追加（任意）
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS origin_id UUID REFERENCES public.origins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_origin_id ON public.projects(origin_id) WHERE origin_id IS NOT NULL;

-- 3. 問い合わせ（inquiries）
CREATE TABLE IF NOT EXISTS public.inquiries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  contact_name TEXT,
  contact_phone TEXT NOT NULL,
  contact_address TEXT,
  inquiry_content TEXT NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  origin_id UUID REFERENCES public.origins(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'estimate_done', 'won', 'lost'
  )),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on inquiries"
  ON public.inquiries FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on inquiries"
  ON public.inquiries FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_inquiries_staff_id ON public.inquiries(staff_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_project_id ON public.inquiries(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries(created_at DESC);

-- 4. フォロー履歴（activity_logs）
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('phone', 'visit', 'email', 'meeting')),
  content TEXT,
  activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT activity_logs_ref CHECK (
    (inquiry_id IS NOT NULL) OR (project_id IS NOT NULL)
  )
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on activity_logs"
  ON public.activity_logs FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on activity_logs"
  ON public.activity_logs FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_activity_logs_inquiry_id ON public.activity_logs(inquiry_id) WHERE inquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_project_id ON public.activity_logs(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_at ON public.activity_logs(activity_at DESC);

-- 5. 失注記録（cancellation_records）
CREATE TABLE IF NOT EXISTS public.cancellation_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reason_detail TEXT,
  proposed_amount NUMERIC(12, 2),
  cancelled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cancellation_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on cancellation_records"
  ON public.cancellation_records FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on cancellation_records"
  ON public.cancellation_records FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_cancellation_records_project_id ON public.cancellation_records(project_id);

-- 6. 担当者月次目標（staff_monthly_targets）
CREATE TABLE IF NOT EXISTS public.staff_monthly_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  year_month DATE NOT NULL,
  order_amount_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
  completion_amount_target NUMERIC(12, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, year_month)
);

ALTER TABLE public.staff_monthly_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on staff_monthly_targets"
  ON public.staff_monthly_targets FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on staff_monthly_targets"
  ON public.staff_monthly_targets FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_staff_monthly_targets_staff_year ON public.staff_monthly_targets(staff_id, year_month);

-- 7. 着信ログ（call_logs）- 電話連携用
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phone_number TEXT,
  customer_name TEXT,
  answered BOOLEAN NOT NULL DEFAULT false,
  is_complaint BOOLEAN NOT NULL DEFAULT false,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on call_logs"
  ON public.call_logs FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can select call_logs"
  ON public.call_logs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_call_logs_called_at ON public.call_logs(called_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_answered ON public.call_logs(answered) WHERE answered = false;
