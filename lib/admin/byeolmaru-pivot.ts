// lib/admin/byeolmaru-pivot.ts — long 포맷(그룹, 키, 건수, 사람) → 화면이 읽는 2단 조회. 순수.
//
// 🔴 왜 화면 밖으로 빼나 — 두 가지 계약이 여기 걸려 있고 둘 다 **조용히** 깨진다.
//   ① `'*'`(전체) 행은 DB 가 GROUPING SETS 로 **다시 센** 값이다. 키별 행의 actors 를 앱에서
//      더하면 한 사람이 여러 키에 걸칠 때 중복된다(dev 실측: day_tab 의 키별 사람 3+3+3 인데
//      실제 전체는 3명). 합산 코드를 못 쓰게 이 모듈이 전체를 **조회로만** 내준다.
//   ② PostgREST 는 BIGINT·NUMERIC 을 **문자열로** 준다. 타입은 number 라고 적혀 있어서 tsc 가
//      안 잡는다 — 문자열이 그대로 흐르면 정렬이 사전순이 되고("9" > "78") 포맷터가 NaN 을 뱉는다.
//      이 리포가 반복해서 물린 클래스라(admin 플랜 B) 경계에서 Number() 를 강제한다.

/** (분자, 분모) 한 칸. */
export type Cell = { events: number; actors: number };

export const ZERO_CELL: Cell = { events: 0, actors: 0 };

/** RPC 가 주는 long 행. 값은 런타임에 문자열일 수 있다(PostgREST) — 그래서 unknown 이 아니라 둘 다 받는다. */
export type LongRow = {
  group: string;
  key: string;
  events: number | string;
  actors: number | string;
};

export type Pivot = {
  /**
   * 그룹 전체. `'*'` 행이 없으면 ZERO_CELL — **0 회라는 뜻이다**(RPC 는 창 안에 한 번도 안 찍힌
   * 이벤트의 행을 아예 안 준다). undefined 를 돌려주면 화면이 빈칸이 되어 "0" 과 "지표 없음" 이
   * 구분되지 않는다.
   */
  total: (group: string) => Cell;
  /** 그룹 안의 키별 행(`'*'` 제외), 건수 내림차순. 동수면 키 사전순으로 고정한다(렌더 흔들림 방지). */
  breakdown: (group: string) => { key: string; cell: Cell }[];
};

export function pivotLong(rows: LongRow[]): Pivot {
  const m = new Map<string, Map<string, Cell>>();
  for (const r of rows) {
    const inner = m.get(r.group) ?? new Map<string, Cell>();
    inner.set(r.key, { events: Number(r.events), actors: Number(r.actors) });
    m.set(r.group, inner);
  }
  return {
    total: (group) => m.get(group)?.get("*") ?? ZERO_CELL,
    breakdown: (group) =>
      [...(m.get(group) ?? new Map<string, Cell>())]
        .filter(([k]) => k !== "*")
        .map(([key, cell]) => ({ key, cell }))
        .sort((a, b) => b.cell.events - a.cell.events || a.key.localeCompare(b.key)),
  };
}
