// 인간관계 궁합 — 두 사람 고르기 페이지. 설명 페이지(/fortune/compat-social)의 아래 고정 버튼으로 온다
// (사주 상품과 같은 나누기 — 디자인 다듬기 묶음 4, 운영자 11-16). 검색에는 안 나온다(설명 페이지가 색인 대상).
import PurchaseReachedBeacon from "@/components/fortune/landing/PurchaseReachedBeacon";
import BuyProductRow from "@/components/fortune/landing/BuyProductRow";
import CompatInput from "@/components/fortune/compat/CompatInput";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import { noindexMetadata, TITLE_TEMPLATE } from "@/lib/seo/metadata";

const cfg = FORTUNE_CONFIG.compat_social;

export const metadata = noindexMetadata({
  // 부모(/fortune/compat-social)가 제목을 문자열로 정해 루트 template 이 끊긴다 — 접미사를 직접 붙인다
  title: { absolute: TITLE_TEMPLATE.replace("%s", `${cfg.label} 두 사람 고르기`) },
  description: "궁합 볼 두 사람을 골라줘.",
});

export default function CompatSocialPageBuyPage() {
  return (
    <main className="flex flex-1 flex-col pb-10 w-full animate-fade-in">
      <BuyProductRow type="compat_social" />

      <div id="buy" className="w-full max-w-md mx-auto px-5 mt-6">
        <PurchaseReachedBeacon type="compat_social" />
        <h1 className="text-15 font-bold text-eye-purple mb-4">두 사람을 골라줘</h1>
      </div>
      <CompatInput type="compat_social" />
    </main>
  );
}
