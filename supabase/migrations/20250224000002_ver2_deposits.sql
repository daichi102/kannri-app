-- ver2.0 入金管理: 入金予定・入金実績・相違承認・請求書・ローン
-- 前提: 操作 5（is_admin）, 6（customers）, 8（projects）が完了していること

-- 1. ローン情報（loans）- deposit_performances の loan_id で参照するため先に作成
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  loan_amount NUMERIC(12, 2) NOT NULL,
  interest_rate NUMERIC(6, 4),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on loans"
  ON public.loans FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on loans"
  ON public.loans FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON public.loans(customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_project_id ON public.loans(project_id) WHERE project_id IS NOT NULL;

-- 2. 入金予定（deposit_schedules）
CREATE TABLE IF NOT EXISTS public.deposit_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  scheduled_date DATE NOT NULL,
  scheduled_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'delayed', 'uncollected', 'completed', 'discrepancy'
  )),
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deposit_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on deposit_schedules"
  ON public.deposit_schedules FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on deposit_schedules"
  ON public.deposit_schedules FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_deposit_schedules_project_id ON public.deposit_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_deposit_schedules_scheduled_date ON public.deposit_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_deposit_schedules_status ON public.deposit_schedules(status);

-- 3. 入金実績（deposit_performances）
CREATE TABLE IF NOT EXISTS public.deposit_performances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deposit_schedule_id UUID REFERENCES public.deposit_schedules(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actual_date DATE NOT NULL,
  actual_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  deposit_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (deposit_method IN ('bank_transfer', 'cash', 'loan')),
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deposit_performances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on deposit_performances"
  ON public.deposit_performances FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on deposit_performances"
  ON public.deposit_performances FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_deposit_performances_project_id ON public.deposit_performances(project_id);
CREATE INDEX IF NOT EXISTS idx_deposit_performances_deposit_schedule_id ON public.deposit_performances(deposit_schedule_id) WHERE deposit_schedule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposit_performances_actual_date ON public.deposit_performances(actual_date);

-- 4. 入金相違承認（deposit_discrepancy_approvals）
CREATE TABLE IF NOT EXISTS public.deposit_discrepancy_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deposit_performance_id UUID NOT NULL REFERENCES public.deposit_performances(id) ON DELETE CASCADE,
  deposit_schedule_id UUID NOT NULL REFERENCES public.deposit_schedules(id) ON DELETE CASCADE,
  discrepancy_details TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deposit_discrepancy_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on deposit_discrepancy_approvals"
  ON public.deposit_discrepancy_approvals FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on deposit_discrepancy_approvals"
  ON public.deposit_discrepancy_approvals FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_deposit_discrepancy_approvals_performance ON public.deposit_discrepancy_approvals(deposit_performance_id);

-- 5. 請求書（invoices）- 顧客向け請求書発行・番号管理
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'overdue', 'cancelled')),
  deposit_schedule_id UUID REFERENCES public.deposit_schedules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on invoices"
  ON public.invoices FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on invoices"
  ON public.invoices FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
