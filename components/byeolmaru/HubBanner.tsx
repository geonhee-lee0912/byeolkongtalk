// components/byeolmaru/HubBanner.tsx — 별마루 전용 배너(스펙 §8).
// 2탭 FortuneHeader 의 rich variant 와 **동형**: 같은 radial 그라데이션 기하 + 같은 글자 치수 +
// 별 반짝임까지 맞춰 두 탭이 한 시스템으로 읽히게 한다. 색만 갈라 탭을 구분한다
// (2탭 = 황혼 주황 / 별마루 = 보라). 배경은 CSS 가 그리고 캐릭터만 투명 webp 를 얹는다
// (배경까지 구워 넣으면 CSS 와 싸우고 폭이 바뀔 때 깨진다).
//
// 🔴 **캐릭터를 absolute 로 띄우지 않는다 — 여기만 2탭과 다르다.** 2탭 에셋은 세로/가로 1.33 이라
//    77px 슬롯에 들어가지만, 이 에셋은 잘라낸 비율이 ≈1.0(정사각)이라 같은 슬롯에 넣으면
//    77×77 만 써서 얼굴이 뭉갠다(스펙 §8-7). 그래서 슬롯이 커야 하고, 커진 슬롯을
//    absolute + 텍스트 max-w-% 로 비키게 하면 좁은 폭에서 무너진다 —
//    실측: 375px 에서 여유 −0.9px(사실상 맞닿음) · 360px 에서 6.6px 겹침 · 320px 에서 21.8px 겹침.
//    flex 로 두면 캐릭터가 트랙을 실제로 차지하므로 **어느 폭에서도 구조적으로 안 겹친다**.
// 🔴 슬롯 폭 110px 은 실측 하한이다(스펙 §8-7). 세로 여백을 줄여 배너 전체 높이는 2탭과 맞췄으니
//    더 낮추고 싶어도 이 값이 아니라 py 를 건드릴 것 — 110 미만은 얼굴이 뭉갠다.
import Image from "next/image";

export default function HubBanner() {
  return (
    <section
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl px-5 py-3"
      style={{
        // 2탭 FortuneHeader 와 같은 기하(하단 중앙에서 원형으로 번짐), 색만 보라로.
        // 🔴 시작색을 lilac-mid(#B8A8D8)로 잡았더니 2탭 주황보다 **눈에 띄게 흐렸다** — 보라는 같은
        //    명도에서 채도 체감이 낮아 흰색으로 번질 때 먼저 죽는다. lilac-deep 까지 올려야 두 탭의
        //    번짐 강도가 비슷하게 읽힌다(나란히 놓고 실측 비교 후 조정).
        background:
          "radial-gradient(97% 83% at 50% 123%, #9F8AD0 0%, #C6B6E8 37%, #EAE3F6 69%, #FFFFFF 100%)",
      }}
    >
      {/* 위쪽 밝은 영역 별 반짝임 — 2탭과 같은 장치다. 별마루는 별·달이 모티브라 여기선 더 맞는다. */}
      <span className="absolute top-2 left-[42%] text-[10px] text-gold opacity-70 animate-star-twinkle" aria-hidden>✦</span>
      <span className="absolute top-5 left-[55%] text-[8px] text-gold-soft opacity-60 animate-star-twinkle" aria-hidden>✦</span>
      <span className="absolute top-1.5 left-[61%] text-[9px] text-gold opacity-50 animate-star-twinkle" aria-hidden>✧</span>

      <div className="relative min-w-0 flex-1">
        <h1 className="font-display text-[17px] font-black text-eye-purple">별마루</h1>
        <p className="mt-1 text-[11.5px] leading-relaxed text-text-light">
          오늘 너의 하늘, 한 자리에 모아뒀어
        </p>
      </div>
      {/* alt="" — 장식이다. 2탭 FortuneHeader 는 alt="별콩이" 를 쓰지만, 그 이름은 화면 어디에도
          정보를 더하지 않는다(제목이 이미 "별마루"다). 스크린리더에 마스코트 이름만 한 번 더
          읽히는 건 잡음이라 여기선 비운다 — 의도된 차이라 적어둔다. */}
      <div className="pointer-events-none relative h-[110px] w-[110px] shrink-0">
        <Image src="/byeolmaru-byeolkong.webp" alt="" fill sizes="110px" className="object-contain" priority />
      </div>
    </section>
  );
}
