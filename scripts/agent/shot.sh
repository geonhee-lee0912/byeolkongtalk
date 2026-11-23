#!/bin/bash
# 화면 확인: scripts/agent/shot.sh <url> <출력.png> [유저UUID]
# playwright 는 이 저장소 의존성이 아니다(에이전트는 설치 명령을 직접 돌리지 않는다) — playwright 가 깔린 폴더를 BK_PLAYWRIGHT_DIR 로 준다.
# 로컬에서 쓴다(클라우드 기본 환경엔 없다). 그 폴더 아래 node_modules/playwright 와 browsers/
dir=${BK_PLAYWRIGHT_DIR:-/opt/bk-tools}
[ -d "$dir/node_modules/playwright" ] || {
  echo "playwright 없음: $dir — playwright 가 깔린 폴더를 BK_PLAYWRIGHT_DIR 로 알려 줄 것"
  exit 1
}
[ -d "$dir/browsers" ] && export PLAYWRIGHT_BROWSERS_PATH="$dir/browsers"
BK_PLAYWRIGHT_DIR="$dir" exec node "$(dirname "$0")/shot.mjs" "$@"
