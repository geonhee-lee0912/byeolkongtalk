"use client";

// components/byeolmaru/FreeList.tsx — 허브 무료 목록. **한 섹션이 아니라 둘이다**(2026-09-24).
//    ①"오늘 볼 것"(buildDailyItems) = 매일 리셋되는 별마루 고유 3종
//    ②"나를 알아보는 것"(buildSelfItems) = 한 번 보면 끝인 2종. **href 가 /fortune 으로 탭을 떠난다**
//      — 이게 둘을 가른 기준이고, 섹션 마커가 다른 글리프(별열쇠)인 이유다.
//    🔴 항목의 `key` 는 계측 축(`byeolmaru_free_item_clicked` 의 meta.item)이라 절대 바꾸지 말 것.
//       섹션이 나뉘어도 키는 그대로라 기존 집계가 이어진다.
// 🔴 2탭(/fortune) 리스트와 **동형**이지만 컴포넌트를 공유하지 않는다:
//    ①이 4종은 FORTUNE_LIST 밖이라 FortuneType 키가 없고 ②FortuneIcon 의 HAS_ICON 에
//    saju_mbti·byeoljari 가 누락돼 이모지 폴백이 뜨며 ③P5 스코프가 2탭을 건드리지 말라고 한다.
//    시각만 복제한다 — 좌측 4px 컬러 바는 §2-3 에서 뺐다(위 달력 판이 색면을 갖게 되면서
//    구분자가 필요 없어졌다).
import Image from "next/image";
import Link from "next/link";
import { SAJU_PAID_CHARS, TAROT_PAID_CHARS, PAIR_PAID_CHARS } from "@/lib/byeolmaru/paywall-sections";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import SectionMark, { type SectionMarkKind } from "@/components/common/SectionMark";

export interface FreeListItem {
  /** 계측 안정 축 — 라벨이 바뀌어도 집계가 유지된다. */
  key: string;
  href: string;
  label: string;
  tagline: string;
  hashtags: string[];
  /** 타일 배경(아이콘 뒤 48px 사각). 좌측 4px 바는 §2-3 에서 제거됐다 — 2탭과 동형으로 맞추는 게
   *  목적이고, 위 격자와 섞여 보이는 문제는 격자가 색면을 갖게 되면서(§3) 사라졌다. */
  tileBg: string;
  /** 타이틀 옆 칩 = **접근 조건**(지금 어떻게 볼 수 있나). 오늘 타로만 뽑기 상태로 바뀐다. */
  chip: string;
  chipTone: "gold" | "lilac";
  /** 해시태그 줄 맨 앞 칩 = **한 줄 더 주는 정보**. "오늘 볼 것"은 구독 가치(더 보면 뭐가 있나),
   *  "나를 알아보는 것"은 결과물(여긴 뭐가 있나) — 자리와 결이 같아 다섯 행이 한 규칙으로 읽힌다.
   *  🔴 칩 둘을 타이틀 옆에 나란히 두면 375px 에서 줄이 넘어가 제목과 칩의 관계가 끊긴다(실측).
   *     위=접근 조건 / 아래=구독 가치로 나누면 "무료는 여기까지, 더는 구독"이 위아래로 읽힌다.
   *  🔴 이 칩의 유무가 두 섹션을 가르는 신호이기도 하다 — "나를 알아보는 것" 2종은 유료 확장
   *     자체가 없어서 안 붙는다. */
  paidChip?: string;
  /** 타일에 들어갈 것. 아이콘 파일 경로이거나, 타로면 카드 이미지. */
  image: string;
}

