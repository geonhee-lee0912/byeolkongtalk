import { test } from "node:test";
import assert from "node:assert/strict";
import { EMOTION_OPTIONS } from "../emotions.ts";
import { WELCOME_BONUS_STARS } from "../constants.ts";
import { SPREAD_INFO } from "./spreads.ts";
import { tarotPrice } from "./pricing.ts";
import {
  MENU_TIER_ORDER,
  getMenu,
  getDeepProduct,
  productForReading,
  productPositions,
  productPrice,
} from "./menu.ts";

const TAGS = EMOTION_OPTIONS.map((o) => o.tag);
const ALL = TAGS.flatMap((t) => getMenu(t));

test("질문 10개 모두 메뉴가 있고 3개 또는 4개 — 상품 32개", () => {
  assert.equal(TAGS.length, 10);
  for (const t of TAGS) {
    const n = getMenu(t).length;
    assert.ok(n === 3 || n === 4, `${t}: ${n}`);
  }
  assert.equal(ALL.length, 32);
});

test("끝까지(7장)는 속마음·재회에만", () => {
  const withFull = TAGS.filter((t) => getMenu(t).some((p) => p.tier === "full"));
  assert.deepEqual(withFull, ["걔 속마음이 궁금해", "재회할 수 있을까"]);
});

test("계층 순서 맛보기 → 3장 → 깊게 → 끝까지 · 깊게는 정확히 1개", () => {
  for (const t of TAGS) {
    const tiers = getMenu(t).map((p) => p.tier);
    assert.deepEqual(tiers, MENU_TIER_ORDER.slice(0, tiers.length), t);
    assert.equal(tiers.filter((x) => x === "deep").length, 1, t);
  }
});

test("맛보기 = 원카드 · 3장 = 쓰리카드 · 깊게 = 5~6장 · 끝까지 = 7장 · 투카드 없음", () => {
  for (const p of ALL) {
    const n = SPREAD_INFO[p.spreadType].cardCount;
    if (p.tier === "teaser") assert.equal(p.spreadType, "one_card", p.key);
    if (p.tier === "mid") assert.equal(p.spreadType, "three_card", p.key);
    if (p.tier === "deep") assert.ok(n === 5 || n === 6, p.key);
    if (p.tier === "full") assert.equal(n, 7, p.key);
    assert.notEqual(p.spreadType, "two_card", p.key);
  }
});

test("key 유일 · `${slug}_${tier}` 모양", () => {
  const keys = ALL.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of ALL) assert.match(p.key, new RegExp(`^[a-z]+_${p.tier}$`));
});

test("카드 자리는 비어 있지 않고 카드 수와 같고 서로 다르다", () => {
  for (const p of ALL) {
    const pos = productPositions(p);
    assert.equal(pos.length, SPREAD_INFO[p.spreadType].cardCount, p.key);
    for (const l of pos) assert.ok(l.trim().length > 0, p.key);
    // 화면들이 자리 이름을 React key={label} 로 쓴다 — 한 상품 안에서 겹치면 key 가 충돌한다
    assert.equal(new Set(pos).size, pos.length, p.key);
  }
});

test("가격 = 메뉴판 그룹 가격 — 맛보기 15 · 3장 25 · 깊게 55 · 끝까지 70", () => {
  const byTier = { teaser: 15, mid: 25, deep: 55, full: 70 } as const;
  for (const p of ALL) {
    assert.equal(productPrice(p), tarotPrice(p.spreadType, "menu"), p.key);
    assert.equal(productPrice(p), byTier[p.tier], p.key);
  }
});

test("이름 원칙 — 맛보기만 '한 장으로' 로 끝나고 나머지는 카드 수 접미사 없음(부록 A)", () => {
  for (const p of ALL) {
    if (p.tier === "teaser") assert.match(p.name, /[,?] 한 장으로$/, p.key);
    else assert.doesNotMatch(p.name, /장으로$/, p.key);
  }
});

