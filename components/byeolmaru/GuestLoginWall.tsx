import Link from "next/link";
import Image from "next/image";

// components/byeolmaru/GuestLoginWall.tsx — /byeolmaru/day 세 탭(사주·타로·우리)이 **공유하는**
// 비로그인 벽(2026-09-27, 사용자 결정 "3탭 모두 통일").
// 🔴 예전엔 세 View 가 각자 자기 벽을 갖고 있었다 — 문구도("달력을 펼쳐줄게" / "오늘 카드를 뽑을
//    수 있어" / "둘 사이 오늘을 볼 수 있어") 레이아웃도 제각각이라, 게스트가 탭을 오가면 같은
//    로그인 벽이 세 가지 다른 화면으로 보였다. 탭 전환은 한 화면 안에서 일어나므로 그 차이가
//    바로 옆에서 비교된다.
// 🔴 문구가 세 탭을 **한 문장에** 담는 건 의도다 — 게스트는 어느 탭에 서 있든 "로그인하면
//    이 셋을 다 받는다"를 알아야 한다. 탭별로 자기 것만 말하면 판매 면적이 1/3 로 줄었다.
// 🔴 세 조각(그림·문구·버튼)은 **서로는** 한 덩어리로 붙인다(8 / 12px) — 예전엔 셋이 각각 떠
//    있어 따로 노는 것처럼 보였다(사용자 지적). 이 둘을 다시 벌리지 말 것.
// 🔴 반대로 **탭 칩과의 간격은 일부러 크게 띄운다**(2026-09-27, 사용자 결정) — 덩어리가 화면
//    중앙 살짝 위에 오도록. `16dvh` 는 실측에서 나온 값이다: 375×812 기준 칩 바닥 162px +
//    130px + 그림 반높이 60px = 그림 중심 352px 로, 화면 중앙(406px)보다 54px 위다.
//    🔴 고정 px(`mt-32`) 대신 dvh 를 쓴다 — "중앙보다 조금 위"는 화면 높이에 대한 관계지
//       픽셀 수가 아니라서, 고정값은 작은 기기에서 중앙 아래로 내려간다. dvh 는 기기가 커지든
//       작아지든 그 관계를 대체로 지킨다(667px 기기에서도 중심이 거의 중앙에 선다).
//    🔴 칩 바닥 위치를 상수로 박지 않은 이유도 같다 — 상단 구성(전역 헤더·뒤로가기·탭 칩)이
//       바뀔 때마다 조용히 틀어지는 매직넘버가 된다. 실제로 이번 세션에 뒤로가기가 알약에서
//       텍스트로 바뀌며 그 높이가 이미 한 번 변했다.
export default function GuestLoginWall({
  /** 로그인 후 돌아올 경로. 탭마다 다르다 — 타로는 공유 링크 수신자를 위해 보던 날짜까지 싣는다. */
  next,
}: {
  next: string;
}) {
  return (
    <div className="mt-[16dvh] flex flex-col items-center text-center">
      <Image src="/byeolkong-curious.png" alt="" width={120} height={120} priority />
      {/* 🔴 `text-balance` + 폭 제한이 한 쌍이다 — 이걸 빼면 375px 에서 마지막 줄에 "어." 한
          조각만 남는다(실측). 문구를 바꿀 때 줄 모양을 다시 볼 것. */}
      <p className="mt-2 max-w-[19rem] text-balance text-[14px] leading-relaxed text-eye-purple">
        로그인하면 매일 무료로 오늘의 사주와 원카드 타로 리딩, 상대방과의 오늘 궁합 관계를 볼 수 있어.
      </p>
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mt-3 inline-block rounded-xl bg-lilac-deep px-4 py-2.5 text-[14px] font-semibold text-cream transition active:scale-[0.98]"
      >
        로그인하러 가기
      </Link>
    </div>
  );
}
