// components/admin/BandGauge.tsx — 최근 8주 분포 위의 현재 위치.
//
// 스펙 §8: 브랜드 골드(#E8C26A)는 시리즈색이 아니라 **현재값 마커 전용**이다.
// 범위를 벗어나면 critical(#d03b3b)로 바뀐다 — "이건 평소 변동이 아니다".
import type { Band, BandAxis } from "@/lib/admin/band";
import { STATUS, GOLD } from "@/lib/admin/colors";
import { formatSignedWon } from "@/lib/admin/format";

export function BandGauge({
  band,
  rolling,
  axis,
  heroIncludesCost,
}: {
  band: Band;
  rolling: number[];
  axis: BandAxis;
  /**
   * 🔴 위 히어로가 API 원가까지 뺀 값을 보여주는가(= 7일 창이 원가로 덮였는가).
   * 히어로는 **7일 창**, 밴드는 **62일 창**으로 각자 원가 가용성을 판단한다 — 둘 다 옳지만
   * 그래서 한동안(원가 축적 7일째 ~ 62일째) **두 숫자의 산식이 다르다.**
   * 그 사실을 캡션이 말하지 않으면 사람이 "왜 기여는 −인데 밴드는 상위지?" 를 못 푼다.
   */
  heroIncludesCost: boolean;
}) {
  const min = Math.min(...rolling);
  const max = Math.max(...rolling);
  const span = max - min || 1; // 전부 같은 값이면 0 나눗셈 — 1로 막는다
  const pos = (v: number) => ((v - min) / span) * 100;

  const left = pos(band.p10);
  const width = pos(band.p90) - left;
  const markerColor = band.outside ? STATUS.critical : GOLD;

  return (
    <div className="mt-4">
      {/* 🔴 flat(8주 값이 전부 같다)이면 막대 자체를 그리지 않는다 — span 폴백(||1) 때문에
          flat 일 때 P10~P90 박스가 폭 0 으로 붕괴하고 마커가 좌측 끝에 박히는데, 캡션은
          "위치를 말할 수 없다"고 한다. 그래픽이 "좌측 끝"이라는 위치를 암시하면 캡션과
          모순된다 — 위치를 말할 수 없으면 위치를 그리지 않는다(코드 리뷰 Minor 2). */}
      {!band.flat && (
        <div className="relative h-8" aria-hidden>
          {/* 전체 범위 */}
          <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded bg-white/10" />
          {/* P10~P90 */}
          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded bg-white/25"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
          {/* 현재값 */}
          <div
            className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded"
            style={{ left: `${pos(band.current)}%`, background: markerColor }}
          />
        </div>
      )}
      <div className="text-[12px] text-white/50 leading-snug">
        {/* 🔴 분포에 폭이 없으면(band.flat = 8주 값이 **전부** 같다) 위치를 말하지 않는다 —
            그때 pctRank 는 100·outside 는 false 라 "분포 중 100% 위치 · 평소 범위 안"이 되어
            **8주 무변동이 역대 최고처럼** 읽힌다 (Task 2 코드 리뷰 지적).
            ⚠️ flat 을 먼저 검사해도 안전한 것은 `flat` 이 **전체 min===max** 로 정의됐기 때문이다.
               `p10 === p90` 으로 정의하면 중간 80% 만 같아도 참이 되고, 그때 꼬리(= 오늘일 수
               있다)가 진짜 이상치라 **flat && outside 가 동시에 참**이 된다 — 이 분기가 진짜
               경고를 삼킨다. 재리뷰가 실행으로 잡은 함정이다. */}
        {band.flat ? (
          <>
            최근 8주 <b className="text-white/75">변동 없음</b> — 분포에 폭이 없어 위치를 말할 수 없다
          </>
        ) : (
          <>
            최근 8주 분포 중 <b className="text-white/75">{band.pctRank.toFixed(0)}%</b> 위치 —{" "}
            {band.outside ? <b style={{ color: STATUS.serious }}>평소 범위 밖</b> : "평소 범위 안"}
          </>
        )}
        <span className="text-white/35">
          {" "}
          · P10 {formatSignedWon(band.p10)} ~ P90 {formatSignedWon(band.p90)}
          {/* 🔴 히어로(7일 창)와 밴드(62일 창)는 원가 가용성을 각자 다른 창으로 판정한다 — 둘 다
              옳지만, 원가가 7일은 덮고 62일은 못 덮는 구간(실측: 2026-09-26~11-20)에는 히어로가
              원가까지 뺀 값인데 밴드는 여전히 매출−광고비 축이라 산식이 갈린다. 그 사실을 말하지
              않으면 "기여는 −인데 밴드는 상위"가 모순처럼 보인다(코드 리뷰 Important). */}
          {axis === "marketing" &&
            (heroIncludesCost
              ? " · ⚠️ 이 분포는 매출 − 광고비 기준이다 — 위 기여 숫자는 원가까지 뺐으므로 기준이 다르다(원가가 8주를 덮으면 합쳐진다)"
              : " · 축 = 매출 − 광고비(원가 미축적)")}
        </span>
      </div>
    </div>
  );
}
