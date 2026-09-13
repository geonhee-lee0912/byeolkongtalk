"use client";

// components/byeolmaru/FreeList.tsx — 허브 "무료로 더 볼 것" 목록 3종(스펙 §3).
// 🔴 2탭(/fortune) 리스트와 **동형**이지만 컴포넌트를 공유하지 않는다:
//    ①이 3종은 FORTUNE_LIST 밖이라 FortuneType 키가 없고 ②FortuneIcon 의 HAS_ICON 에
//    saju_mbti·byeoljari 가 누락돼 이모지 폴백이 뜨며 ③P5 스코프가 2탭을 건드리지 말라고 한다.
//    시각만 복제하고, 좌측 4px 컬러 바를 더한다 — 위 달력 판의 순백 칸과 이 흰 카드가 섞여
//    보이지 않게 하는 구분자다(스펙 §4 경고).
import Image from "next/image";
import Link from "next/link";
import { getCardImagePath, CARD_BACK_IMAGE } from "@/lib/tarot/cards";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export interface FreeListItem {
  /** 계측 안정 축 — 라벨이 바뀌어도 집계가 유지된다. */
  key: string;
  href: string;
  label: string;
  tagline: string;
  hashtags: string[];
  /** 좌측 4px 바 + 타일 배경. 오늘 타로만 골드(스펙 §4). */
  barColor: string;
  tileBg: string;
  /** 상태 칩 — 오늘 타로는 "뽑음/아직"이 데일리 라이브 성격을 한 줄에서 살린다. */
  chip: string;
  chipTone: "gold" | "lilac";
  /** 타일에 들어갈 것. 아이콘 파일 경로이거나, 타로면 카드 이미지. */
  image: string;
}

export default function FreeList({ items }: { items: FreeListItem[] }) {
  return (
    <section>
      {/* 섹션 타이틀 — 골드 3px 바 + 밑줄(스펙 §4) */}
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="h-[3px] w-4 rounded-full bg-gold" />
        <h2 className="font-display text-base text-eye-purple">무료로 더 볼 것</h2>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            onClick={() => trackUiEvent("byeolmaru_free_item_clicked", { meta: { item: it.key } })}
            className="relative w-full overflow-hidden rounded-2xl border border-lilac-mid/20 bg-white p-4 pl-5 shadow-[0_2px_10px_rgba(159,138,208,0.08)] transition hover:border-lilac-deep/60 active:scale-[0.99]"
          >
            {/* 좌측 4px 컬러 바 — 부모가 relative+overflow-hidden+rounded-2xl 라 모서리를 따라 깔끔히 잘린다 */}
            <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ background: it.barColor }} />
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
                <div className="mt-2 flex flex-wrap gap-1">
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

/** 목록 3종의 고정 데이터 — 오늘 타로만 뽑기 상태에 따라 타일 이미지와 칩이 바뀐다(스펙 §12). */
export function buildFreeItems(drawn: { cardId: number } | null): FreeListItem[] {
  return [
    {
      key: "tarot",
      href: "/byeolmaru/tarot",
      label: "오늘 타로",
      tagline: "카드 한 장으로 오늘을 가볍게 짚어봐",
      hashtags: ["하루한장", "오늘의카드"],
      barColor: "#E8C26A",
      tileBg: "linear-gradient(135deg, #FFF3D6 0%, #F2D78A 100%)",
      chip: drawn ? "오늘 뽑음" : "하루 1회 무료",
      chipTone: "gold",
      // 🔴 신규 아이콘을 만들지 않는다 — 타일 자리에 카드 이미지를 직접 넣는다(스펙 §3-1·§12).
      //    안 뽑음 = 뒷면, 뽑음 = 그 카드 앞면. "오늘 뽑았나"가 한 줄에서 보인다.
      image: drawn ? getCardImagePath(drawn.cardId) : CARD_BACK_IMAGE,
    },
    {
      key: "mbti",
      href: "/fortune/saju-mbti",
      label: "사주 MBTI",
      tagline: "사주로 보는 내 유형 — 문항에 답하면 바로 나와",
      hashtags: ["무료", "16유형"],
      barColor: "#9F8AD0",
      tileBg: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
      chip: "무료",
      chipTone: "lilac",
      image: "/icons/fortune/saju_mbti.webp",
    },
    {
      key: "byeoljari",
      href: "/fortune/byeoljari",
      label: "별 인연 지도",
      tagline: "내 인연들을 별자리로 펼쳐볼게",
      hashtags: ["무료", "인연지도"],
      barColor: "#B8A8D8",
      tileBg: "linear-gradient(135deg, #E8DEF5 0%, #D4C7EE 100%)",
      chip: "무료",
      chipTone: "lilac",
      image: "/icons/fortune/byeoljari.webp",
    },
  ];
}
