// 화면이 헤더 오른쪽에 버튼 하나를 올리는 자리 — 헤더는 전역(AppShell)이라 화면이 직접 못 그린다.
// 지금은 타로 대화의 '결과 보기'뿐(디자인 다듬기 /tarot/reading ⑦ 운영자 11-13). 화면이 떠날 때 null 로 내린다.
export type HeaderAction = { label: string; onClick: () => void; disabled?: boolean };

let current: HeaderAction | null = null;
const listeners = new Set<() => void>();

export function setHeaderAction(action: HeaderAction | null) {
  current = action;
  listeners.forEach((l) => l());
}

export function getHeaderAction(): HeaderAction | null {
  return current;
}

export function subscribeHeaderAction(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
