#!/bin/bash
# 운영 배포 전 점검: scripts/agent/deploy-check.sh [ref, 기본 HEAD] — 절차 전체는 docs/agent/deploy.md
# origin/main 대비 나갈 변경 중 운영자 확인이 필요한 것을 찾는다. 걸리면 exit 1.
ref=${1:-HEAD}
git fetch -q origin main || { echo "origin/main 을 못 받았다"; exit 1; }
files=$(git diff --name-only origin/main "$ref")
echo "나갈 커밋 $(git rev-list --count origin/main.."$ref")개 · 바뀌는 파일 $(printf '%s\n' "$files" | grep -c .)개"
stop=0
report() {
  local hits
  hits=$(printf '%s\n' "$files" | grep -E "$2")
  if [ -n "$hits" ]; then
    stop=1
    echo "[멈춤] $1 ($(printf '%s\n' "$hits" | wc -l)개)"
    printf '%s\n' "$hits" | head -5 | sed 's/^/  /'
  fi
}
report "앱 ① 커밋 — 운영자가 조건 3개를 확인하기 전엔 나가면 안 된다" '^(mobile/|lib/auth/|app/api/auth/app/)|20261012000000_app_auth'
report "DB 마이그레이션 — 사전 검증에 prod DB 가 필요하니 이 배포는 로컬에서" '^supabase/migrations/'
report "vercel.json — 운영 함수 지역이 바뀐다(iad1→icn1), 운영자 확인 필요" '^vercel\.json$'
[ "$stop" = 0 ] && echo "점검 통과" || echo "위 목록을 운영자에게 보여 주고 결정을 받을 것"
exit "$stop"
