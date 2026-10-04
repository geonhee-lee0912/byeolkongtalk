// 인챗 구매(대화 연장·보조 카드) 요청 — 클라 공용. 응답이 영영 안 오면 구매 중 잠금(전송·마무리·재구매)이 새로고침 전까지 안 풀리므로
// 시간 제한을 둔다. 시간 안에 응답이 없으면 abort 해 던진다 — 호출부는 이를 '결과를 모른다'(서버엔 반영됐을 수 있다)로 다뤄야 한다:
// 일반 오류 문구를 보이고 서버 상태를 다시 읽는다(app/tarot/reading/page.tsx · components/upsell/ClarifierSheet.tsx).
export const PURCHASE_TIMEOUT_MS = 20_000;

export interface PurchaseResponse<T> {
  status: number;
  ok: boolean;
  /** 응답 본문(JSON). 본문이 없거나 JSON 이 아니면 빈 객체 */
  data: T;
}

export async function purchaseRequest<T extends object>(
  url: string,
  init: RequestInit,
  timeoutMs: number = PURCHASE_TIMEOUT_MS,
): Promise<PurchaseResponse<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let data: T;
    try {
      data = await res.json();
    } catch (e) {
      // 본문을 읽다 시간이 끝났으면 응답이 잘린 것이다 — 빈 본문으로 성공 취급하지 않고 던진다
      if (ctrl.signal.aborted) throw e;
      data = {} as T;
    }
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}