test("부록 A 전체 스냅샷 — 32개 상품의 계측 키·스프레드·이름·카드 자리(태그별 자리 포함)", () => {
  // 기대값은 스펙 부록 A 표에서 옮겨 적었다(코드 출력을 덤프한 게 아니다) — 이름·스프레드·자리가 바뀌면 여기서 걸린다.
  // key 의 slug 만 부록 A 에 없어 코드 값이 정본이다 — 계측 키라 바꾸면 판정 도중 이벤트가 둘로 쪼개진다.
  // 카드 자리는 productPositions 가 태그를 getPositionLabels 에 넘기는지까지 잠근다(재회·연락·새 인연의 3장 자리는 태그 오버라이드).
  assert.deepEqual(
    ALL.map((p) => [p.key, p.spreadType, p.name, productPositions(p).join(" · ")]),
    [
      // 1. 걔 속마음이 궁금해
      ["feelings_teaser", "one_card", "지금 걔 마음, 한 장으로", "질문의 답"],
      ["feelings_mid", "three_card", "걔와 나, 지금 어떤 사이일까", "나 · 상대방 · 둘 사이의 에너지"],
      ["feelings_deep", "deep_feelings_5", "걔가 망설이는 진짜 이유", "겉으로 보이는 태도 · 진짜 속마음 · 망설이는 이유 · 나에 대한 진심 · 다가올 태도"],
      ["feelings_full", "potential_7", "우리, 앞으로 이어질 수 있을까", "둘러싼 상황 · 나 · 상대방 · 조언 · 도전 요소 · 다음 단계 · 장기 잠재력"],
      // 2. 재회할 수 있을까
      ["reunion_teaser", "one_card", "다시 이어질 수 있을지, 한 장으로", "질문의 답"],
      ["reunion_mid", "three_card", "우리 사이에 아직 남은 게 있을까", "나 · 그 사람 · 남은 결"],
      ["reunion_deep", "reunion_5", "재회를 막고 있는 것", "나의 현재 · 그 사람의 현재 · 막고 있는 문제 · 필요한 행동 · 향후 가능성"],
      ["reunion_full", "reunion_deep_7", "재회, 끝까지 정직하게", "나의 몫 · 그 사람의 몫 · 나의 회복 행동 · 상대의 회복 조건 · 외부 요인 · 회복 가능성 · 재회의 의미"],
      // 3. 언제 연락 올까, 타이밍이 궁금해
      ["contact_teaser", "one_card", "연락 올까? 한 장으로", "질문의 답"],
      ["contact_mid", "three_card", "연락이 닿을 타이밍의 신호", "지금의 흐름 · 전환점 · 다가올 신호"],
      ["contact_deep", "relationship_5", "연락을 기다리는 사이, 서로 바라는 것", "나 · 상대방 · 나의 기대 · 상대의 기대 · 관계의 방향"],
      // 4. 썸, 이 관계 어떻게 될까
      ["some_teaser", "one_card", "이 썸의 지금, 한 장으로", "질문의 답"],
      ["some_mid", "three_card", "우리, 같은 온도일까", "나 · 상대방 · 둘 사이의 에너지"],
      ["some_deep", "relationship_5", "썸에서 연애로, 서로 바라는 것", "나 · 상대방 · 나의 기대 · 상대의 기대 · 관계의 방향"],
      // 5. 요즘 우리, 예전 같지 않아
      ["drift_teaser", "one_card", "요즘 우리 사이, 한 장으로", "질문의 답"],
      ["drift_mid", "three_card", "우리 사이, 뭐가 달라졌을까", "나 · 상대방 · 둘 사이의 에너지"],
      ["drift_deep", "checkin_6", "우리 관계 체크인, 서로에게 필요한 것", "지금의 나 · 지금의 상대 · 둘 사이 에너지 · 내가 필요한 것 · 상대가 필요한 것 · 나아갈 방향"],
      // 6. 새로운 인연, 언제쯤 올까
      ["newlove_teaser", "one_card", "새 인연의 기운, 한 장으로", "질문의 답"],
      ["newlove_mid", "three_card", "인연이 오기 전, 내가 준비할 것", "지금의 나 · 다가올 기류 · 준비할 것"],
      ["newlove_deep", "new_love_5", "다가올 인연은 어떤 사람일까", "나의 준비 상태 · 다가올 인연의 결 · 만남의 환경 · 관계의 성격 · 관계의 방향"],
      // 7. 진로·방향이 고민이야
      ["career_teaser", "one_card", "지금 내 방향, 한 장으로", "질문의 답"],
      ["career_mid", "three_card", "내 길은 지금 어디로 흐르고 있을까", "과거 · 현재 · 미래"],
      ["career_deep", "stay_or_go_6", "남을까 떠날까, 두 갈래 나란히", "현재 상태 · 남을 이유 · 떠날 이유 · 남을 때의 나 · 떠날 때의 나 · 결정의 기준"],
      // 8. 어떤 선택이 맞을지 모르겠어
      ["choice_teaser", "one_card", "마음이 기우는 쪽, 한 장으로", "질문의 답"],
      ["choice_mid", "three_card", "두 갈래 길, 지금의 나에게 맞는 쪽", "선택지 A · 현재 상태 · 선택지 B"],
      ["choice_deep", "stay_or_go_6", "후회하지 않을 선택의 기준", "현재 상태 · A를 고를 이유 · B를 고를 이유 · A 이후의 나 · B 이후의 나 · 결정의 기준"],
      // 9. 직장·학교에서 사람이 어려워
      ["people_teaser", "one_card", "그 사람과 나, 한 장으로", "질문의 답"],
      ["people_mid", "three_card", "그 사람과의 관계, 어디로 흘러갈까", "나 · 상대 · 관계의 흐름"],
      ["people_deep", "deep_feelings_5", "그 사람이 거리를 두는 이유", "겉으로 보이는 태도 · 그 사람의 속마음 · 거리를 두는 이유 · 나에 대한 평가 · 다가올 태도"],
      // 10. 그냥 별콩이한테 털어놓고 싶어
      ["talk_teaser", "one_card", "오늘 내 마음, 한 장으로", "질문의 답"],
      ["talk_mid", "three_card", "요즘 나, 어디가 가장 지쳐 있을까", "마음 · 몸 · 영혼"],
      ["talk_deep", "healing_6", "남아 있는 마음 돌보기", "과거의 패턴 · 남아 있는 상처 · 지금의 상태 · 상처가 드러나는 방식 · 치유의 모습 · 놓아주는 방향"],
    ]
  );
});

