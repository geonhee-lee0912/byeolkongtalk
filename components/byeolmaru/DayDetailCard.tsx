"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { DayCell } from "@/lib/byeolmaru/calendar";
import { getSajuTaste } from "@/lib/byeolmaru/static-lines";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { ELEMENT_COLORS } from "@/lib/saju/elements";
import { DAY_NAME, MARK_CHIP } from "@/lib/byeolmaru/day-label";
import { scoreDisplay } from "@/lib/byeolmaru/calendar-visual";

const AXIS_LABEL: { key: "love" | "money" | "work"; label: string }[] = [
  { key: "love", label: "연애" },
  { key: "money", label: "돈" },
  { key: "work", label: "일" },
];

// 🔴 "그날 뽑은 카드" 블록은 2026-09-27 에 제거됐다(사용자 결정). 사주↔타로를 잇는 다리였지만
//    바로 위에 타로 탭이 있어 같은 걸 두 번 보여주는 것으로 읽혔다. 그 블록이 끌고 있던
//    card/cardHref/cardHint prop 과 호출부의 daily-card fetch 도 같이 걷어냈다 —
//    되살리려면 그 fetch(3상태: undefined=모름 / null=없음 / DailyCard=있음)부터 복원해야 한다.
// 종합운 별점(2026-09-27, 사용자 요청) — 백분위 0~100 을 별 5개로. 20점=한 개, 10점=반개.
// 🔴 원천은 **scoreDisplay(cell.score)** 다 — 달력 칸에 찍히는 바로 그 숫자(오늘 66)와 같은 값을
//    써야 "칸은 66인데 별은 2개"가 안 난다. 원시 score 를 그대로 20으로 나누면 그 사고가 난다.
// 🔴 반개를 쓰는 이유: 실데이터 분포의 절반이 44~71 구간이라(day-score.ts 임계 주석) 정수 5단계로는
//    한 달의 절반이 전부 별 3개로 뭉개진다. 10단계면 그 구간이 2.5~3.5 로 갈린다.
// 🔴 SVG 하나에 clipPath 로 반쪽을 덮는다 — "★"/"☆" 유니코드 두 글자를 섞으면 OS 폰트마다
//    두 글리프의 폭·두께가 달라 줄이 흔들린다(SectionMark.tsx 가 이모지를 버린 것과 같은 이유).
const STAR_PATH = "M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z";
const STAR_GOLD = "#E8C26A";

function ScoreStars({ display }: { display: number }) {
  // 10단계(반개 단위)로 반올림 → 0~5. 0.5 미만도 별 하나는 채운다 — 빈 별 다섯은 "판정 실패"로 읽힌다.
  const filled = Math.max(0.5, Math.round(display / 10) / 2);
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" aria-label={`종합운 5점 만점에 ${filled}점`}>
      {[0, 1, 2, 3, 4].map((i) => {
        // 이 별이 채워지는 비율 — 1(꽉) / 0.5(반) / 0(빈).
        const ratio = Math.min(1, Math.max(0, filled - i));
        return (
          <svg key={i} width="13" height="13" viewBox="0 0 24 24" aria-hidden className="shrink-0">
            <path d={STAR_PATH} fill={STAR_GOLD} opacity={0.22} />
            {ratio > 0 ? (
              <>
                <clipPath id={`star-clip-${i}-${ratio}`}>
                  <rect x="0" y="0" width={24 * ratio} height="24" />
                </clipPath>
                <path d={STAR_PATH} fill={STAR_GOLD} clipPath={`url(#star-clip-${i}-${ratio})`} />
              </>
            ) : null}
          </svg>
        );
      })}
    </span>
  );
}

export default function DayDetailCard({
  cell,
  dayWord,
  children,
}: {
  cell: DayCell;
  /** 그 날을 부르는 말(report-date.ts dayWordFor). 히어로 캡션이 쓴다. */
  dayWord: "오늘" | "그날";
  /** 절단선 아래에 들어올 것 — 유료 리포트 또는 PaywallCut. */
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] p-4">
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
          {/* 🔴 글자색이 **그날 천간의 오행 색**이다(2026-09-27, 사용자 요청) — 줄 끝의 "· 목"을
              색으로도 한 번 더 말한다. 원천은 `lib/saju/elements.ts` 의 ELEMENT_COLORS 로,
              SajuBoard·마이페이지가 쓰는 바로 그 맵이다(여기서 새 색을 만들지 말 것).
              `.text` 를 쓴다 — 셋 중 유일하게 본문용으로 어둡게 잡힌 값이라 cream-warm 위
              대비가 선다(`.bar`/`.bg` 는 면용이라 글자로 쓰면 흐려진다).
              🔴 `mt-1.5`(6px) → `mt-3`(12px) — 44px 한자 바로 밑에 6px 로 붙어 한자의
                 아랫단처럼 읽혔다(사용자 지적). */}
          <div className="mt-3 text-[11px] font-bold" style={{ color: ELEMENT_COLORS[cell.element].text }}>
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
          <ScoreStars display={scoreDisplay(cell.score)} />
          {cell.marks.map((m) => (
            // 🔴 칩 자체가 색면인 솔리드 팔레트(MARK_CHIP) — 셀 배경과 무관하게 대비가 고정된다.
            <span
              key={m.glyph}
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: MARK_CHIP[m.glyph].bg, color: MARK_CHIP[m.glyph].fg }}
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
              {/* 🔴 숫자를 옆에 같이 쓴다(2026-09-27, 사용자 요청) — 막대 길이만으론 "연애가 일보다
                  얼마나 높은지"가 안 읽혔다. 값은 막대 너비와 **같은 `cell.axes[key]`** 다.
                  🔴 `tabular-nums` + 고정폭(w-8) — 안 주면 자릿수(7/45/100)에 따라 막대 끝이
                     들쭉날쭉해져 세 줄이 안 맞는다. `aria-valuenow` 가 이미 값을 말하므로
                     스크린리더 중복을 막으려 aria-hidden 으로 가린다. */}
              <span aria-hidden className="w-8 shrink-0 text-right text-[12px] font-semibold tabular-nums text-eye-purple">
                {cell.axes[key]}
              </span>
            </li>
          ))}
        </ul>

      </div>

      {children}
    </section>
  );
}
