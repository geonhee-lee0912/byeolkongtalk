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
//
// 🔴 **버튼은 2탭 FortuneHeader 의 '생일 등록하기' 자리와 같은 질감이다**(11.5px · bg-white/50 ·
//    얇은 테두리). 판매 CTA 가 아니라 **탐색 어포던스**라서 작고 은은해야 한다 — 골드 버튼으로
//    키우면 아래 PaywallCut 과 무게가 같아져 배너가 광고판이 된다.
// 🔴 이 자리는 구독 CTA 를 **추가한 게 아니라 옮겨온 것**이다(2026-09-24). 예전엔 DayStrip 아래
//    인라인 문구("앞으로 3일도 미리 볼래? 구독하기")가 같은 일을 했는데, 실측하니 375×812 첫
//    화면에 구독 CTA 가 2개(384px 인라인 + 646px PremiumBlock) 다 보였다. 배너에 더하면 3개가
//    되므로 인라인 쪽을 걷어내고 여기로 승격했다. **다시 인라인을 되살리지 말 것.**
// 🔴 구독자에겐 남은 기간 칩을 대신 띄운다 — 구독자에게 구독 버튼은 뜻이 없고, 그렇다고 비우면
//    배너가 다시 빈 칸이 된다(그게 이 작업의 출발점이었다).
import Image from "next/image";
import { TRIAL_DAYS } from "@/lib/byeolmaru/entitlement";

interface Props {
  entitled: boolean;
  trialUsed: boolean;
  /** 구독 만료. 체험으로 자격을 얻은 사람은 null 이다(그쪽은 trialEndsAt 을 본다). */
  subscriptionExpiresAt?: string | null;
  /** 체험 만료. 구독자는 null. */
  trialEndsAt?: string | null;
  /** 비자격자가 버튼을 눌렀을 때 — 허브가 체험/구독 중 맞는 쪽을 고른다. */
  onSubscribe?: () => void;
}

/** 남은 일수 — 경과 24h 블록 기준(만료 판정이 타임스탬프 비교라 그쪽과 잣대를 맞춘다).
 *  자격이 있다는 건 만료가 미래라는 뜻이라 최소 1을 보장한다(D-0 은 "오늘 끝"으로 읽혀 혼동된다). */
function daysLeft(iso: string, now: number): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

export default function HubBanner({
  entitled,
  trialUsed,
  subscriptionExpiresAt = null,
  trialEndsAt = null,
  onSubscribe,
}: Props) {
  // 🔴 렌더 중 Date.now() — 서버·클라 값이 달라도 문제가 없다. 이 컴포넌트는 허브가 캘린더를
  //    fetch 한 뒤(클라 전용 상태)에만 그려지므로 SSR 결과가 존재하지 않는다.
  const now = Date.now();
  const expiry = subscriptionExpiresAt ?? trialEndsAt;
  const chipClass =
    "mt-2.5 -ml-0.5 inline-flex items-center gap-1 rounded-xl border border-lilac-mid/60 bg-white/50 px-3 py-1 text-[11.5px] font-semibold text-lilac-deep";

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
        {entitled ? (
          // 정보 칩 — 누를 게 아니라서 button 이 아니다.
          <span className={chipClass}>
            {subscriptionExpiresAt ? "구독 중" : "체험 중"}
            {expiry ? ` · D-${daysLeft(expiry, now)}` : ""}
          </span>
        ) : (
          <button type="button" onClick={onSubscribe} className={`${chipClass} transition active:scale-95`}>
            {trialUsed ? "구독하기" : `${TRIAL_DAYS}일 무료 체험`}
            <span aria-hidden>→</span>
          </button>
        )}
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
