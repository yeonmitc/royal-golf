-- payroll_paid_periods: 급여 지급 완료 기록 (모든 기기에서 공유)
CREATE TABLE IF NOT EXISTS payroll_paid_periods (
  id BIGSERIAL PRIMARY KEY,
  pay_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_paid_periods_pay_date
  ON payroll_paid_periods(pay_date);