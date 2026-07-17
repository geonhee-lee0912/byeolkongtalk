import { redirect } from "next/navigation";

// 구 사주/타로 방식 선택 페이지 — 폐쇄. 구 링크·북마크 하위호환용 리다이렉트.
export default function LegacySelectPage() {
  redirect("/concern");
}
