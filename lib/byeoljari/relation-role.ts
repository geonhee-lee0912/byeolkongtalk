// 나(pivot) 기준 관계 역할 라벨 + 오행쌍 표기 + 메타포 줄글. 순수.
// oriented.element(생아|아생|극아|아극|비화) + 나/상대 오행(목화토금수).

const ROLE: Record<string, string> = {
  생아: "곁에서 힘이 되는 인연",
  아생: "내가 마음 쓰게 되는 인연",
  극아: "서로 성장을 밀어붙이는 인연",
  아극: "내가 이끌어 가는 인연",
  비화: "결이 닮은 인연",
};

export function relationRole(element: string): string {
  return ROLE[element] ?? "이어져 있는 인연";
}

const HANJA: Record<string, string> = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };

// A=작용(생/극하는) 오행, B=받는 오행. 생아·극아는 상대가 A, 아생·아극은 나가 A.
function actReceive(
  relation: string,
  myEl: string,
  otherEl: string
): { a: string; b: string; verb: "생" | "극" } | null {
  switch (relation) {
    case "생아": return { a: otherEl, b: myEl, verb: "생" };
    case "아생": return { a: myEl, b: otherEl, verb: "생" };
    case "극아": return { a: otherEl, b: myEl, verb: "극" };
    case "아극": return { a: myEl, b: otherEl, verb: "극" };
    default: return null; // 비화
  }
}

/** "토생금(土生金)". 비화는 "같은 금(金)". 미지 오행이면 한자 괄호 생략. */
export function elementPair(relation: string, myEl: string, otherEl: string): string {
  if (relation === "비화") {
    const h = HANJA[myEl];
    return h ? `같은 ${myEl}(${h})` : `같은 ${myEl}`;
  }
  const ar = actReceive(relation, myEl, otherEl);
  if (!ar) return "";
  const ha = HANJA[ar.a];
  const hb = HANJA[ar.b];
  const hanjaVerb = ar.verb === "생" ? "生" : "剋";
  const paren = ha && hb ? `(${ha}${hanjaVerb}${hb})` : "";
  return `${ar.a}${ar.verb}${ar.b}${paren}`;
}

// 오행 이미지 + 조사(주격, 목적격). 5개 고정이라 정규식 josa 불필요.
const IMG: Record<string, { w: string; subj: string; obj: string }> = {
  목: { w: "나무", subj: "가", obj: "를" },
  화: { w: "불", subj: "이", obj: "을" },
  토: { w: "흙", subj: "이", obj: "을" },
  금: { w: "쇠", subj: "가", obj: "를" },
  수: { w: "물", subj: "이", obj: "을" },
};

const TAIL: Record<string, string> = {
  생아: "살리듯, 곁에 있으면 기운이 차오르는 사이야",
  아생: "키우듯, 내가 마음을 쓰게 되는 사이야",
  극아: "다잡듯, 팽팽하게 마주 서는 사이야",
  아극: "다루듯, 내가 이끌어 가는 흐름이야",
};

/** "흙이 쇠를 살리듯, 곁에 있으면 기운이 차오르는 사이야". 비화 특례. 미지 폴백. */
export function metaphorProse(relation: string, myEl: string, otherEl: string): string {
  if (relation === "비화") {
    const img = IMG[myEl];
    return img ? `같은 ${img.w}처럼 닮아, 말 안 해도 통하는 사이야` : "결이 닮아 통하는 사이야";
  }
  const ar = actReceive(relation, myEl, otherEl);
  const ia = ar ? IMG[ar.a] : undefined;
  const ib = ar ? IMG[ar.b] : undefined;
  const tail = TAIL[relation];
  if (!ar || !ia || !ib || !tail) return "이어져 있는 사이야";
  return `${ia.w}${ia.subj} ${ib.w}${ib.obj} ${tail}`;
}
