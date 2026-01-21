-- Supabase SQL Editor에서 아래 쿼리를 실행하여 erro_stock 테이블의 삭제 권한을 부여하세요.
-- 현재 "3 RLS policies"가 있다고 하셨는데, DELETE 정책이 빠져있을 가능성이 높습니다.

-- 1. 기존 DELETE 정책이 있다면 삭제 (중복 방지)
DROP POLICY IF EXISTS "Enable delete for users" ON "public"."erro_stock";

-- 2. 모든 사용자(또는 로그인한 사용자)에게 DELETE 권한 부여
CREATE POLICY "Enable delete for users" ON "public"."erro_stock"
AS PERMISSIVE FOR DELETE
TO public
USING (true);

-- 참고: 만약 INSERT/UPDATE/SELECT 정책도 명확히 하고 싶다면 아래 내용도 확인하세요.
-- CREATE POLICY "Enable read for users" ON "public"."erro_stock" FOR SELECT TO public USING (true);
-- CREATE POLICY "Enable insert for users" ON "public"."erro_stock" FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY "Enable update for users" ON "public"."erro_stock" FOR UPDATE TO public USING (true);
