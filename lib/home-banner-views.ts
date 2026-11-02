// 홈 이어가기 버튼의 노출 횟수 제한(기기별). 대상이 바뀌면(새 대화·새로 뽑은 판) 처음부터 다시 센다.
// 저장소를 인자로 받는다(유닛 테스트용 가짜 저장소). 화면에선 localStorage 를 넘긴다.

/** '이어서 나눌 수 있는 대화가 있어' — 홈에 세 번 들어올 때까지 */
export const RESUME_BANNER_KEY = "byeolkong:home_resume_banner";
export const RESUME_BANNER_MAX_VIEWS = 3;
/** '아까 뽑은 카드가 기다리고 있어' — 홈에 한 번 들어올 때만 */
export const PENDING_DRAW_BANNER_KEY = "byeolkong:home_pending_draw_banner";
export const PENDING_DRAW_BANNER_MAX_VIEWS = 1;

/** 이번 방문에 버튼을 보여도 되면 true 를 돌려주고 한 번 센다. 저장소가 던지면 true — 지금처럼 보이는 쪽으로 둔다 */
export function takeBannerView(
  store: Pick<Storage, "getItem" | "setItem">,
  key: string,
  target: string,
  maxViews: number
): boolean {
  try {
    const count = viewsOf(store.getItem(key), target);
    if (count >= maxViews) return false;
    store.setItem(key, JSON.stringify({ target, count: count + 1 }));
    return true;
  } catch {
    return true;
  }
}

function viewsOf(raw: string | null, target: string): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { target?: unknown; count?: unknown };
    return parsed.target === target && typeof parsed.count === "number" ? parsed.count : 0;
  } catch {
    return 0;
  }
}
