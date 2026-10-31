#!/bin/bash
# 세션 종료 점검: scripts/agent/stop.sh — 이 자리를 떠나도 되는지. 문제가 있으면 종료 1.
# 로컬에서 끄기 전·클라우드 세션을 멈추기 전·도구를 바꾸기 전 전부 같다.
BASE=${AGENT_BASE_BRANCH:-dev}
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "저장소 안에서 실행할 것"; exit 1; }
cd "$root" || exit 1

current=$(git branch --show-current)
if [ -z "$current" ]; then
  echo "브랜치가 없다(detached) — git switch -c 로 브랜치를 만들 것"
  exit 1
fi

dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
  printf '%s\n' "$dirty"
  echo "커밋 안 된 변경 — wip: 커밋 할 것"
  exit 1
fi

if [ "$current" != "$BASE" ] && [ ! -f HANDOFF.md ]; then
  echo "HANDOFF.md 없음 — 만들 것(PR 직전이면 무시)"
fi

upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)
if [ -z "$upstream" ]; then
  echo "푸시 안 됨(원격 없음) — git push -u origin $current"
  exit 1
fi
if git status -sb | head -1 | grep -q 'ahead'; then
  echo "푸시 안 됨 — git push"
  exit 1
fi

echo "stop 완료 — 이 자리를 떠나도 된다"
exit 0
