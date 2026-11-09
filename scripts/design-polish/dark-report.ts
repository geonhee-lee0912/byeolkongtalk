// 이 브랜치 전용 — text-lilac-deep 줄마다 밤 바탕 판정을 찍어 사람이 확인한다.
import { readFileSync } from "node:fs";
import { sources } from "../../lib/design-scan";
import { isOnDark } from "./map";

for (const p of sources()) {
  const text = readFileSync(p, "utf8");
  text.split("\n").forEach((line, i) => {
    if (/(?<![\w-])text-lilac-deep\b/.test(line)) {
      console.log(`${isOnDark(text, i) ? "DARK " : "light"} ${p.replace(/\\/g, "/")}:${i + 1}  ${line.trim().slice(0, 110)}`);
    }
  });
}
