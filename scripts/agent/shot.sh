#!/bin/bash
# 화면 확인: scripts/agent/shot.sh <url> <출력.png> [유저UUID]
# playwright 는 이 저장소 의존성이 아니다(에이전트는 npm install 을 하지 않는다) — 환경이 깔아 둔 폴더를 쓴다.
# BK_PLAYWRIGHT_DIR(기본 /opt/bk-tools — Claude 클라우드 환경) 아래 node_modules/playwright 와 browsers/
dir=${BK_PLAYWRIGHT_DIR:-/opt/bk-tools}
[ -d "$dir/node_modules/playwright" ] || {
  echo "playwright 없음: $dir — playwright 가 깔린 폴더를 BK_PLAYWRIGHT_DIR 로 알려 줄 것"
  exit 1
}
[ -d "$dir/browsers" ] && export PLAYWRIGHT_BROWSERS_PATH="$dir/browsers"
BK_PLAYWRIGHT_DIR="$dir" exec node "$(dirname "$0")/shot.mjs" "$@"
