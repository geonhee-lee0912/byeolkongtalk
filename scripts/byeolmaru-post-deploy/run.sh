#!/usr/bin/env bash
# 별마루 배포 후 성과 측정 — prod read-only 쿼리 7종 (2026-10-02 1차 판독에서 만든 것)
# 사용: SUPABASE_PAT=<pat> bash scripts/byeolmaru-post-deploy/run.sh
#   - 토큰은 채팅에 붙이지 말고 env 로만. scripts/run-prod-query.mjs 는 read_only 고정.
#   - 결과(json)는 저장소 밖으로 커밋되지 않게 repo-root scratchpad/(git 미추적)에 쓴다.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${OUT:-$REPO/scratchpad/byeolmaru-post-deploy}"
mkdir -p "$OUT"
if [ -z "${SUPABASE_PAT:-}" ]; then echo "SUPABASE_PAT 없음 — env 로 주세요"; exit 1; fi
export SUPABASE_PAT
for q in q1_reach q2_funnel q3_engage q4_output_cost q5_retention q6_guardrail q7_fortune_check; do
  echo "== $q"
  node "$REPO/scripts/run-prod-query.mjs" "$HERE/$q.sql" > "$OUT/$q.json" 2> "$OUT/$q.err" \
    && echo "   ok -> $OUT/$q.json" || { echo "   FAIL:"; cat "$OUT/$q.err"; }
done
echo "완료: $OUT"
