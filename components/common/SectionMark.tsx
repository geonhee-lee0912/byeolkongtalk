// components/common/SectionMark.tsx — 탐색 지면(홈·/fortune·별마루) 섹션 제목 앞 16px 마커.
//
// 🔴 이 파일이 마커의 단일 원천이다. 예전엔 지면마다 체계가 달랐다 —
//    홈=색 입힌 유니코드 기호(♥·✦) / /fortune=이모지(🌙) / 별마루=금색 3px 바.
//    셋 다 하단탭 3개로 나란히 비교되는 면이라 갈리는 비용이 실제로 있었다.
//
// 🔴 이모지를 안 쓴다 — OS마다 다르게 그려져 cream/lilac/gold 팔레트 통제 밖이다.
//    유니코드 기호(✦)도 버렸다: 지면 4곳에 같은 글리프가 깔려 "체계"가 아니라 반복으로 읽혔다.
//
// 기술은 `components/layout/BottomTab.tsx` 선례를 그대로 잇는다 — 솔리드(면으로 채운) 커스텀
// 글리프 · viewBox 0 0 24 24 · fill=currentColor · 별 구멍(knockout)은 evenodd 로 배경이 비침.
//
// 🔴 **16px 에서 살아남는 형태만 쓴다.** 실측으로 탈락시킨 안들(다시 제안하지 말 것):
//    - 가로로만 퍼진 글리프(날짜 점 한 줄·차오르는 달 3단) → 시각 무게가 나머지의 절반이고
//      로딩 점(`···`)으로 읽힌다. 정사각 질량이 필요하다.
//    - 세로 기둥 사이에 작은 별 → 16px 에서 별이 뭉개져 `‖+‖`(십자)가 된다.
//    - 부채꼴로 펼친 카드 3장 → 56px 에서도 한 덩어리 얼룩으로 합쳐진다.
//    - 별자리 노드(점을 선으로 이음) → 16px 에서 꺾은선 그래프로 읽혀 뜻이 바뀐다.
//
// 🔴 하단탭이 쓰는 메타포는 **그 탭의 본문에서만** 재사용한다. /fortune 의 초승달은 하단탭
//    '사주 운세'와 같은 메타포인데, 그 탭 안에서만 쓰므로 "여기가 그 탭"을 강화한다. 반대로
//    별마루 달력 섹션에 달력 글리프를 쓰면 같은 화면 하단탭 아이콘과 진짜로 겹치므로 안 쓴다
//    (그래서 3×3 점 격자다 — 하단탭 달력은 윤곽선 테두리 + 상단 고리 2개라 실루엣이 다르다).
//
// 🔴 색은 장식용(aria-hidden)이라 WCAG 비텍스트 대비 3:1 적용 대상이 아니지만, 안 보이면
//    의미가 없다. cream(#FAF6F0) 위 실측: gold 1.58:1 · lilac-deep 2.78:1 · rose 2.29:1.
//    **gold-soft(#F2D78A)는 1.31:1 로 사실상 안 보여 쓰지 않는다.**

export type SectionMarkKind =
  | "love" // 홈 — 연애 고민
  | "other" // 홈 — 다른 고민
  | "fortune" // /fortune — 어떤 운세가 궁금해?
  | "calendar" // 별마루 — 내 하루 달력
  | "today" // 별마루 — 오늘 볼 것
  | "self"; // 별마루 — 나를 알아보는 것

/** rose 는 @theme 토큰이 아니다 — 홈이 원래 인라인으로 쓰던 값을 그대로 옮겨왔다(토큰 신설은 스코프 밖). */
const ROSE = "#E48BA0";

