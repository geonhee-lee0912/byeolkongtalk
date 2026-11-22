// 사주 상품 — 사주 고르기 페이지. 설명 페이지(/fortune/[type])의 아래 고정 버튼으로 온다
// (디자인 다듬기 묶음 4 페이지 나누기, 운영자 11-15 — 설명과 고르기가 한 페이지에 섞여 있던 것을 나눴다.
// 운영에서 상품 페이지를 본 사람 대부분이 위 버튼으로 고르기 칸에 바로 건너갔다).
// 맨 위에 고르는 상품 한 줄, 그 아래 '누구 사주로 볼까' + 구매 칸.
import { redirect } from "next/navigation";
import PurchaseReachedBeacon from "@/components/fortune/landing/PurchaseReachedBeacon";
import BuyProductRow from "@/components/fortune/landing/BuyProductRow";
import FortunePurchasePanel from "@/components/fortune/FortunePurchasePanel";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

export default async function FortuneBuyPage({ params }: { params: Promise<{ type: string }> }) {
  const { type: raw } = await params;
  const cfg = raw in FORTUNE_CONFIG ? FORTUNE_CONFIG[raw as FortuneType] : null;
  // 설명 페이지와 같은 가드 — daily·타로·비활성은 사주 고르기 대상이 아니다
  if (!cfg || !cfg.active || cfg.base !== "saju" || cfg.type === "daily") redirect("/fortune");

  const type = cfg.type;

  return (
    <main className="flex flex-1 flex-col pb-10 w-full animate-fade-in">
      <BuyProductRow type={type} />

      <div id="buy" className="w-full max-w-md mx-auto px-5 mt-6">
        <PurchaseReachedBeacon type={type} />
        <h1 className="text-15 font-bold text-eye-purple mb-4">누구 사주로 볼까</h1>
      </div>
      <FortunePurchasePanel type={type} />
    </main>
  );
}
