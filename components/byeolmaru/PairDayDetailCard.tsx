"use client";

import Image from "next/image";
import type { PairDayCell, PairBackdrop } from "@/lib/byeolmaru/pair-day";
import { PAIR_TONE_LABEL, pairMarks } from "@/lib/byeolmaru/pair-day";
import type { PairTaste } from "@/lib/byeolmaru/static-lines";
import { branchAnimal } from "@/lib/byeolmaru/branch-animal";
import { ELEMENT_COLORS } from "@/lib/saju/elements";
import { MARK_CHIP } from "@/lib/byeolmaru/day-label";

// 🔴 2026-09-24 한 장 구조로 바뀌었다(사용자 결정) — 오늘 사주(SajuTodayView+DayDetailCard)·
//    오늘 타로(DailyCardBlock)와 **같은 무료/유료 경계**를 갖기 위해서다.
//    · 무료 taste 는 이제 **자격과 무관하게 항상** 그린다(구독자가 "둘이 어떤 결인지"를 못 읽던 문제 —
//      사주·타로가 P6-4 §5-3① 에서 먼저 고친 것과 같은 결함이 여기 남아 있었다).
//    · 그 아래는 `children` 이 받는다: 자격자면 PairReportView, 비자격자면 PaywallCut(절단선).
//      예전엔 CTA·미끼가 **이 카드 밖** PremiumBlock 이었다 — 별개 카드라 "읽던 글이 끊긴다"는
//      연결이 없어 광고로 읽혔다. **미끼 카드를 이 카드 밖에 되살리지 말 것.**
export default function PairDayDetailCard({
  cell,
  backdrop,
  partnerName,
  taste,
  todayKst,
  children,
}: {
  cell: PairDayCell;
  backdrop: PairBackdrop;
  partnerName: string;
  /** KST 오늘 — taste 시점 프레이밍을 가르는 데만 쓴다. cell.isToday 만으론 과거·미래를
   *  구분할 수 없어서 필요하다(둘 다 isToday=false). */
  todayKst: string;
  /** 무료 taste(~330자, 룰 100%). 자격과 무관하게 항상 그린다 — 절단선 위 구간이다. */
  taste?: PairTaste | null;
  /** 절단선 아래에 들어올 것 — 유료 리포트(PairReportView) 또는 PaywallCut. */
  children?: React.ReactNode;
}) {
  const md = `${Number(cell.date.slice(5, 7))}월 ${Number(cell.date.slice(8, 10))}일`;
  // 칩은 셀 마크와 같은 어휘·같은 글리프를 쓴다(P5-5) — 달력에서 본 ✧ 가 여기서 "설렘"으로 풀린다.
  const marks = pairMarks(cell.tags);
  // 리드는 마크가 아니라 별도 칩(두 사람 점수 비교라 "그날의 원인"이 아니다).
  // 🔴 `${partnerName}가` 는 받침 있는 이름에서 틀린다("지민가") — 무조사 표기로 고정한다
  //    (narrative-prompt.ts 의 formatPairGoodDay 와 같은 표기).
  const leadChip = cell.tags.lead === "me" ? "네가 리드" : cell.tags.lead === "partner" ? `${partnerName} 리드` : null;

  return (
    // DayDetailCard 와 동일하게 aria-live — 그리드에서 다른 날짜/상대를 고르면 이 카드만
    // 갱신되고 포커스는 그리드 버튼에 남는다.
    <section className="rounded-2xl bg-white border border-lilac-mid/20 shadow-[0_8px_30px_rgba(40,30,70,0.08)] p-4" aria-live="polite">
      {/* 🔴 헤더·히어로·등급 세 층을 **사주 탭(DayDetailCard)과 같은 양식**으로 맞췄다
          (2026-09-27, 사용자 요청). 예전엔 같은 정보가 탭마다 다른 모양이었다 —
          간지가 사주는 44px 한자 히어로인데 여긴 헤더 오른쪽 끝 13px 한글이었고,
          등급이 사주는 제목 밑 작은 보조 텍스트인데 여긴 24px 큰 제목이었다.
          🔴 캐릭터는 44px 다(사주와 동일). 56px 이면 아래 한자 히어로와 크기를 다툰다. */}
      <header className="mb-3 flex items-center gap-3">
        {/* ⑦ 일지 캐릭터 — 그날 지지 동물(우리 상세도 동일). */}
        {(() => {
          const a = branchAnimal(cell.ganji);
          return a ? (
            <Image src={a.assetSrc} alt={a.animal} width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
          ) : null;
        })()}
        <h2 className="font-display text-base text-eye-purple">
          {/* 🔴 `{partnerName}와 나` 는 받침에서 틀린다("지민와") — 어순을 뒤집어 조사를 '나'에 붙인다. */}
          나와 {partnerName} · {cell.isToday ? "오늘" : md}
        </h2>
      </header>

      {/* 일진 히어로 — 사주 탭과 같은 규격(44px 한자 + 11px 캡션). 🔴 font-display 를 일부러 안
          쓴다: Cafe24Ssurround 에 천간·지지 22자가 하나도 없어(cmap 실측 0/22) 굵기만 얇아진다.
          🔴 캡션 색은 **그날 천간의 오행 색**(ELEMENT_COLORS) — 사주 탭과 같은 원천이다. */}
      <div className="mb-3 text-center">
        <div className="text-[44px] font-extrabold leading-none tracking-[2px] text-eye-purple">{cell.hanja}</div>
        <div className="mt-3 text-[11px] font-bold" style={{ color: ELEMENT_COLORS[cell.element].text }}>
          {cell.ganji} · {cell.isToday ? "오늘" : "그날"} 들어온 기운 · {cell.element}
        </div>
      </div>

      <p className="text-center font-display text-2xl leading-snug text-eye-purple">{PAIR_TONE_LABEL[cell.tone]}</p>

      {(marks.length > 0 || leadChip) && (
        <ul className="mb-4 flex flex-wrap gap-2">
          {marks.map((m) => (
            // 🔴 나 탭 DayDetailCard 와 같은 솔리드 칩(MARK_CHIP) — 둘 다 상세 화면의 마크 칩이라
            //    같은 문법을 쓴다(2026-09-24). 옛 테두리 필은 색이 아예 없어 마크끼리 구분이 안 됐다.
            <li
              key={m.glyph}
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: MARK_CHIP[m.glyph].bg, color: MARK_CHIP[m.glyph].fg }}
            >
              <span aria-hidden>{m.glyph}</span> {m.label}
            </li>
          ))}
          {leadChip && (
            <li className="rounded-full border border-lilac-mid px-3 py-1 text-xs text-eye-purple">{leadChip}</li>
          )}
        </ul>
      )}

      {/* 🔴 "너희 결" 요약 블록 — 2026-09-24 에 줄글에서 UI 로 바꿨다(사용자 요청).
          예전엔 `든든한 지원군 ↔ 내가 아끼는 사람` / `둘 사이 설렘 · 연월조화 0` 처럼 **본문도 아닌
          정보가 텍스트로 깔려** 진짜 읽을 글(taste·리포트)과 구분이 안 됐다.
          🔴 **전부 룰 데이터다(LLM 0·원가 0)** — 십신 라벨·설렘·척척은 backdrop, 연월조화는 0~4
             카운트(천간합 2 + 육합 2). 새 LLM 필드를 만들지 않았다. */}
      <div className="rounded-xl border border-lilac-soft bg-white/60 p-3">
        <p className="mb-2 text-[11px] font-bold text-text-light">너희 결 · 날짜와 무관한 고정 배경</p>

        {/* 십신 — 서로를 어떻게 보는지. 방향이 다르므로 마주보게 둔다(한 줄 `A ↔ B` 는 누가 누구를
            그렇게 보는지가 안 보였다). */}
        <div className="flex items-stretch gap-2">
          {[
            { who: "내가 보는 그 사람", label: backdrop.labelAtoB },
            { who: `${partnerName}가 보는 나`, label: backdrop.labelBtoA },
          ].map((x) => (
            <div key={x.who} className="flex-1 rounded-lg bg-lilac-soft/50 px-2.5 py-2 text-center">
              <p className="text-[10px] leading-tight text-text-light">{x.who}</p>
              <p className="mt-0.5 text-[12.5px] font-bold leading-tight text-eye-purple">{x.label}</p>
            </div>
          ))}
        </div>

        {/* 고정 신호 — 있을 때만 배지. 없으면 자리 자체를 안 만든다(빈 배지는 "없음"을 강조한다). */}
        {(backdrop.spark || backdrop.bond) && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {backdrop.spark && (
              <li className="rounded-full bg-gold-soft/40 px-2 py-0.5 text-[11px] font-bold text-eye-purple">
                <span aria-hidden>✦</span> 둘 사이 설렘
              </li>
            )}
            {backdrop.bond && (
              <li className="rounded-full bg-lilac/50 px-2 py-0.5 text-[11px] font-bold text-eye-purple">
                <span aria-hidden>◈</span> 둘 사이 척척
              </li>
            )}
          </ul>
        )}

        {/* 연월조화 0~4 — 숫자만 던지면 "0이 나쁜 건가"를 알 수 없다. 4칸 중 몇 칸인지로 보여준다.
            🔴 라벨이 "연월조화"에서 풀어쓴 말로 바뀌었다(2026-09-27, 사용자 요청) — 명리 용어라
               읽는 사람이 무슨 값인지 몰랐다. 원재료는 그대로다(천간합 2 + 육합 2 = 0~4).
               아래 한 줄 설명도 같이 둔다 — 라벨만으로는 "4면 좋은 건가"가 여전히 안 보인다. */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="text-[11px] text-text-light">타고난 궁합</span>
          <ul className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className={`h-1.5 w-5 rounded-full ${i < backdrop.harmony ? "bg-lilac-deep" : "bg-lilac-soft"}`}
              />
            ))}
          </ul>
          <span className="text-[11px] font-bold text-eye-purple">
            {backdrop.harmony}
            <span className="font-normal text-text-light">/4</span>
          </span>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-text-light">
          두 사람 사주가 원래 얼마나 잘 맞물리는지야. 날짜와 상관없이 늘 같아.
        </p>
      </div>

      {/* 🔴 taste 시점 프레이밍 — pair-taste.json 49문장이 "오늘은 …" 현재형이라, 날짜가
          오늘이 아니면 **taste 만** 시제가 어긋난다(헤더·간지·톤은 이미 그날을 가리킨다).
          49문장을 다시 쓰는 대신 이 한 줄로 **읽는 시점**을 옮긴다 — 타로가 2026-09-21 에
          같은 문제를 같은 방식으로 풀었다(DailyCardBlock 의 framed, 커밋 5e26c46).
          🔴 기계 치환("오늘"→"그날")은 그때 기각됐다 — 본문이 현재형이라 "그날은 … 도는
             날이야"가 비문이 된다.
          🔴 타로와 달리 **3분기다.** 타로는 미래 날짜에 카드 행이 없어 2분기로 충분했지만
             (그 파일 주석이 "미래는 이 자리에 오지 않는다"고 적어뒀다), pair cell 은 룰
             계산이라 미래에도 존재해 taste 가 그려진다.
          🔴 미래 문구는 단정하지 않는다 — 별콩이 화법 ①(단정적 예언 금지). "이렇게 흐른다"가
             아니라 "이런 결이 보여". */}
      {!cell.isToday && (
        <p className="mt-3 text-xs text-text-light">
          {cell.date < todayKst
            ? "그날 둘 사이를 보고 별콩이가 건넨 말이야."
            : "그날 둘 사이엔 이런 결이 보여."}
        </p>
      )}
      {/* 무료 구간 — 나 탭 DayDetailCard 의 taste 블록과 같은 골격이라 두 탭이 같은 리듬으로 읽힌다.
          🔴 상단 간격이 프레이밍 줄에 걸린다 — 둘 다 mt-3 이면 한 덩어리로 읽혀야 할 둘 사이가
             벌어진다(그 줄은 이 문단의 머리말이다). 타로의 같은 처리와 값까지 맞췄다. */}
      {taste ? (
        <div className={`${cell.isToday ? "mt-3" : "mt-1.5"} space-y-2 text-sm leading-relaxed text-eye-purple`}>
          <p>{taste.signal}</p>
          <p>{taste.relation}</p>
          <p>{taste.lead}</p>
          <p className="text-text-light">{taste.advice}</p>
        </div>
      ) : null}

      {/* 절단선 아래 — 유료 리포트 또는 PaywallCut. 호출부가 자격으로 가른다. */}
      {children}
    </section>
  );
}
