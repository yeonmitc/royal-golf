-- '의류사입비' 카테고리가 없으면 추가합니다.
INSERT INTO public.expense_categories (name)
SELECT '의류사입비'
WHERE NOT EXISTS (
    SELECT 1 FROM public.expense_categories WHERE name = '의류사입비'
);