test("부록 A — 직장 깊게는 대인 라벨(거리를 두는 이유)", () => {
  const deep = getDeepProduct("직장·학교에서 사람이 어려워")!;
  assert.equal(deep.name, "그 사람이 거리를 두는 이유");
  assert.deepEqual(productPositions(deep), [
    "겉으로 보이는 태도",
    "그 사람의 속마음",
    "거리를 두는 이유",
    "나에 대한 평가",
    "다가올 태도",
  ]);
});

test("productForReading — 메뉴 조합만 복원, 투카드·옛 큐레이션은 null", () => {
  assert.equal(productForReading("재회할 수 있을까", "reunion_5")?.key, "reunion_deep");
  assert.equal(productForReading("걔 속마음이 궁금해", "two_card"), null);
  assert.equal(productForReading("새로운 인연, 언제쯤 올까", "readiness_6"), null);
  assert.equal(productForReading(null, "one_card"), null);
});

test("getMenu — 구 태그는 정규화, 모르는 태그는 빈 배열", () => {
  assert.equal(getMenu("그 사람 마음이 궁금해")[0]?.tag, "걔 속마음이 궁금해");
  assert.deepEqual(getMenu("없는 태그"), []);
  assert.deepEqual(getMenu(null), []);
});

test("가입 선물로 맛보기를 볼 수 있다 — '첫 질문은 공짜' 약속", () => {
  assert.ok(WELCOME_BONUS_STARS >= tarotPrice("one_card", "menu"));
});
