"use client";

import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/common/Sheet";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import { CLARIFIER_COST } from "@/lib/upsell";
import { purchaseRequest, type PurchaseResponse } from "@/lib/tarot/purchase-request";
import type { DrawnCard } from "@/lib/tarot/spreads";
import Icon from "@/components/common/Icon";

/** 구매 실패 — 402(잔액 부족)는 onInsufficient 로 따로 가고 여기엔 오지 않는다 */
export interface ClarifierFailure {
  /** 서버 error 코드(응답 본문이 없으면 undefined) */
  code?: string;
  /** 결과를 모른다 — 응답을 못 받았거나(끊김·타임아웃) 5xx. 서버엔 카드가 붙었을 수 있다 */
  unknown: boolean;
  /** 시트가 이미 닫혀 유저가 못 본 오류 문구 — 부모가 페이지에 대신 보여 준다 */
  unseenMessage?: string;
}

// 스프레드 색 대신 주 버튼 보라 하나 — /tarot/draw 와 같다(디자인 다듬기 /tarot/draw ① A안)
const ACCENT = "#775CB0";

interface ClarifierResponse {
  error?: string;
  balance?: number;
  drawnCards?: DrawnCard[];
  reopened?: boolean;
}

interface Props {
  open: boolean;
  readingId: string;
  /** 이미 뽑힌 카드들 — 덱에서 제외 + POST 후 반환값으로 교체 */
  drawnCards: DrawnCard[];
  onClose: () => void;
  /** clarifier API 성공 후 호출 — 갱신된 drawnCards 와, 서버가 끝난 대화를 다시 열었는지(reopened) 전달 */
  onDrawn: (newDrawnCards: DrawnCard[], reopened: boolean) => void;
  /** 잔액 부족(402) 시 호출 — 부모가 시트를 닫고 충전 시트(RechargeSheet)를 연다 */
  onInsufficient?: (balance: number) => void;
  /** 구매 요청이 서버에 가 있는 동안 true — 부모가 그 사이 전송·다른 구매를 막는다(요청 중에 시트를 닫아도 요청은 계속 간다) */
  onPurchasingChange?: (purchasing: boolean) => void;
  /** 구매가 402(잔액 부족) 말고 실패했을 때 — 화면이 서버와 어긋났을 수 있어 부모가 서버 상태로 다시 맞춘다 */
  onFailed?: (failure: ClarifierFailure) => void;
}

/**
 * 보조 카드 드로우 바텀시트.
 * CardDrawRitual slim 모드(cardCount=1)로 한 장 선택 → clarifier API 호출.
 * shallow history로 OS 뒤로가기 = 시트 닫기.
 */
