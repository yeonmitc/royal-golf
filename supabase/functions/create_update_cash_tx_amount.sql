create or replace function public.update_cash_tx_amount(
  p_id bigint,
  p_amount numeric,
  p_memo text default null,
  p_occurred_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.cash_tx%rowtype;
  v_delta numeric;
begin
  select *
  into v_old
  from public.cash_tx
  where id = p_id
  for update;

  if not found then
    raise exception 'cash_tx not found: %', p_id;
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'invalid amount';
  end if;

  v_delta := p_amount - v_old.amount;

  update public.cash_balances
  set balance = balance + v_delta,
      updated_at = now()
  where account = v_old.account;

  update public.cash_tx
  set amount = p_amount,
      memo = case when p_memo is null then memo else p_memo end,
      occurred_at = case when p_occurred_at is null then occurred_at else p_occurred_at end
  where id = p_id;
end;
$$;
