// components/byeolmaru/HubBanner.tsx — 별마루 전용 배너(스펙 §8).
// 2탭 FortuneHeader 의 rich variant 와 **동형**이되 치수는 다르다: 배경은 CSS 그라데이션이 그리고
// 캐릭터만 투명 webp 를 얹는다(배경까지 구워 넣으면 CSS 와 싸우고 폭이 바뀔 때 깨진다).
// 🔴 슬롯 폭 120px 은 실측값이다(스펙 §8-7). 이 에셋의 잘라낸 비율이 세로/가로 ≈ 1.0(정사각)이라
//    2탭의 77px 슬롯에 넣으면 77×77 만 써서 얼굴이 뭉갠다 — 110 미만으로 줄이지 말 것.
// 🔴 캐릭터를 **absolute + 텍스트 max-w-%** 로 비키게 하지 않는다. 그 조합은 폭이 줄면 무너진다 —
//    실측: 375px 에서 여유 −0.9px(사실상 맞닿음) · 360px 에서 6.6px 겹침 · 320px 에서 21.8px 겹침.
//    flex 로 두면 캐릭터가 트랙을 실제로 차지하므로 **어느 폭에서도 구조적으로 안 겹친다**.
import Image from "next/image";

export default function HubBanner() {
  return (
    <section
      className="flex items-center gap-3 overflow-hidden rounded-2xl px-5 py-6"
      style={{ background: "linear-gradient(160deg,#E8DEF5 0%,#D4C7EE 100%)" }}
    >
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-light">
          오늘 너의 하늘, 한 자리에 모아뒀어
        </p>
      </div>
      {/* alt="" — 장식이다. 2탭 FortuneHeader 는 alt="별콩이" 를 쓰지만, 그 이름은 화면 어디에도
          정보를 더하지 않는다(제목이 이미 "별마루"다). 스크린리더에 마스코트 이름만 한 번 더
          읽히는 건 잡음이라 여기선 비운다 — 의도된 차이라 적어둔다. */}
      <div className="pointer-events-none relative h-[120px] w-[120px] shrink-0">
        <Image src="/byeolmaru-byeolkong.webp" alt="" fill sizes="120px" className="object-contain" priority />
      </div>
    </section>
  );
}
