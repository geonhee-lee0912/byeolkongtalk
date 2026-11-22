// 계약: 타로 공유 시트는 누르기 전에, 카톡·링크로 받은 사람이 대화 전체를 본다고 알린다(운영자 11-22 A).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

test("안내는 시트 제목과 공유 버튼 사이 — 카톡·링크만 말하고, 낱말 중간에서 안 끊는다", () => {
  const s = src("components/tarot/TarotShareButtons.tsx");
  const block = s.match(/어디로 공유할까\?<\/p>([\s\S]*?)<div className="grid grid-cols-3">/)?.[1] ?? "";
  const between = block.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""); // 주석 말고 화면 글만
  assert.match(between, /<p className="[^"]*text-13 text-text-light[^"]*break-keep/);
  assert.match(between, /카카오톡·링크로 받은 사람은\s*<br \/>\s*네가 쓴 말까지 대화 전체를 볼 수 있어/);
  // 그림에는 카드와 한마디만 담긴다 — 그림까지 전문이 보인다고 말하지 않는다
  assert.doesNotMatch(between, /이미지|그림/);
});

test("안내의 전제 — 공개 조회가 손님 말까지 대화 전체를 준다", () => {
  const s = src("app/api/readings/[id]/public/route.ts");
  // 이 범위를 바꾸면(예: 손님 말 빼기) 시트의 안내 글도 같이 바꿀 것
  assert.match(s, /\.select\("role, content, created_at"\)/);
  assert.match(s, /messages: messages \?\? \[\]/);
});
