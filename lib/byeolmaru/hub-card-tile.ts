// lib/byeolmaru/hub-card-tile.ts — 별마루 첫 화면 목록 타일의 '오늘 뽑은 카드'. 순수.
// GET /api/byeolmaru/daily-card 의 본문 → 카드(뽑았음) 또는 null(오늘 아직 안 뽑음).
// 🔴 null 도 반영해야 한다 — 화면 기억(lib/screen-cache)이 어제 카드를 들고 와도, 자정이 지나 서버가 '없음'이면 지운다(Codex PR #23 P2)
export function hubCardTile(body: unknown): { cardId: number } | null {
  const id = (body as { card?: { cardId?: unknown } | null } | null)?.card?.cardId;
  return typeof id === "number" ? { cardId: id } : null;
}
