// 라우트 path → 사람이 읽는 이름. 어드민이 path 를 외우고 있지 않아도
// "어느 화면에서 새는지" 가 바로 읽히게 하는 표시용 매핑이다.
//
// 비콘(components/analytics/PageViewBeacon.tsx)이 동적 세그먼트를 :id 로 접고
// 쿼리스트링을 버리므로, 키도 접힌 형태로 둔다.
// ⚠️ 라우트를 신설/이동하면 여기도 갱신할 것 — 누락 시 path 가 그대로 보이므로
//    조용히 틀리지는 않는다(빈 칸이나 오해를 부르는 라벨이 나오지 않는다).

import { FORTUNE_CONFIG } from "@/lib/fortune/types";

const ROUTE_LABEL: Record<string, string> = {
  "/": "홈 · 고민톡 (연애 태그 진열)",
  "/start": "광고 랜딩",
  "/login": "로그인",
  "/concern": "고민 입력",
  "/tarot": "타로 — 스프레드 고르기",
  "/tarot/draw": "타로 — 카드 뽑기",
  "/tarot/reading": "타로 — 상담 대화",
  "/tarot/result": "타로 — 결과 카드",
  "/fortune": "별콩 운세 — 진열대",
  "/fortune/result": "별콩 운세 — 리포트 결과",
  "/relationship": "연애 상담 (우리 사이)",
  "/saju": "사주 — 생년월일 입력",
  "/saju/concern": "사주 — 고민 입력",
  "/saju/reading": "사주 — 상담 대화",
  "/saju/result": "사주 — 결과",
  "/shop": "별 충전소 (결제)",
  "/readings": "보관함 — 지난 상담",
  "/mypage": "내 정보",
  "/mypage/payments": "내 정보 — 결제 내역",
  "/mypage/support": "고객센터 — 문의 목록",
  "/mypage/support/new": "고객센터 — 문의 작성",
  "/mypage/support/:id": "고객센터 — 문의 상세",
  "/select": "방식 선택 (폐쇄됨 → 고민톡으로 리다이렉트)",
  "/privacy": "개인정보처리방침",
  "/terms": "이용약관",
  "/refund": "환불 정책",
};

// 운세 상품 라우트는 FORTUNE_CONFIG.href 가 실제 경로와 1:1 이라 역매핑으로 끌어온다.
// 하드코딩하면 상품명·경로가 바뀔 때 조용히 어긋난다(진열에서 내린 상품도 과거 PV 가 남는다).
const FORTUNE_LABEL_BY_HREF = new Map<string, string>();
for (const c of Object.values(FORTUNE_CONFIG)) {
  if (typeof c.href === "string") FORTUNE_LABEL_BY_HREF.set(c.href, c.label);
}

export function routeLabel(path: string): string {
  const hit = ROUTE_LABEL[path];
  if (hit) return hit;

  const fortune = FORTUNE_LABEL_BY_HREF.get(path);
  if (fortune) return `별콩 운세 — ${fortune}`;

  // 어드민 순회는 로그인 상태면 API 의 제외 필터에 걸리지만 로그아웃 상태 PV 는 남는다.
  if (path === "/admin") return "어드민 — 대시보드";
  if (path.startsWith("/admin/")) return `어드민 — ${path.slice("/admin/".length)}`;

  return path;
}