export default function FreeList({
  items,
  title,
  mark,
}: {
  items: FreeListItem[];
  title: string;
  mark: SectionMarkKind;
}) {
  return (
    <section>
      {/* 섹션 타이틀 — 골드 3px 바 → SectionMark 글리프(2026-09-24).
          타이포는 홈·/fortune 과 같은 **본문체 15px bold** 로, font-display(Cafe24Ssurround)를
          일부러 안 쓴다. 하단탭 3개가 나란히 비교되는 면이라 서체까지 맞춰야 한 시스템으로 읽힌다.
          🔴 실측: 본문체 15px bold 가 기존 디스플레이체 16px 보다 **더 넓다**(85.5 vs 80.8px, 5자).
             줄어드는 변경이 아니라 잘림·재배치 회귀가 없다. */}
      <div className="mb-2 flex items-center gap-2">
        <SectionMark kind={mark} />
        <h2 className="text-[15px] font-bold text-eye-purple">{title}</h2>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            onClick={() => trackUiEvent("byeolmaru_free_item_clicked", { meta: { item: it.key } })}
            className="w-full rounded-2xl border border-lilac-mid/20 bg-white p-4 shadow-[0_2px_10px_rgba(159,138,208,0.08)] transition hover:border-lilac-deep/60 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: it.tileBg }}>
                {/*
                  object-cover(40px, 48px 타일 — 2탭 FortuneIcon size=40 과 동일 인셋).
                  🔴 object-contain 이 아니라 object-cover 다: 카드 이미지(1024x1707, ≈0.6:1)를
                  정사각 타일에 넣을 때 이 저장소의 기존 선례(ChatBubble·CardSpreadView·
                  DailyCardDraw·가이드페이지·TarotReportView 등)가 전부 object-cover 로 크롭한다
                  — object-contain 으로 두면 세로로 가는 카드가 타일 안에서 좁은 세로줄로 떠
                  양옆에 그라데이션 배경만 넓게 남는다. 정사각 아이콘(byeoljari·saju_mbti, 256x256)
                  은 원본이 이미 1:1 이라 cover/contain 결과가 수학적으로 동일해 이 변경으로
                  전혀 달라지지 않는다.
                */}
                <Image src={it.image} alt="" width={40} height={40} className="h-10 w-10 object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-eye-purple">{it.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      it.chipTone === "gold" ? "bg-gold-soft/30 text-eye-purple" : "bg-lilac-soft/60 text-lilac-deep"
                    }`}
                  >
                    {it.chip}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-text-light/80">{it.tagline}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {it.paidChip ? (
                    <span className="rounded-full bg-eye-purple/10 px-2 py-0.5 text-[10px] font-bold text-eye-purple">
                      {it.paidChip}
                    </span>
                  ) : null}
                  {it.hashtags.map((h) => (
                    <span key={h} className="rounded-full bg-lilac-soft/60 px-2 py-0.5 text-[11px] font-bold text-lilac-deep">
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * "오늘 볼 것" 3종 — 매일 리셋되는 별마루 고유 콘텐츠.
 * 오늘 타로만 뽑기 상태에 따라 타일 이미지와 칩이 바뀐다(스펙 §12).
 */
export function buildDailyItems(drawn: { cardId: number } | null): FreeListItem[] {
  return [
    {
      key: "saju_today",
      href: "/byeolmaru/saju",
      label: "오늘 사주",
      tagline: "오늘 네 하루가 어떤 결로 흐르는지 봐줄게",
      // 🔴 "축 3종"(연애·돈·일)은 내부 용어였다 — 읽는 사람이 뭘 받는지 몰랐다.
      //    #무료 해시태그는 접근 조건 칩과 중복이라 뺐다(5행 공통).
      hashtags: ["하루흐름"],
      tileBg: "linear-gradient(135deg, #FFF3D6 0%, #EFEAF6 100%)",
      // 🔴 오늘 사주가 목록으로 내려온다(P5 §3 의 "목록에 없다"를 뒤집는다) — 지금은 오늘 타로만
      //    목록이고 오늘 사주는 달력 안 타일이라 진입점 문법이 달랐다. 히어로 타일은 §2 에서 없앴다.
      // 🔴 열람 횟수 제한이 없다 — 매일 갱신될 뿐이라 "하루 1회"가 아니라 "매일"이다(타로·우리와 다름).
      chip: "매일 무료",
      chipTone: "gold",
      paidChip: `구독하면 ${SAJU_PAID_CHARS.toLocaleString("ko-KR")}자 추가`,
      image: "/icons/fortune/daily.webp",
    },
    {
      key: "tarot",
      href: "/byeolmaru/tarot",
      label: "오늘 타로",
      tagline: "카드 한 장으로 오늘을 가볍게 짚어봐",
      // 🔴 해시태그는 행마다 하나로 맞춘다 — 구독 칩이 그 줄 앞자리를 먹어서, 두 개면 이 행만
      //    둘째 줄로 밀려 세 행의 높이가 어긋난다(실측). "#오늘의카드"는 "#하루한장"과 같은 뜻이었다.
      hashtags: ["하루한장"],
      tileBg: "linear-gradient(135deg, #FFF3D6 0%, #F2D78A 100%)",
      chip: drawn ? "오늘 뽑음" : "하루 1회 무료",
      chipTone: "gold",
      paidChip: `구독하면 ${TAROT_PAID_CHARS.toLocaleString("ko-KR")}자 추가`,
      // 🔴 카드 실물 이미지(뒷면/뽑은 카드 앞면)를 쓰던 걸 전용 아이콘으로 바꿨다(2026-09-24).
      //    다섯 행 중 이 행만 사진 결이라 목록에서 혼자 튀었다 — 나머지는 전부 투명 배경의
      //    파스텔 구슬 일러스트다. "오늘 뽑았나"는 칩("오늘 뽑음")이 계속 말한다.
      //    🔴 이 목록의 아이콘은 **투명 배경(RGBA)** 이어야 한다 — 타일 그라데이션이 비쳐야 해서,
      //       흰 배경이면 컬러 타일 위에 흰 사각형이 뜬다.
      image: "/icons/fortune/tarot_daily.webp",
    },
    {
      // 🔴 우리 오늘이 목록으로 내려온다 — 예전엔 달력 판 상단 인연 칩으로만 들어갔다.
      //    한 판이 나·우리 두 주체를 번갈아 가리키면 그 판을 감싼 문구가 한쪽에만 참이 된다
      //    (출석 연속은 내 방문 기록인데 상대 달력 위에 그대로 남았고, "N칸 열림"도 같은 말로
      //    다른 걸 셌다). 오늘 사주·오늘 타로와 **같은 문법**(목록 행 → 자기 페이지 → 무료
      //    요약/구독 전문)으로 맞춰 허브 달력은 1인칭 전용이 됐다.
      // 🔴 `?subject=` 를 안 붙인다 — 상대 선택은 도착지가 스스로 한다(1명이면 자동 선택,
      //    0명이면 걸어두기 유도). 허브가 고를 상대를 알 필요가 없어졌다.
      key: "woori",
      href: "/byeolmaru/woori",
      label: "우리 오늘",
      // 🔴 "걸어둔"은 앱 안에서만 통하는 말이라 뺐다.
      tagline: "그 사람과 나, 오늘 둘 사이가 어떤지 봐줄게",
      hashtags: ["둘사이"],
      tileBg: "linear-gradient(135deg, #F7E3EC 0%, #EFEAF6 100%)",
      // 🔴 하루 1명 생성 상한(PAIR_REPORT_DAILY_LIMIT = 1)이라 "하루 1회"가 참이다.
      chip: "하루 1회 무료",
      chipTone: "gold",
      paidChip: `구독하면 ${PAIR_PAID_CHARS.toLocaleString("ko-KR")}자 추가`,
      // 두 별이 하트를 이루는 아이콘 — 2탭 궁합 상품과 파일을 공유한다(daily.webp 를 오늘 사주가
      // 재사용하는 것과 같은 선례). 이 목록은 아이콘을 새로 만들지 않는다.
      image: "/icons/fortune/compat.webp",
    },
  ];
}

/**
 * "나를 알아보는 것" 2종 — 한 번 보면 끝이고, **href 가 /fortune 으로 탭을 떠난다**.
 * 그게 위 3종과 갈린 기준이다(매일 리셋되는 별마루 고유 ↔ 상시·탭 바깥).
 * 🔴 로그인·생일 없이도 되는 유일한 2종이라 게스트 화면에서 이 섹션이 위로 간다
 *    (ByeolmaruHub 의 EmptyMonthShell). 예전엔 배열 안에서 키로 골라 올렸는데,
 *    목록에 항목이 하나 늘 때마다 조용히 "로그인 없이 됨" 쪽으로 쓸려 들어갔다 —
 *    실제로 오늘 사주가 그렇게 돼 눌러도 같은 로그인 벽으로 되돌아오는 막다른 길이 됐었다.
 *    이제 분류가 배열 순서가 아니라 **함수 소속**이라 그 사고가 구조적으로 안 난다.
 */
export function buildSelfItems(): FreeListItem[] {
  return [
    {
      key: "mbti",
      href: "/fortune/saju-mbti",
      label: "사주 MBTI",
      tagline: "사주로 보는 내 유형 — 문항에 답하면 바로 나와",
      hashtags: ["16유형"],
      // 🔴 두 번째 칩은 위 3종의 구독 칩과 **같은 자리·같은 결**이다 — 거긴 "더 보면 뭐가 있나",
      //    여긴 "여긴 뭐가 있나". 다섯 행이 한 규칙으로 읽히게 하는 게 목적이고, 이 2종엔
      //    유료 확장이 없으니 구독 대신 결과물을 말한다.
      paidChip: "4축 해설까지",
      tileBg: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
      chip: "무료",
      chipTone: "lilac",
      image: "/icons/fortune/saju_mbti.webp",
    },
    {
      key: "byeoljari",
      href: "/fortune/byeoljari",
      label: "별 인연 지도",
      tagline: "내 사람들과의 인연을 별자리로 이어볼게",
      hashtags: ["인연지도"],
      paidChip: "인연 점수 순위",
      tileBg: "linear-gradient(135deg, #E8DEF5 0%, #D4C7EE 100%)",
      chip: "무료",
      chipTone: "lilac",
      image: "/icons/fortune/byeoljari.webp",
    },
  ];
}
