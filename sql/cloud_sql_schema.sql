-- kanri-app inventory schema for PostgreSQL / Google Cloud SQL.
-- It is safe to run repeatedly.

create table if not exists inventory_products (
  id text primary key,
  jan_code text not null unique check (jan_code ~ '^[0-9]{8}$|^[0-9]{13}$'),
  name text not null,
  model text not null,
  normalized_model text not null unique,
  manufacturer text not null check (manufacturer in ('AQUA', 'ハイアール', 'その他')),
  manufacturer_other text not null default '',
  category text not null check (category in ('洗濯機', '冷蔵庫', 'エアコン', 'その他')),
  category_other text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by text not null default '',
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_movements (
  id text primary key,
  product_id text not null references inventory_products(id),
  movement_type text not null check (movement_type in ('receive','dispatch','return','adjustment')),
  quantity integer not null check (quantity <> 0),
  occurred_on date not null default current_date,
  job_id text,
  work_order_number text,
  sagyou_job_id text,
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists inventory_reservations (
  id text primary key,
  product_id text not null references inventory_products(id),
  job_id text not null unique,
  work_order_number text not null,
  sagyou_job_id text,
  scheduled_date date,
  quantity integer not null check (quantity > 0),
  status text not null check (status in ('reserved','dispatched','cancelled')),
  created_by text not null default '',
  cancelled_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_movements_product_date_idx
  on inventory_movements(product_id, occurred_on desc);
create index if not exists inventory_movements_job_idx
  on inventory_movements(job_id) where job_id is not null;
create index if not exists inventory_reservations_product_status_idx
  on inventory_reservations(product_id, status);
create index if not exists inventory_reservations_scheduled_date_idx
  on inventory_reservations(scheduled_date, status);

-- Field worker application. The JSON payload intentionally keeps imported
-- spreadsheet fields lossless while indexed columns cover common lookups.
create table if not exists logistics_jobs (
  id text primary key,
  work_order_number text not null,
  scheduled_date date,
  assigned_worker_id text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists logistics_jobs_work_order_idx on logistics_jobs(work_order_number);
create index if not exists logistics_jobs_worker_date_idx on logistics_jobs(assigned_worker_id, scheduled_date);

create table if not exists worker_attendance (
  id text primary key,
  worker_id text not null,
  work_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  updated_at timestamptz not null default now(),
  unique(worker_id, work_date),
  check(clock_out is null or clock_out >= clock_in)
);
create index if not exists worker_attendance_worker_date_idx on worker_attendance(worker_id, work_date desc);
