// 계약: 디자인 공통 규칙(글자·모서리·그림자·글자색·버튼·카드·장식·이모지)이 다시 흩어지지 않게 잠근다.
// 값의 정본은 app/globals.css 의 @theme·@utility 한 곳. 스펙 docs/superpowers/specs/2026-11-09-디자인-다듬기-공통-design.md
// 예외: 파일 전체는 ALLOW 목록(이유와 함께), 줄 하나는 그 줄이나 바로 윗줄에 `design-allow: <이유>` 주석.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { classBlocks, offenders, sources } from "./design-scan";
import { TAG_HERO } from "./seo/tag-hero";

const css = () => readFileSync("app/globals.css", "utf8");

test("토큰 값이 스펙과 같다", () => {
  const c = css();
  const want: Record<string, string> = {
    "--text-11": "0.6875rem", "--text-11--line-height": "1rem",
    "--text-12": "0.75rem", "--text-12--line-height": "1.125rem",
    "--text-13": "0.8125rem", "--text-13--line-height": "1.25rem",
    "--text-14": "0.875rem", "--text-14--line-height": "1.3125rem",
    "--text-15": "0.9375rem", "--text-15--line-height": "1.375rem",
    "--text-16": "1rem", "--text-16--line-height": "1.625rem",
    "--text-17": "1.0625rem", "--text-17--line-height": "1.5rem",
    "--text-20": "1.25rem", "--text-20--line-height": "1.75rem",
    "--text-22": "1.375rem", "--text-22--line-height": "1.875rem",
    "--text-28": "1.75rem", "--text-28--line-height": "2.25rem",
    "--text-44": "2.75rem", "--text-44--line-height": "1",
    "--text-52": "3.25rem", "--text-52--line-height": "1",
    "--color-text-light": "#726398",
    "--color-accent": "#775CB0",
    "--color-accent-on-dark": "#9F8AD0",
    "--color-text-faint": "#978AB3",
    "--color-inner": "#FBF8FE",
    "--color-gold-wash": "#FBF1D6",
    "--color-cream": "#F6F5F2",
    "--color-disabled": "#E7E5E1",
    "--color-disabled-text": "#A5A1AA",
    "--shadow-card": "0 1px 4px rgba(90, 62, 140, 0.08)",
    "--shadow-float": "0 4px 16px rgba(40, 30, 70, 0.12)",
    "--shadow-float-up": "0 -4px 16px rgba(40, 30, 70, 0.12)",
    "--shadow-modal": "0 8px 32px rgba(31, 23, 53, 0.25)",
  };
  for (const [k, v] of Object.entries(want)) {
    const m = c.match(new RegExp(`${k.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`));
    assert.equal(m?.[1].trim(), v, k);
  }
});

test("루트 글자 크기가 16px 로 고정이다", () => {
  assert.match(css(), /\bhtml\s*\{[^}]*font-size:\s*16px/);
});

