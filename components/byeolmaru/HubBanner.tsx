// components/byeolmaru/HubBanner.tsx — 별마루 전용 배너(스펙 §8).
// 2탭 FortuneHeader 의 rich variant 와 **동형**이되 치수는 다르다: 배경은 CSS 그라데이션이 그리고
// 캐릭터만 투명 webp 를 얹는다(배경까지 구워 넣으면 CSS 와 싸우고 폭이 바뀔 때 깨진다).
// 🔴 슬롯 폭 120px 은 실측값이다(스펙 §8-7). 이 에셋의 잘라낸 비율이 세로/가로 ≈ 1.0(정사각)이라
//    2탭의 77px 슬롯에 넣으면 77×77 만 써서 얼굴이 뭉갠다 — 110 미만으로 줄이지 말 것.
import Image from "next/image";

export default function HubBanner() {
  return (
    <section
      className="relative overflow-hidden rounded-2xl px-5 py-6"
      style={{ background: "linear-gradient(160deg,#E8DEF5 0%,#D4C7EE 100%)" }}
    >
      <div className="relative max-w-[62%]">
        <h1 className="font-display text-2xl text-eye-purple">별마루</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-light">
          오늘 너의 하늘, 한 자리에 모아뒀어
        </p>
      </div>
      <div className="pointer-events-none absolute right-4 top-1/2 h-[120px] w-[120px] -translate-y-1/2">
        <Image src="/byeolmaru-byeolkong.webp" alt="" fill sizes="120px" className="object-contain" priority />
      </div>
    </section>
  );
}
