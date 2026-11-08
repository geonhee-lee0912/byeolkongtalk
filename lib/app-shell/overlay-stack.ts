// 겹창(시트·확인창) 스택 — 열린 것들을 쌓아 두고 맨 위 하나만 닫는다. 첫 창이 열릴 때 뒤 화면 스크롤을 잠그고 마지막이 닫힐 때 푼다.
// components/common/Sheet·Dialog 가 쓴다. 4단계에서 앱의 안드로이드 뒤로 버튼(ui.back)이 closeTop 을 부른다. 스펙 2026-11-07-앱-화면 §8

type Entry = { close: () => void; removed: boolean };

export function createOverlayStack(setLocked: (locked: boolean) => void) {
  const entries: Entry[] = [];

  return {
    /** 맨 위에 올린다. 돌려준 함수로 뺀다 — 두 번 불러도 한 번만 */
    push(close: () => void): () => void {
      const entry: Entry = { close, removed: false };
      entries.push(entry);
      if (entries.length === 1) setLocked(true);
      return () => {
        if (entry.removed) return;
        entry.removed = true;
        const i = entries.indexOf(entry);
        if (i >= 0) entries.splice(i, 1);
        if (entries.length === 0) setLocked(false);
      };
    },
    /** 맨 위 창에 닫기를 요청한다. 열린 게 없으면 false */
    closeTop(): boolean {
      const top = entries[entries.length - 1];
      if (!top) return false;
      top.close();
      return true;
    },
    size(): number {
      return entries.length;
    },
  };
}

/** 문서용 스택 — 잠그는 동안 html·body 의 overflow 를 hidden 으로, 풀 때 원래 값으로 */
const saved: { html: string; body: string } = { html: "", body: "" };
export const overlayStack = createOverlayStack((locked) => {
  if (typeof document === "undefined") return;
  const html = document.documentElement.style;
  const body = document.body.style;
  if (locked) {
    saved.html = html.overflow;
    saved.body = body.overflow;
    html.overflow = "hidden";
    body.overflow = "hidden";
  } else {
    html.overflow = saved.html;
    body.overflow = saved.body;
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

/** 처음 한 번만 부르는 닫기 — 나중에 연타·바깥 누르기·끌어내리기가 겹쳐도 onClose 는 한 번 */
export function onceClose(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}
