"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DayCell } from "@/lib/byeolmaru/calendar";
// 🔴 타입만 가져온다(`import type`) — 이 모듈 본체는 getServiceSupabase 를 끌고 들어오는 서버 래퍼다.
//    값으로 import 하면 클라이언트 번들에 service_role 경로가 딸려 들어간다.
import type { DailyCard } from "@/lib/byeolmaru/daily-card";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import { getSajuTaste } from "@/lib/byeolmaru/static-lines";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { DAY_NAME, MARK_COLOR, MARK_TINT } from "@/lib/byeolmaru/day-label";

const AXIS_LABEL: { key: "love" | "money" | "work"; label: string }[] = [
  { key: "love", label: "연애" },
  { key: "money", label: "돈" },
  { key: "work", label: "일" },
];

export default function DayDetailCard({
  cell,
  dayWord,
  card,
  cardHref,
  cardHint,
  children,
}: {
  cell: DayCell;
  /** 그 날을 부르는 말(report-date.ts dayWordFor). 히어로 캡션이 쓴다. */
  dayWord: "오늘" | "그날";
  /** 그날 뽑힌 카드. 없으면 아래 cardHint 가 그 자리를 설명한다. */
  card: DailyCard | null;
  /** 카드 블록을 누르면 갈 곳(오늘 타로 상세). null 이면 링크 없이 그린다. */
  cardHref: string | null;
  /** 카드가 없을 때 그 자리에 쓸 말 — "아직 안 뽑았어" / "카드는 그날 뽑는 거야". null 이면 블록 자체를 숨긴다. */
  cardHint: string | null;
  /** 절단선 아래에 들어올 것 — 유료 리포트 또는 PaywallCut. */
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-cream-warm p-4">
      {/* 그리드에서 다른 날짜를 고르면 이 카드 내용만 바뀌고 포커스는 그대로 그리드 버튼에 남는다 —
          aria-live 없이는 스크린리더 사용자에게 "선택이 바뀌었다"는 신호가 전혀 안 갔다.
          🔴 live region 은 **무료 블록만** 감싼다(section 전체가 아니다). 아래 {children} 에는 유료
             리포트(~1,800자)가 **몇 초 뒤 비동기로** 꽂히는데, 그게 live region 안이면 그 삽입이
             addition 으로 잡혀 1,800자가 통째로 불쑥 낭독된다. 자손에 aria-live="off" 를 걸어 상속을
             덮는 방법도 있지만 그건 스크린리더 구현 편차가 있다 — 아예 밖에 두면 구조로 보장된다.
             원래 목적(날짜 변경 신호)은 그대로다: 날짜가 바뀌면 이 div 안이 전부 바뀐다. */}
      <div aria-live="polite">
        <header className="mb-3 flex items-center gap-3">
          {/* ⑦ 일지 캐릭터 — 선택한 날의 지지 동물. 아래 일진 히어로(44px 한자)가 시선의 중심을
              가져가므로 56→44px 로 낮춘다(둘이 같은 크기면 상단에서 서로 싸운다). */}
          {(() => {
            const a = branchAnimal(cell.ganji);
            return a ? (
              <Image src={a.assetSrc} alt={a.animal} width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
            ) : null;
          })()}
          <h2 className="font-display text-base text-eye-purple">
            {cell.isToday ? "오늘" : `${Number(cell.date.slice(5, 7))}월 ${Number(cell.date.slice(8, 10))}일`}
          </h2>
        </header>

        {/* 일진 히어로 — 유료 DailyReportCard 에서 올라왔다(§5-1 한 장). 🔴 한자로 크게, 한글은 작게:
            한글 간지는 60갑자 중 일부가 욕설로 읽힌다(丙申=병신). DayCell.hanja 는 Task 1 이 실어준다.
            🔴 **font-display 를 일부러 안 쓴다** — Cafe24Ssurround 에 천간·지지 22자가 단 하나도 없다
               (cmap 실측 0/22). 붙여도 --font-display 스택의 다음인 Noto Sans KR 로 글자별 폴백돼
               무효인데(두부 ☐ 는 안 난다) 굵기만 Noto 기본으로 떨어져, 원본(유료 히어로 52px
               font-extrabold)보다 얇아진다. 그래서 굵기는 font-extrabold 로 직접 준다.
               44<52 는 의도다(한 장 안이라 원본보다 작게). "왜 여기만 font-display 가 없지"로
               되돌리지 말 것 — 되돌리면 히어로가 조용히 얇아진다. */}
        <div className="mb-3 text-center">
          <div className="text-[44px] font-extrabold leading-none tracking-[2px] text-eye-purple">{cell.hanja}</div>
          <div className="mt-1.5 text-[11px] font-bold text-text-light">
            {cell.ganji} · {dayWord} 들어온 기운 · {cell.element}
          </div>
        </div>

        {/* P5-1 — 제목은 십신 하루 이름, 등급(잘 맞는 날/무난한 날/…)은 옆에 작게 남긴다.
            등급은 색·요약 집계의 기준이라 없애지 않고 위계만 내린다.
            마크는 달력 셀이 첫 개만 보여주므로(겹침 실측) 전체 목록은 여기가 유일한 시각 노출 지점이다.
            🔴 DAY_LINE 은 여기 두지 않는다 — 아래 getSajuTaste 의 overall 문장과 결·문형이 겹친다
               (정재 "있는 걸 단단히 하는 날이야" vs overall.caution "지금 있는 걸 단단히 여미는 게 어울려").
               한 줄은 허브 히어로가 쓴다(taste 블록이 없는 자리). 뱅크마다 집은 하나씩. */}
        <p className="text-center font-display text-2xl leading-snug text-eye-purple">{DAY_NAME[cell.tenGod]}</p>
        <div className="mb-3 mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span className="text-sm text-text-light">{cell.grade.label}</span>
          {cell.marks.map((m) => (
            // 🔴 MARK_COLOR 는 배경 틴트로만(§11-2-1) — 4종 다 상대휘도 .22~.36 이라 이 옅은 판 위
            //    작은 글자로 쓰면 WCAG AA 에 수학적으로 도달이 안 된다. 글자는 night-deep 고정.
            //    실측: night-deep 이면 8조합 전부 9.5~12.6:1 / MARK_COLOR 를 글자로 쓰면 1.8~3.1:1.
            <span
              key={m.glyph}
              className="rounded-full px-2 py-0.5 text-[11px] font-bold text-night-deep"
              style={{ background: `${MARK_COLOR[m.glyph]}${MARK_TINT[m.strength]}` }}
            >
              <span aria-hidden>{m.glyph}</span> {m.label}
            </span>
          ))}
        </div>

        {/* ⑥/1C 무료 오늘 사주 taste — 전반+연애+일·돈+조언 구조 정적(날짜별 variant 로테이션). 슬롯별 뱅크 미스면 그 조각만 생략. */}
        {(() => {
          const t = getSajuTaste(cell.grade.tone, cell.axes, cell.relation, cell.date);
          return (
            <div className="mb-4 space-y-2 text-sm leading-relaxed text-eye-purple">
              {t.overall ? <p>{t.overall}</p> : null}
              {t.love ? <p><span className="font-bold">연애</span> — {t.love}</p> : null}
              {(t.work || t.money) ? <p><span className="font-bold">일·돈</span> — {[t.work, t.money].filter(Boolean).join(" ")}</p> : null}
              {t.advice ? <p className="text-text-light">{t.advice}</p> : null}
            </div>
          );
        })()}

        <ul className="space-y-2">
          {AXIS_LABEL.map(({ key, label }) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-8 text-sm text-text-light">{label}</span>
              {/* 축 값은 막대 너비로만 표현돼 스크린리더엔 안 보였다 — progressbar ARIA 로 값을 노출 */}
              <div
                role="progressbar"
                aria-valuenow={cell.axes[key]}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
                className="h-2 flex-1 overflow-hidden rounded-full bg-lilac-soft"
              >
                <div
                  className="h-full rounded-full bg-lilac-deep"
                  style={{ width: `${cell.axes[key]}%` }}
                />
              </div>
            </li>
          ))}
        </ul>

        {/* 그날 뽑은 카드(§4) — 한 장 안에서 사주와 타로가 만나는 자리. 요약만 싣는다(이미지·이름·
            정역·키워드): 카드 **해석**은 /byeolmaru/tarot 몫이라 여기서 되풀이하면 두 화면이 같은 걸 판다. */}
        {(() => {
          // 🔴 카드 마스터 불일치 방어를 **블록 조건으로 끌어올린다.** 안쪽에서 null 을 반환하면
          //    border-t + "그날 뽑은 카드" 헤딩만 남은 빈 껍데기가 된다 — 빈 껍데기를 남기는 건 방어가
          //    아니다. (예전 주석의 "DailyCardBlock 과 같은 방어"는 사실이 아니었다: 저쪽은 블록 전체
          //    IIFE 최상단에서 return null 이라 헤딩까지 함께 사라진다. 이제 여기가 그 동작과 같다.)
          //    실도달은 isValidCardId 가 cardId 범위를 막아 거의 불가능하다.
          const t = card ? getCard(card.cardId) : null;
          // 그릴 카드도 없고 대신 할 말(cardHint)도 없으면 블록 자체를 숨긴다.
          if (!t && !cardHint) return null;
          const body = card && t ? (
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-[34px] shrink-0 overflow-hidden rounded shadow-sm">
                <Image
                  src={getCardImagePath(card.cardId)}
                  alt={t.name_kr}
                  fill
                  sizes="34px"
                  className={`object-cover ${card.reversed ? "rotate-180" : ""}`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-eye-purple">
                  {t.name_kr} <span className="text-xs text-text-light">· {card.reversed ? "역위" : "정위"}</span>
                </p>
                <p className="mt-0.5 text-xs text-text-light">{(card.reversed ? t.reversed : t.upright).join(", ")}</p>
              </div>
            </div>
          ) : null;
          return (
            <div className="mt-4 border-t border-lilac-mid/20 pt-3">
              {/* 🔴 굵기는 font-extrabold — 바로 아래 children 으로 들어오는 DailyReportCard(embedded)의
                  섹션 헤딩이 같은 12.5px·같은 #4A4458 에 extrabold 다. bold 로 두면 한 장 안에서 같은
                  위계의 헤딩이 굵기만 다르게 보인다(mb 도 1.5 로 맞췄다). */}
              <div className="mb-1.5 text-[12.5px] font-extrabold text-[#4A4458]">{dayWord} 뽑은 카드</div>
              {body ? (
                // 링크면 눌리는 티를 낸다 — className 이 없으면 hover·키보드 포커스 표시가 전혀 없다.
                cardHref ? (
                  <Link
                    href={cardHref}
                    className="block rounded-lg transition hover:bg-lilac-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lilac-deep"
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )
              ) : (
                <p className="text-sm text-text-light">
                  {cardHint}
                  {cardHref ? (
                    <>
                      {" "}
                      <Link href={cardHref} className="text-lilac-deep underline">
                        뽑으러 가기 →
                      </Link>
                    </>
                  ) : null}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {children}
    </section>
  );
}
