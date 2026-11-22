import { redirect } from "next/navigation";

// 사주 상담 고민 적기 — 종료(운영자 11-22). 옛 링크·북마크 하위호환용 리다이렉트.
// 지난 상담은 /saju/result, 끝나지 않은 상담은 /saju/reading 이 그대로 연다.
export default function ClosedSajuConcernPage() {
  redirect("/fortune");
}
