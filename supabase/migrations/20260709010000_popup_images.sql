-- 20260709010000_popup_images.sql — 이미지 팝업 (이미지 + 확인 버튼만 노출)
-- popups.image_url + 공개 스토리지 버킷 popup-images (읽기 공개, 쓰기는 service_role 만)
-- 이미지 팝업은 body 없음 (title 은 관리용 라벨로 유지) → body NOT NULL 해제
ALTER TABLE popups ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE popups ALTER COLUMN body DROP NOT NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('popup-images', 'popup-images', true)
ON CONFLICT (id) DO NOTHING;
-- storage.objects RLS 정책 미추가: 업로드는 service_role(어드민 API)만, 읽기는 public 버킷 URL.
