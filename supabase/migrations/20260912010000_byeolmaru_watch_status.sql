-- 우리 오늘 상대 링크에 관계 유형(썸/연애/짝사랑/헤어진) 부여. 인물은 user_profiles 단일원천이고
-- 관계는 이 링크의 성질이라 여기 둔다. NULL = 관계 미지정(기존 행·구클라). enum = lib/relationship/types.ts.
ALTER TABLE byeolmaru_watch
  ADD COLUMN status VARCHAR(20)
  CHECK (status IS NULL OR status IN ('crush','dating','breakup','onesided'));
