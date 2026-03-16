INSERT INTO public.employees (korean_name, english_name, phone)
VALUES ('벌린', 'Berlyn', '0926-492-7303')
ON CONFLICT (english_name)
DO UPDATE SET
  korean_name = EXCLUDED.korean_name,
  phone = EXCLUDED.phone;