export default function ClarifierSheet({
  open,
  readingId,
  drawnCards,
  onClose,
  onDrawn,
  onInsufficient,
  onPurchasingChange,
  onFailed,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 요청이 끝났을 때 시트가 아직 열려 있는지 — handleDrawComplete 의 클로저 값은 요청을 시작한 때의 것이라 쓸 수 없다
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  // 열릴 때 shallow history push
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);

    // shallow history — OS 백버튼으로 닫기
    history.pushState({ sheet: "clarifier" }, "");
    const handlePop = () => { onClose(); };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC·배경 스크롤 잠금은 공통 Sheet

  function closeSheet() {
    // history 스택이 아직 우리 항목이면 정리
    if (history.state?.sheet === "clarifier") {
      history.back();
    } else {
      onClose();
    }
  }

  async function handleDrawComplete(drawn: DrawnCard[]) {
    if (drawn.length === 0 || submitting) return;
    const card = drawn[0];
    setSubmitting(true);
    setError(null);
    onPurchasingChange?.(true);

    // 실패를 시트 화면과 부모 양쪽에 알린다
    const fail = (message: string, f: { code?: string; unknown: boolean }) => {
      setError(message);
      setSubmitting(false);
      // 요청 중에 시트를 닫았다면 유저는 이 문구를 못 본다 — 부모가 페이지에 대신 보여 주게 함께 넘긴다
      onFailed?.({ ...f, unseenMessage: openRef.current ? undefined : message });
    };

    try {
      let res: PurchaseResponse<ClarifierResponse>;
      try {
        res = await purchaseRequest<ClarifierResponse>("/api/consultations/tarot/clarifier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            readingId,
            card: { card_id: card.card_id, direction: card.direction },
          }),
        });
      } catch {
        // 끊김·시간 초과 — 요청은 서버에 닿았는데 응답만 잃었을 수 있다(결과를 모른다)
        fail("연결이 흔들렸어. 잠시 후 다시 시도해줄래?", { unknown: true });
        return;
      }
      const { status, ok, data } = res;

      if (status === 402) {
        const bal = data.balance ?? 0;
        if (onInsufficient) onInsufficient(bal);
        else setError(`별이 부족해. 현재 잔액: 별 ${bal}`);
        setSubmitting(false);
        return;
      }
      if (!ok) {
        const code = data.error;
        const msg =
          code === "clarifier_limit_reached"
            ? "이미 최대 횟수만큼 보조 카드를 뽑았어"
            : code === "card_already_drawn"
            ? "이미 나온 카드야. 다른 카드를 골라줘"
            : code === "reading_already_ended"
            ? "이 대화는 이미 마무리됐어"
            : code === "purchase_in_progress"
            ? "다른 곳에서 처리 중이야. 잠깐 뒤에 다시 확인해줘"
            : "카드를 추가하지 못했어. 잠시 후 다시 시도해줄래?";
        // 5xx 는 서버가 어디까지 했는지 모른다(예: 슬롯 CAS 오류는 카드가 붙은 뒤일 수 있다)
        fail(msg, { code, unknown: status >= 500 });
        return;
      }

      onDrawn(data.drawnCards ?? [], data.reopened === true);
      onClose();
    } finally {
      onPurchasingChange?.(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const excludeIds = drawnCards.map((c) => c.card_id);

  // 그랩바는 웹 전용 — 앱은 Sheet 손잡이(끌어내리기)
  return (
    <Sheet
      label="보조 카드 뽑기"
      onClose={closeSheet}
      z={90}
      align="bottom"
      backdropClassName="bg-night/50 backdrop-blur-sm"
      panelClassName="bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-float-up max-h-[90vh] overflow-y-auto"
    >
        {/* 헤더 — 제목 + 한 줄(무엇을·얼마). 안내 상자·두 번째 제목·잔액·닫기 ✕ 는 뺐다(디자인 다듬기 묶음 2 B안, 운영자 11-15).
            닫기는 바깥 누르기·앱 끌어내리기·Esc·뒤로 가기. 잔액이 모자라면 누른 뒤 충전 시트로 간다(402) */}
        <div className="px-5 pt-5 pb-3">
          <div>
            <h2 className="font-display text-17 text-eye-purple">카드 한 장 더 뽑기</h2>
            <p className="text-13 text-text-light mt-0.5">
              마음 가는 카드 한 장만 골라줘 · <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />
              {CLARIFIER_COST}
            </p>
          </div>
        </div>

        {error && (
          <p className="text-12 text-red-500 text-center px-5 mb-3">
            {error}
          </p>
        )}

        {submitting ? (
          <div className="py-10 text-center text-text-light text-14">
            처리 중…
          </div>
        ) : (
          <CardDrawRitual
            slim
            cardCount={1}
            slotLabels={["+1"]}
            accent={ACCENT}
            ritualLabel="보조 카드"
            completeLabel={
              <>
                카드 선택 ·
                <span className="inline-flex items-center">
                  <Icon name="star" size={16} className="mr-0.5" />
                  {CLARIFIER_COST}
                </span>
              </>
            }
            excludeCardIds={excludeIds}
            onComplete={handleDrawComplete}
          />
        )}

    </Sheet>
  );
}