test("입력칸 16 규칙이 레이어 밖에 있다", () => {
  const c = css();
  const i = c.indexOf("@media (pointer: coarse)");
  assert.ok(i >= 0, "pointer: coarse 규칙 없음");
  assert.match(c.slice(i, i + 200), /input,\s*textarea,\s*select\s*\{\s*font-size:\s*16px/);
  const before = c.slice(0, i);
  const opens = (before.match(/@layer[^{;]*\{/g) ?? []).length;
  assert.equal(opens, 0, "입력칸 규칙이 @layer 안에 있으면 text-* 유틸리티에 진다");
});

test("못 누르는 주 버튼은 흐리게가 아니라 회색 바탕·회색 글자다(디자인 다듬기 ② 운영자 B안 11-12)", () => {
  const block = css().match(/@utility btn-primary\s*\{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
  assert.match(block, /&:disabled\s*\{[^}]*background-color:\s*var\(--color-disabled\)/);
  assert.match(block, /&:disabled\s*\{[^}]*color:\s*var\(--color-disabled-text\)/);
  assert.match(block, /&:disabled\s*\{[^}]*opacity:\s*1/);
});

test("부품 클래스가 있다", () => {
  const c = css();
  for (const u of ["btn", "btn-primary", "btn-secondary", "btn-text", "btn-lg", "btn-md", "btn-sm", "card", "card-report", "card-inner", "card-night", "bg-night-card"]) {
    assert.match(c, new RegExp(`@utility ${u}\\s*\\{`), u);
  }
});

test("조립식 임의값 클래스가 없다", () => {
  assert.deepEqual(offenders(/(text|rounded|shadow)-\[\$\{/), []);
});

// ── 글자 크기 10단계(스펙 §2.2) — text-11·12·13·14·15·16·17·20·22·28 + 큰 숫자 44·52 만
test("임의 px 글자 크기가 없다", () => {
  assert.deepEqual(offenders(/\btext-\[\d+(\.\d+)?px\]/), []);
});
test("Tailwind 기본 글자 크기를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?<![\w-])text-(xs|sm|base|lg|xl|[2-9]xl)\b/), []);
});


// ── 모서리 4단계(스펙 §2.3) — rounded-lg 8 · xl 12 · 2xl 16 · 3xl 24 · full, 말풍선 꼬리만 -sm
test("임의 모서리 값이 없다", () => {
  assert.deepEqual(offenders(/\brounded(-[a-z]{1,2})?-\[/), []);
});
test("rounded-md 와 맨 rounded 를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/\brounded(-(t|b|l|r|tl|tr|bl|br))?-md\b|(?<![\w-])rounded(?=[\s"'`])/), []);
});


// ── 그림자 3단계(스펙 §2.4) — shadow-card · shadow-float(-up) · shadow-modal 만
// drop-shadow-* 는 그림·아이콘에 거는 필터라 이 규칙 밖(상자 그림자만 본다)
test("임의·기본 그림자를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?<!drop-)\bshadow-(\[|sm\b|md\b|lg\b|xl\b|2xl\b)|(?<![\w-])shadow(?=[\s"'`])/), []);
});
test("그림자 색 접미사가 없다", () => {
  assert.deepEqual(offenders(/\bshadow-(lilac|night|lilac-deep|gold|gold-soft|eye-purple)(\/\d+)?\b/), []);
});


// ── 글자색 4개(스펙 §2.5) — 투명도 글자 없음, 밝은 바탕 연보라 글자는 accent, 밤 바탕은 accent-on-dark
test("투명도 글자를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/\btext-text-light\/\d+/), []);
});
test("밝은 바탕에서 연보라 글자를 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?<![\w-])text-lilac-deep\b/), []);
});

// ── 버튼 종류 3 × 크기 3(스펙 §2.6) — btn + btn-primary|secondary|text + btn-lg|md|sm
const BUTTONS = () => classBlocks(["button", "Link", "a", "BirthPromptButton", "OverlayCloseButton"]); // className 을 그대로 넘기는 버튼 래퍼 포함
const at = (b: { file: string; line: number }) => `${b.file}:${b.line}`;
test("버튼 바탕에 진보라·흰 글자 조합을 쓰지 않는다(주 버튼은 btn-primary, 선택 상태는 bg-accent)", () => {
  const solid = /(?<![\w:-])bg-(lilac-deep|eye-purple)(?![\w/-])[^"'`]*\btext-white\b|\btext-white\b[^"'`]*(?<![\w:-])bg-(lilac-deep|eye-purple)(?![\w/-])/;
  assert.deepEqual(BUTTONS().filter((b) => solid.test(b.cls)).map(at), []);
});
// 금색 구독·별 버튼, 회사 규정(카카오·애플), 위험(탈퇴·삭제), 목록 줄은 제외
const NOT_PART = /FEE500|bg-black|rose-|bg-gold\b|text-left|design-allow/;
test("큰 버튼은 부품 클래스를 쓴다", () => {
  const big = BUTTONS().filter((b) => /\bw-full\b/.test(b.cls) && /\bpy-(3|3\.5|4)\b/.test(b.cls) && /\bfont-bold\b/.test(b.cls) && !/\bbtn\b/.test(b.cls) && !NOT_PART.test(b.cls));
  assert.deepEqual(big.map(at), []);
});
test("카카오·애플 버튼은 규정 색을 유지한다", () => {
  const kakao = BUTTONS().filter((b) => /FEE500/.test(b.cls));
  // 5 — 타로 결과 공유(11-14, 8→7)·운세 결과 공유(11-16, 7→6)는 '공유하기' 하나 + 시트로 바뀌어 노란 바탕이 버튼이 아니라 시트 안 동그라미에 있다
  //   · 별마루 비로그인 첫 화면(11-21, 6→5)은 노란 '카카오로 시작하고 내 달력 받기' 대신 맨 위 '?' 칸 한 줄(로그인 화면에서 카카오·Apple 을 고른다)
  assert.ok(kakao.length >= 5, `카카오 버튼이 사라졌다: ${kakao.length}`);
  assert.deepEqual(kakao.filter((b) => /\bbtn-(primary|secondary|text)\b/.test(b.cls)).map(at), []);
  assert.match(readFileSync("components/auth/AppleLoginButton.tsx", "utf8"), /bg-black/);
});

// ── 카드 3종(스펙 §2.7) — card(바닥, 그림자만) · card-inner(안쪽 칸, 테두리+아주 옅은 바탕) · card-night
test("반투명 흰 카드가 없다", () => {
  assert.deepEqual(offenders(/(?<![\w:-])bg-white\/(70|75|80|85|90|95)\b/), []);
});
test("카드는 테두리와 그림자를 같이 쓰지 않는다", () => {
  assert.deepEqual(offenders(/(?=.*\bshadow-card\b)(?=.*(?<![\w:-])border(?![\w-]*-(0|t|b|l|r|x|y)\b)(\s|-lilac|-gold|-cream|-white|"))/), []);
});
// 입력칸(input·textarea)은 카드가 아니라 이 규칙 밖. 말풍선(꼬리 -sm)·창 판(max-w-)·입력칸 모양 선택 상자(Dropdown)도 제외
test("크림 바탕 둥근 칸을 카드로 쓰지 않는다(card · card-inner 로)", () => {
  const blocks = classBlocks(["div", "section", "article", "li", "a", "Link", "button", "p"]).filter(
    (b) =>
      /(?<![\w:-])bg-cream-warm(?![\w/-])/.test(b.cls) &&
      /\brounded-(xl|2xl)\b/.test(b.cls) &&
      !/rounded-(tl|tr|bl|br)-sm|max-w-/.test(b.cls) &&
      b.file !== "components/common/Dropdown.tsx" &&
      b.file !== "components/safety/SafetyBanner.tsx", // 위기 안내 — 톤을 지키려고 바탕·테두리 그대로
  );
  assert.deepEqual(blocks.map(at), []);
});

// ── 장식 정리(스펙 §2.8) — 그라데이션·빛·움직임은 장면과 기능에만
const SCENE_FILES = [
  "components/relationship/sim/", // 연애 시뮬 무대 조명·밤 배경
  "app/relationship/sim/page.tsx", // 시뮬 화면 밤 배경
  "components/common/EmphasisText.tsx", // 형광펜 밑줄
  "components/fortune/landing/FortuneSamplePreview.tsx", // 글 끝 흐림
  "components/fortune/FortuneGeneratingScreen.tsx", // 진행 막대
  "components/byeolmaru/CardReportView.tsx", // 줄무늬 게이지
  "components/relationship/DollAvatar.tsx", // 아바타 색
  "components/tarot/CardDrawRitual.tsx", // 카드 뽑기 의식
  "lib/heroGradients.ts", // 히어로 배너 밤하늘 장면
];
test("카드·배너·버튼·타일에 그라데이션이 없다", () => {
  assert.deepEqual(offenders(/linear-gradient|radial-gradient|bg-gradient-to-/, SCENE_FILES), []);
});
test("반짝·둥둥 움직임이 없다", () => {
  // 움직임은 로딩·카드 뽑기·시뮬 무대에만
  assert.deepEqual(offenders(/animate-(star-twinkle|float)\b/, ["components/fortune/FortuneGeneratingScreen.tsx", "components/tarot/CardDrawRitual.tsx", "components/relationship/sim/"]), []);
});
test("배경 빛 덩어리가 없다", () => {
  assert.deepEqual(offenders(/(?<![\w-])blur-3xl\b/), []);
});
test("시트·창 뒤 막은 하나다", () => {
  assert.deepEqual(offenders(/backdropClassName=(?!"bg-night\/50 backdrop-blur-sm")/), []);
  assert.match(readFileSync("components/common/Dialog.tsx", "utf8"), /backdropClassName = "bg-night\/50 backdrop-blur-sm"/);
});
test("별콩이 후광은 한 값이다(bg-gold/30 blur-lg)", () => {
  assert.deepEqual(offenders(/bg-gold\/(25|40)\b[^"]*\bblur-|\bblur-(xl|2xl)\b[^"]*bg-gold|bg-gold\/\d+[^"]*\bblur-(xl|2xl)\b/), []);
});

// ── 이모지(스펙 §2.1) — 화면 글자에 이모지·기호를 쓰지 않는다(면 아이콘 Icon · 기존 일러스트로)
// 프롬프트·공유 문구·날짜 기호(✧◇△◈)는 제외. 줄 끝 주석(// …)은 화면 글자가 아니라 본다.
const EMOJI_ALLOW = [
  "lib/claude.ts", "lib/byeolmaru/narrative-prompt.ts", "lib/fortune/prompt.ts", "lib/emotion-persona.ts", "lib/relationship/sim.ts", // 모델 지시문
  "components/saju/ShareButtons.tsx", "components/tarot/TarotShareButtons.tsx", "lib/kakao-share.ts", // 카톡·복사 공유 문구
  "lib/byeolmaru/day-label.ts", // 별마루 날짜 기호 정본
  "lib/push/templates.ts", // 앱 푸시 알림 문구(밖으로 나가는 글)
  "lib/analytics/route-labels.ts", // 어드민 분석 라벨
  "lib/tarot/user-turn.ts", // 사용자 말 판별 정규식(★☆ 꼬리 = 잡음) — 화면 글자 아님
  "app/fortune/result/page.tsx", // 결과 복사·공유 문구 빌더(별점 ★☆·▪) — 화면 글자는 변환 때 정리함
];
test("화면 글자에 이모지가 없다", () => {
  const EMO = /[\p{Extended_Pictographic}✦✓✕★☆→←↑↓▾▴▸▼›]/u;
  const blanked = new Map<string, string[]>(); // 여러 줄 주석을 지운 파일 줄
  const lineOf = (file: string, n: number) => {
    if (!blanked.has(file)) {
      const t = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
      blanked.set(file, t.split("\n"));
    }
    return blanked.get(file)![n - 1];
  };
  const hits = offenders(/./, EMOJI_ALLOW).filter((at) => {
    const i = at.lastIndexOf(":");
    const line = lineOf(at.slice(0, i), +at.slice(i + 1));
    return !line.includes("shareText:") && EMO.test(line.replace(/\r$/, "").replace(/\s\/\/\s.*$/, ""));
  });
  assert.deepEqual(hits, []);
});

// ── 글자 고정(스펙 §2.2) — 안드로이드 웹뷰가 기기 글자 배율을 따라가지 않게
test("앱 웹뷰 글자 배율을 100 으로 고정한다", () => {
  assert.match(readFileSync("mobile/src/WebScreen.tsx", "utf8"), /<WebView<object>[\s\S]*?textZoom=\{100\}/);
});

// ── 최종 리뷰에서 잡힌 회귀 잠금
test("관계 전환: + 버튼은 아바타와 같은 56px 원, 이름 칸은 11px 5자가 들어가는 폭", () => {
  const s = readFileSync("components/relationship/HubSwitcher.tsx", "utf8");
  assert.match(s, /aria-label="새 사람 추가"\s*className="[^"]*\bw-14 h-14 rounded-full\b/);
  assert.doesNotMatch(s, /max-w-\[52px\]/);
});
// 이모지를 지우다 남은 '빈 글자' — 별점(★☆)·완료 표시(✓) 같은 정보 기호가 빈 문자열이 되면 화면에서 조용히 사라진다(PR #41 Codex 지적)
test("빈 문자열 반복·양쪽 빈 조건식이 없다(정보 기호는 Icon 으로)", () => {
  // 속성 값(data-x={c ? "" : undefined})과 `?? ""` 는 정상 코드라 제외
  assert.deepEqual(offenders(/""\.repeat\(|(?<!\?)\?\s*""\s*:\s*""\s*\}|(?<!=)\{\s*\w+\s*\?\s*""\s*:\s*\w+\s*\}/), []);
});
// 장식 기호(✦)를 지우다 남은 '끊긴 구분선' — "선 ✦ 선" 에서 가운데만 비어 두 선 사이에 틈이 생긴다(디자인 다듬기 ② 홈에서 발견)
test("구분선 두 개 사이가 빈 채로 남은 곳이 없다", () => {
  const hits: string[] = [];
  for (const p of sources()) {
    const text = readFileSync(p, "utf8");
    if (/<span[^>\n]*\bh-px\b[^>\n]*\/>\s*\n\s*\n\s*<span[^>\n]*\bh-px\b/.test(text)) hits.push(p.replace(/\\/g, "/"));
  }
  assert.deepEqual(hits, []);
});

test("빈 버튼이 없다(닫기 ✕ 를 지우고 아이콘을 안 넣은 곳 — 11-12 발견, 13곳)", () => {
  const hits: string[] = [];
  for (const p of sources()) {
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/<(OverlayCloseButton|button)\b[^>]*>\s*<\/\1>/g)) {
      hits.push(`${p.replaceAll(String.fromCharCode(92), "/")}:${text.slice(0, m.index).split(String.fromCharCode(10)).length}`);
    }
  }
  assert.deepEqual(hits, []);
});

// 이모지를 지운 자리가 '공백만 있는 줄'로 남은 요소 — 위 빈 버튼 검사는 속성 안 `=>` 의 `>` 에서 끊겨 이런 곳을 놓쳤다
// (11-22 알림 수신거부 줄 닫기 버튼 · 위기 안내 띠 아이콘 등). 우리 사이는 서비스 종료(11-21)라 화면에 안 나와 뺀다
test("이모지를 지운 빈 줄만 남은 요소가 없다", () => {
  const hits: string[] = [];
  for (const p of sources()) {
    const file = p.replaceAll(String.fromCharCode(92), "/");
    if (file.includes("components/relationship/")) continue;
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/>[ \t]*\r?\n[ \t]+\r?\n[ \t]*<\/[A-Za-z]+>/g)) {
      hits.push(`${file}:${text.slice(0, m.index).split(String.fromCharCode(10)).length + 1}`);
    }
  }
  assert.deepEqual(hits, []);
});

// 디자인 다듬기 묶음 9 ①② A(운영자 11-22) — 밝은 읽을거리엔 밤 카드·금색 버튼을 쓰지 않고, 한 화면에 주 버튼은 하나
test("읽을거리 상담 권유: 흰 카드·진보라 버튼, 오늘의 카드는 뽑기 전엔 뽑기가·뽑은 뒤엔 상담이 주 버튼", () => {
  const cta = readFileSync("components/seo/GuideCta.tsx", "utf8");
  assert.doesNotMatch(cta, /bg-night-card|bg-gold/);
  assert.match(cta, /quiet \? "btn-secondary" : "btn-primary"/);
  const draw = readFileSync("components/seo/DailyCardDraw.tsx", "utf8");
  assert.match(draw, /onClick=\{draw\}\s*className="btn btn-primary btn-lg/);
  assert.match(draw, /<GuideCta[^>]*quiet=\{!drawn\}/);
  // 오늘의 카드 페이지에 권유 칸이 따로 또 서면 두 개가 된다
  assert.doesNotMatch(readFileSync("app/(content)/free/daily-card/page.tsx", "utf8"), /<GuideCta/);
});

// 디자인 다듬기 묶음 9 ③ H3(운영자 11-22 '짜르지 말고 정비율로 줄이고 좌우에 배경')
test("가이드 첫 화면: 낮은 배너에 그림은 자르지 않고, 큰 제목은 앱에서만 숨긴다", () => {
  const s = readFileSync("app/(content)/guide/page.tsx", "utf8");
  assert.match(s, /aspect-\[21\/10\]/);
  assert.match(s, /aspect-\[900\/672\]/); // 원본 비율 그대로
  assert.doesNotMatch(s, /object-cover/);
  assert.match(s, /<h1 className="web-only /);
});

// 디자인 다듬기 묶음 9 ④ S1(운영자 11-22) — 배열을 설명하는 자리엔 카드 뽑기와 같은 배치 그림
test("스프레드 상세: 배열 그림이 카드 뽑기와 같은 배치 자료를 쓰고, 자리 이름 목록을 따로 또 두지 않는다", () => {
  const page = readFileSync("app/(content)/guide/spreads/[slug]/page.tsx", "utf8");
  assert.match(page, /<SpreadDiagram /);
  assert.doesNotMatch(page, /<ol|SPREAD_POSES/);
  for (const f of ["components/tarot/CardDrawRitual.tsx", "components/seo/SpreadDiagram.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /from "@\/lib\/tarot\/slot-layout"/, f);
    assert.doesNotMatch(s, /\[\[0, 1, 2\]/, `${f}: 배치를 따로 베끼지 않는다`);
  }
});

// 디자인 다듬기 묶음 9 ⑤ T1(운영자 11-22) — 읽을거리 안 이동은 버튼이 아니라 목록 한 칸(주 버튼은 상담 권유 하나)
test("테마 글의 스프레드: 큰 버튼 대신 한 카드 목록(카드 그림·이름·장수·한 줄 설명)", () => {
  const s = readFileSync("app/(content)/guide/themes/[tag]/page.tsx", "utf8");
  assert.doesNotMatch(s, /btn-secondary/);
  assert.match(s, /divide-y/);
  assert.match(s, /name="sparkle"/);
  assert.match(s, /\.tagline/);
});

// 디자인 다듬기 묶음 9 테마 첫 그림 A(운영자 11-22) — 가이드 첫 화면 H3 와 같은 낮은 배너
test("테마 첫 그림: 낮은 배너에 자르지 않고, 바탕이 구워진 그림은 좌우를 그 그림의 색으로 잇는다", () => {
  const s = readFileSync("app/(content)/guide/themes/[tag]/page.tsx", "utf8");
  assert.match(s, /aspect-\[21\/10\]/);
  assert.match(s, /aspect-\[900\/672\]/); // 원본 비율 그대로
  assert.doesNotMatch(s, /object-cover|aspect-\[4\/3\]/);
  // 앱 헤더와 다른 글이라 제목은 앱에서도 보이고, 낱말 중간에서 끊지 않는다
  assert.match(s, /<h1 className="(?![^"]*web-only)[^"]*break-keep[^"]*text-pretty/);
  for (const [slug, hero] of Object.entries(TAG_HERO)) {
    // webp 4종 = 바탕이 구워진 그림(2% 간격 51색 — 새 인연의 지평선이 이어지는 간격), PNG 6종 = 투명
    const stops = hero.bg?.match(/#[0-9a-f]{6} \d+%/g)?.length ?? 0;
    assert.equal(stops, hero.src.endsWith(".webp") ? 51 : 0, slug);
  }
});

// 디자인 다듬기 묶음 9 마지막(운영자 11-22 A) — 화면 글 '화살표 없음'을 읽을거리 본문(json)에도. 코드 검사는 json 을 안 본다
test("읽을거리 본문: 화살표 글자를 쓰지 않는다", () => {
  for (const f of ["spread-content", "tag-content", "card-content"]) {
    assert.deepEqual(readFileSync(`data/seo/${f}.json`, "utf8").match(/[←-⇿➡]/g) ?? [], [], f);
  }
});

// 디자인 다듬기 묶음 9 ⑦(운영자 11-22 A) — 상점 R1 과 같이 개발용 코드는 화면에 안 띄운다(기록으로만 보낸다)
test("오류 화면: 숫자 코드는 보여 주지 않고 기록에는 남긴다", () => {
  for (const f of ["app/error.tsx", "app/global-error.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /\{\s*error\.digest/, f);
    assert.match(s, /fingerprint: chunkError \? "chunk-load-error" : \(error\.digest \?\? null\)/, f);
  }
});

// 디자인 다듬기 묶음 9 ⑧(운영자 11-22 B) — 28 은 320 에서 '놓 / 쳤어', '길이 / 야'로 끊겼다
test("오류·404 제목: 다른 화면 제목과 같은 22, 낱말 중간에서 끊지 않는다", () => {
  for (const f of ["app/error.tsx", "app/not-found.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /<h1 className="font-display text-22 [^"]*break-keep text-balance"/, f);
  }
});

// 디자인 다듬기 묶음 9 ⑨(운영자 11-22 A) — 앱 틀까지 깨져도 오류 화면과 한 짝. 루트 레이아웃이 사라지므로 폭 메타를 직접 둔다
test("전체 오류 화면: 밝은 바탕·별콩이·제목 글꼴·홈으로, 화면 폭 메타", () => {
  const s = readFileSync("app/global-error.tsx", "utf8");
  for (const color of ["#F6F5F2", "#775CB0", "#5A3E8C", "#726398"]) assert.ok(s.includes(color), color);
  assert.doesNotMatch(s, /#E8C26A|#1F1735|linear-gradient/);
  assert.ok(s.includes("/byeolkong-curious.png"), "별콩이");
  assert.ok(s.includes('href="/"'), "홈으로");
  assert.ok(s.includes('name="viewport"'), "화면 폭");
  // 글꼴은 한 곳에서 선언해 루트 레이아웃과 같이 쓴다(따로 선언하면 한 벌 더 받는다)
  for (const f of ["app/layout.tsx", "app/global-error.tsx"]) assert.ok(readFileSync(f, "utf8").includes('from "./fonts"'), f);
});

// 묶음 9 (10)(운영자 11-22 A) — reset 은 서버에 다시 묻지 않는다(Next 16.2). Next 를 올려 이름이 바뀌면 여기서 걸리게 문서도 같이 본다
test("오류 화면 둘: 다시 시도는 서버에 다시 묻는다", () => {
  for (const f of ["app/error.tsx", "app/global-error.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.ok(s.includes("window.location.reload() : unstable_retry()"), f);
    assert.ok(!s.includes(": reset()"), f);
  }
  const boundary = readFileSync(createRequire(import.meta.url).resolve("next/dist/client/components/error-boundary.js"), "utf8");
  assert.ok(boundary.includes("unstable_retry: this.unstable_retry"), "Next 가 이 이름을 더는 넘기지 않는다 — 오류 화면 두 곳을 새 이름으로");
});
