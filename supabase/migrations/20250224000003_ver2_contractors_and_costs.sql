-- ver2.0 原価・支払・見積連携: 業者・発注・業者請求書・支払・現場経費・追加予算承認・標準単価・受注見込み・予算・projects拡張
-- 前提: 操作 5（is_admin）, 8（projects）, 9（estimates）が完了していること

-- 1. 業者マスタ（contractors）
CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  contact_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on contractors"
  ON public.contractors FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on contractors"
  ON public.contractors FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_contractors_name ON public.contractors(name);

-- 2. 発注（orders）
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  order_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  description TEXT,
  is_additional_order BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'approved', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on orders"
  ON public.orders FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on orders"
  ON public.orders FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_orders_project_id ON public.orders(project_id);
CREATE INDEX IF NOT EXISTS idx_orders_contractor_id ON public.orders(contractor_id);

-- 3. 業者請求書（contractor_invoices）
CREATE TABLE IF NOT EXISTS public.contractor_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2),
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_review', 'approved', 'paid', 'cancelled')),
  description TEXT,
  discrepancy_flag BOOLEAN NOT NULL DEFAULT false,
  discrepancy_details TEXT,
  checked_by_sales_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at_sales TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contractor_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on contractor_invoices"
  ON public.contractor_invoices FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on contractor_invoices"
  ON public.contractor_invoices FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_contractor_invoices_project_id ON public.contractor_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_contractor_invoices_contractor_id ON public.contractor_invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractor_invoices_status ON public.contractor_invoices(status);

-- 4. 業者への支払（vendor_payments）
CREATE TABLE IF NOT EXISTS public.vendor_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_invoice_id UUID NOT NULL REFERENCES public.contractor_invoices(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'cash', 'check')),
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'confirmed', 'failed')),
  processed_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on vendor_payments"
  ON public.vendor_payments FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on vendor_payments"
  ON public.vendor_payments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_vendor_payments_contractor_invoice_id ON public.vendor_payments(contractor_invoice_id);

-- 5. 現場経費（site_expenses）
CREATE TABLE IF NOT EXISTS public.site_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('transport', 'materials', 'food', 'other')),
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  applicant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  settlement_status TEXT NOT NULL DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'settled', 'approved')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.site_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on site_expenses"
  ON public.site_expenses FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on site_expenses"
  ON public.site_expenses FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_site_expenses_project_id ON public.site_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_site_expenses_settlement_status ON public.site_expenses(settlement_status);

-- 6. 追加予算承認（budget_approvals）
CREATE TABLE IF NOT EXISTS public.budget_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  requested_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(12, 2),
  request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.budget_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on budget_approvals"
  ON public.budget_approvals FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on budget_approvals"
  ON public.budget_approvals FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_budget_approvals_project_id ON public.budget_approvals(project_id);

-- 7. 標準単価表（standard_unit_prices）
CREATE TABLE IF NOT EXISTS public.standard_unit_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  category TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.standard_unit_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on standard_unit_prices"
  ON public.standard_unit_prices FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on standard_unit_prices"
  ON public.standard_unit_prices FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_standard_unit_prices_display_order ON public.standard_unit_prices(display_order);

-- 8. 受注見込み（order_forecasts）
CREATE TABLE IF NOT EXISTS public.order_forecasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  forecast_month DATE NOT NULL,
  forecast_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.order_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on order_forecasts"
  ON public.order_forecasts FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on order_forecasts"
  ON public.order_forecasts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_order_forecasts_forecast_month ON public.order_forecasts(forecast_month);

-- 9. 予算（budgets）
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  department TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  month INTEGER,
  target_revenue NUMERIC(12, 2),
  target_profit NUMERIC(12, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can do all on budgets"
  ON public.budgets FOR ALL USING (public.is_admin());

CREATE POLICY "Authenticated can all on budgets"
  ON public.budgets FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_budgets_department_year ON public.budgets(department, fiscal_year);

-- 10. projects 拡張（原価確定・最終粗利益）
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS cost_finalization_status TEXT DEFAULT 'pending' CHECK (cost_finalization_status IN ('pending', 'finalized')),
  ADD COLUMN IF NOT EXISTS final_cost NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS final_gross_profit NUMERIC(12, 2);
