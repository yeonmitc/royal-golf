-- 1) enum 타입 만들기 (없으면 생성) 
 do $$ begin 
   create type public.cash_account_type as enum ('php_cash','usd_cash','krw_cash','krw_bank'); 
 exception when duplicate_object then null; 
 end $$; 
 
 -- 2) 현재 잔액 테이블 (4개 row 고정) 
 create table if not exists public.cash_balances ( 
   account public.cash_account_type primary key, 
   balance numeric not null default 0, 
   updated_at timestamptz not null default now() 
 ); 
 
 insert into public.cash_balances (account, balance) 
 values 
   ('php_cash', 0), 
   ('usd_cash', 0), 
   ('krw_cash', 0), 
   ('krw_bank', 0) 
 on conflict (account) do nothing; 
 
 -- updated_at 자동 갱신 트리거 (선택이지만 추천) 
 create or replace function public.touch_cash_balances_updated_at() 
 returns trigger 
 language plpgsql 
 as $$ 
 begin 
   new.updated_at := now(); 
   return new; 
 end $$; 
 
 drop trigger if exists trg_touch_cash_balances_updated_at on public.cash_balances; 
 
 create trigger trg_touch_cash_balances_updated_at 
 before update on public.cash_balances 
 for each row 
 execute function public.touch_cash_balances_updated_at(); 
 
 -- 3) 거래 기록 테이블 (입금/출금 로그) 
 create table if not exists public.cash_tx ( 
   id bigint generated always as identity primary key, 
   account public.cash_account_type not null, 
   amount numeric not null,          -- +입금 / -출금 
   memo text, 
   occurred_at timestamptz not null default now(), 
   created_at timestamptz not null default now() 
 ); 
 
 create index if not exists idx_cash_tx_account_time 
 on public.cash_tx (account, occurred_at desc); 
 
 -- 4) cash_tx insert 시 잔액 자동 반영 
 create or replace function public.apply_cash_tx_to_balance() 
 returns trigger 
 language plpgsql 
 as $$ 
 begin 
   update public.cash_balances 
   set balance = balance + new.amount, 
       updated_at = now() 
   where account = new.account; 
 
   return new; 
 end $$; 
 
 drop trigger if exists trg_apply_cash_tx_to_balance on public.cash_tx; 
 
 create trigger trg_apply_cash_tx_to_balance 
 after insert on public.cash_tx 
 for each row 
 execute function public.apply_cash_tx_to_balance(); 
 
 -- 5) cash_tx delete 시 잔액 되돌리기 
 create or replace function public.rollback_cash_tx_from_balance() 
 returns trigger 
 language plpgsql 
 as $$ 
 begin 
   update public.cash_balances 
   set balance = balance - old.amount, 
       updated_at = now() 
   where account = old.account; 
 
   return old; 
 end $$; 
 
 drop trigger if exists trg_rollback_cash_tx_from_balance on public.cash_tx; 
 
 create trigger trg_rollback_cash_tx_from_balance 
 after delete on public.cash_tx 
 for each row 
 execute function public.rollback_cash_tx_from_balance();