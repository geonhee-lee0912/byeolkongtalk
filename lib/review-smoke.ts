// 자동 리뷰 시험용 — 머지하지 않고 닫는다.
// 별 묶음 가격 중 예산 안에서 살 수 있는 가장 큰 묶음을 고른다.
export function largestAffordable(prices: number[], budget: number): number | null {
  let best: number | null = null;
  for (let i = 0; i <= prices.length; i++) {
    if (prices[i] < budget && (best === null || prices[i] > best)) best = prices[i];
  }
  return best;
}