const MARKS: Record<SectionMarkKind, { className: string; style?: React.CSSProperties; body: React.ReactNode }> = {
  // 하트 + 별 구멍
  love: {
    className: "",
    style: { color: ROSE },
    body: (
      <path
        fillRule="evenodd"
        d="M12 20.8c-.4 0-.78-.14-1.08-.42C7.2 16.9 3 13.1 3 9.15 3 6.3 5.15 4.1 7.85 4.1c1.7 0 3.2.85 4.15 2.2.95-1.35 2.45-2.2 4.15-2.2 2.7 0 4.85 2.2 4.85 5.05 0 3.95-4.2 7.75-7.92 11.23-.3.28-.68.42-1.08.42ZM12 7.3l-1 2.3-2.3 1 2.3 1 1 2.3 1-2.3 2.3-1-2.3-1Z"
      />
    ),
  },
  // 구름 + 별 구멍 — 고민
  other: {
    className: "text-lilac-deep",
    body: (
      <path
        fillRule="evenodd"
        d="M7.8 17.5h9.4a4.1 4.1 0 0 0 .3-8.2 5.6 5.6 0 0 0-10.7-1.1 4.7 4.7 0 0 0 1 9.3ZM12 9.8l-.85 1.95-1.95.85 1.95.85.85 1.95.85-1.95 1.95-.85-1.95-.85Z"
      />
    ),
  },
  // 초승달 + 별 — 하단탭 '사주 운세'와 같은 메타포(의도적 반복, 위 주석 참조)
  fortune: {
    className: "text-gold",
    body: <path d="M13.6 3A9 9 0 1 0 21 15.8 7.2 7.2 0 0 1 13.6 3Zm4.3 .4 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1Z" />,
  },
  // 3×3 점 격자 + 가운데 오늘 별 — 달력 격자를 점으로
  calendar: {
    className: "text-gold",
    body: (
      <>
        <circle cx="6.2" cy="6.2" r="1.5" />
        <circle cx="12" cy="6.2" r="1.5" />
        <circle cx="17.8" cy="6.2" r="1.5" />
        <circle cx="6.2" cy="12" r="1.5" />
        <circle cx="17.8" cy="12" r="1.5" />
        <circle cx="6.2" cy="17.8" r="1.5" />
        <circle cx="12" cy="17.8" r="1.5" />
        <circle cx="17.8" cy="17.8" r="1.5" />
        <path d="M12 9l-.9 2.1-2.1.9 2.1.9.9 2.1.9-2.1 2.1-.9-2.1-.9Z" />
      </>
    ),
  },
  // 선물상자 + 별 리본 — "매일 무료로 열리는 것"
  // 🔴 뚜껑·몸통 두께는 실측으로 올린 값이다. 처음엔 얇은 띠였는데 16px 에서 사라졌다.
  today: {
    className: "text-lilac-deep",
    body: (
      <>
        <path d="M12 2.8l-1 2.4-2.4 1 2.4 1 1 2.4 1-2.4 2.4-1-2.4-1Z" />
        <rect x="3.7" y="10.2" width="16.6" height="3.7" rx=".9" />
        <rect x="5.9" y="14.7" width="12.2" height="6.4" rx="1.5" />
      </>
    ),
  },
  // 별 열쇠 — "나를 여는 열쇠". 도구함 아이콘 talent_path(별열쇠)와 같은 계열
  self: {
    className: "text-lilac-deep",
    body: (
      <>
        <path
          fillRule="evenodd"
          d="M12 2.6a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2Zm0 1.95l-.8 1.85-1.85.8 1.85.8.8 1.85.8-1.85 1.85-.8-1.85-.8Z"
        />
        <rect x="10.9" y="11" width="2.2" height="9.4" rx="1.1" />
        <rect x="13.1" y="14.6" width="2.8" height="1.9" rx=".8" />
        <rect x="13.1" y="17.8" width="2.3" height="1.9" rx=".8" />
      </>
    ),
  },
};

/**
 * 섹션 제목 앞 마커. 색은 kind 가 들고 있으므로 호출부는 종류만 고르면 된다.
 * 장식이라 aria-hidden — 의미는 옆 제목 텍스트가 전부 지고 간다.
 */
export default function SectionMark({ kind, className = "" }: { kind: SectionMarkKind; className?: string }) {
  const m = MARKS[kind];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`h-4 w-4 shrink-0 ${m.className} ${className}`.trim()}
      style={m.style}
    >
      {m.body}
    </svg>
  );
}
