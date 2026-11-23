// 사주 고르기 페이지 메타 — 검색에 안 나오게(설명 페이지 /fortune/[type] 가 색인 대상). 디자인 다듬기 묶음 4 페이지 나누기, 운영자 11-15
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";
import { noindexMetadata, TITLE_TEMPLATE } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const cfg = type in FORTUNE_CONFIG ? FORTUNE_CONFIG[type as FortuneType] : null;
  return noindexMetadata({
    // 부모(/fortune/[type])가 제목을 문자열로 정해 루트 template 이 끊긴다 — 접미사를 직접 붙인다
    title: { absolute: TITLE_TEMPLATE.replace("%s", cfg ? `${cfg.label} 사주 고르기` : "사주 고르기") },
    description: "누구 사주로 볼지 골라줘.",
  });
}

export default function FortuneBuyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
