// Supabase Management API 로 prod DB 에 read 쿼리 실행 (분석용 임시 헬퍼)
// 사용: SUPABASE_PAT=... node scripts/run-prod-query.mjs <sql파일> 또는 --sql "SELECT ..."
import { readFileSync } from "node:fs";

const PROJECT_REF = "etczntmzobherqyjoyvj"; // byeolkongtalk prod
const pat = process.env.SUPABASE_PAT;
if (!pat) { console.error("SUPABASE_PAT env 필요"); process.exit(1); }

let sql;
if (process.argv[2] === "--sql") sql = process.argv[3];
else sql = readFileSync(process.argv[2], "utf8");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql, read_only: true }),
  }
);
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text}`); process.exit(1); }
console.log(text);
