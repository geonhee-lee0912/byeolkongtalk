// components/admin/LoadFailed.tsx — 어드민 조회 실패를 화면에 드러내는 한 줄.
//
// 왜 필요한가: 어드민 페이지들은 `const { data, count } = await query` 로 **error 를 아예
// 받지 않았다.** 조회가 실패해도 0·빈 표로 렌더돼 "값이 진짜 0"과 구분이 안 됐다.
// 2026-07-28 `Max rows` 사고(상담 완료율을 21% 로 표시, 실제 63.7%)가 오래 안 보였던 것도
// 같은 구조 탓이다 — 잘린 데이터가 아무 신호 없이 정상처럼 보였다.
// RPC 전환으로 "조용한 절단"은 없앴지만, 다른 이유로 조회가 실패하면 똑같이 조용히 틀린다.
//
// 사용 규칙:
// - 실패한 블록만 이 줄로 대체한다. **throw 하지 않는다** — 한 블록이 죽어도 나머지 화면은
//   계속 읽을 수 있어야 운영자가 무엇이 망가졌는지 판단할 수 있다.
// - 숫자 카드가 실패하면 0 이 아니라 `—` 를 띄우고 이 줄을 함께 낸다.
// - `block` 은 운영자가 원인을 좁힐 수 있는 이름으로(예: RPC 이름, 테이블 이름).
export default function LoadFailed({ block, className = "" }: { block: string; className?: string }) {
  return (
    <p className={`text-[12px] text-amber-300/80 ${className}`}>
      ⚠️ {block} 조회에 실패했다 — 숫자를 0으로 위장하지 않고 이 줄을 띄운다. 서버 로그와{" "}
      /admin/errors 를 확인할 것.
    </p>
  );
}
