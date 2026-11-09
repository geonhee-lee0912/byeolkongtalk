// 겹창(시트·확인창) 스택 — 열린 것들을 쌓아 두고 맨 위 하나만 닫는다. 첫 창이 열릴 때 뒤 화면 스크롤을 잠그고 마지막이 닫힐 때 푼다.
// components/common/Sheet·Dialog(와 틀 밖 겹창의 useOverlayEntry)가 쓴다. ESC 도 여기서 맨 위 하나만 닫는다.
// 4단계에서 앱의 안드로이드 뒤로 버튼(ui.back)이 closeTop 을 부른다. 스펙 2026-11-07-앱-화면 §8

/** close = 닫기 요청, canDismiss = 지금 닫아도 되는가(처리 중·법정 통지면 false — 그땐 요청을 소비만 한다) */
export type OverlayEntry = { close: () => void; canDismiss: () => boolean };
type Slot = OverlayEntry & { removed: boolean };

export function createOverlayStack(setLocked: (locked: boolean) => void) {
  const entries: Slot[] = [];

  const closeTop = (): boolean => {
    const top = entries[entries.length - 1];
    if (!top) return false;
    if (top.canDismiss()) top.close();
    return true;
  };

  return {
    /** 맨 위에 올린다. 돌려준 함수로 뺀다 — 두 번 불러도 한 번만 */
    push(entry: OverlayEntry): () => void {
      const slot: Slot = { ...entry, removed: false };
      entries.push(slot);
      if (entries.length === 1) setLocked(true);
      return () => {
        if (slot.removed) return;
        slot.removed = true;
        const i = entries.indexOf(slot);
        if (i >= 0) entries.splice(i, 1);
        if (entries.length === 0) setLocked(false);
      };
    },
    /** 맨 위 창에 닫기를 요청한다(닫을 수 없는 창이면 소비만). 열린 게 없으면 false */
    closeTop,
    /** 키 입력 — Escape 면 closeTop 결과, 아니면 false */
    handleKey(key: string): boolean {
      return key === "Escape" ? closeTop() : false;
    },
    size(): number {
      return entries.length;
    },
  };
}

/** 문서용 스택 — 잠그는 동안 html·body 의 overflow 를 hidden 으로, 풀 때 원래 값으로. 열린 창이 있는 동안만 ESC 를 듣는다 */
const saved: { html: string; body: string } = { html: "", body: "" };
const onKeyDown = (e: KeyboardEvent) => {
  if (overlayStack.handleKey(e.key)) e.preventDefault();
};
export const overlayStack = createOverlayStack((locked) => {
  if (typeof document === "undefined") return;
  const html = document.documentElement.style;
  const body = document.body.style;
  if (locked) {
    saved.html = html.overflow;
    saved.body = body.overflow;
    html.overflow = "hidden";
    body.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
  } else {
    html.overflow = saved.html;
    body.overflow = saved.body;
    document.removeEventListener("keydown", onKeyDown);
  }
});

/** 끌어내려 닫는 기준 — 120px 넘게 끌었거나, 24px 이상을 0.6px/ms 이상으로 빠르게 끌었을 때 */
const DISMISS_DISTANCE = 120;
const FLICK_MIN_DISTANCE = 24;
const FLICK_VELOCITY = 0.6;

export function shouldDismissSheet(dy: number, velocity: number): boolean {
  if (dy > DISMISS_DISTANCE) return true;
  return dy >= FLICK_MIN_DISTANCE && velocity >= FLICK_VELOCITY;
}

/** 처음 한 번만 부르는 닫기 — 나중에 연타·바깥 누르기·끌어내리기가 겹쳐도 onClose 는 한 번.
 *  reset() 은 부모가 닫기를 거절했을 때(창이 그대로 남았을 때) 다시 받을 수 있게 되돌린다 */
export function onceClose(fn: () => void): (() => void) & { reset(): void } {
  let done = false;
  const c = () => {
    if (done) return;
    done = true;
    fn();
  };
  return Object.assign(c, {
    reset() {
      done = false;
    },
  });
}
