// components/admin/BlockNote.tsx — 2층 블록의 각주 한 줄.
//
// 🔴 note 는 주석이 아니라 **화면에 찍히는 문자열**이다. plain text 로 그리면 `**강조**` 의
//    별표가 날것으로 노출된다 — 채팅 버블이 2026-07-22 에 똑같이 물려 EmphasisText 를 얻었다.
//    파싱은 계약 테스트가 붙은 `splitEmphasis`(lib/text-emphasis.ts)를 **재사용**한다.
//    정규식을 다시 쓰지 않는다(짝 안 맞는 `**` 의 리터럴 유지 같은 경계가 거기 잠겨 있다).
//    스타일만 어드민 다크 톤으로 다르다 — EmphasisText 는 진보라+골드 하이라이트라 못 쓴다.
//
// 왜 컴포넌트인가: DivergingBar 와 Drilldown 의 BlockView 가 같은 각주를 그린다. 래퍼 클래스까지
// 한 곳에 둬야 둘의 표기가 갈리지 않는다.
import { Fragment } from "react";
import { splitEmphasis } from "@/lib/text-emphasis";

export function BlockNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div className="text-[11px] text-white/35 mt-2 leading-snug">
      {splitEmphasis(note).map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold text-white/55">
            {s.text}
          </strong>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        )
      )}
    </div>
  );
}
