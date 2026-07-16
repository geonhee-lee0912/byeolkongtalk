-- 20260717000000_ad_spend_created_by_set_null.sql — ad_spend.created_by FK 에 ON DELETE SET NULL
--
-- created_by 가 ON DELETE 규칙 없이(기본 NO ACTION) 생성돼 있어, 광고 지출을 입력한
-- 어드민 유저가 회원 탈퇴하면 users DELETE 가 FK 23503 으로 차단됨.
-- → 첫 시도에서 카카오 unlink 만 성공하고 삭제 실패 → 재시도마다
--   "Kakao already unlinked before withdraw" info 가 반복 기록되는 루프.
-- 지출 기록 자체는 비즈니스 데이터라 유지하고, 작성자만 NULL 처리.
ALTER TABLE ad_spend DROP CONSTRAINT IF EXISTS ad_spend_created_by_fkey;
ALTER TABLE ad_spend
  ADD CONSTRAINT ad_spend_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
