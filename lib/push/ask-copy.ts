// lib/push/ask-copy.ts — 알림·광고 동의 질문 시트(PushAskSheet)의 순간별 제목·설명(순수 · 클라 세이프). 시트에서 옮김.
// 광고 동의만 묻는 시트(kind "ad" — 알림은 이미 허용)는 버튼이 '광고성 정보 수신 동의하기'라, 질문도 그에 맞추고
// 왜 동의가 필요한지(구독 전엔 광고 알림으로 간다)를 적는다(디자인 다듬기 알림 시트 ②, 운영자 11-22).
// 예전엔 광고만 묻는데도 제목이 '내일 아침에도 알려줄까?'라 질문과 버튼이 따로 놀았다.
import type { AskKind, AskMoment } from "./asks.ts";

export function askCopy(moment: AskMoment, kind: AskKind): { title: string; sub: string } {
  if (kind === "ad") {
    if (moment === "byeolmaru_first")
      return { title: "아침 별 흐름, 알림으로 받아볼래?", sub: "구독 전엔 광고 알림으로 가서, 아래 광고성 정보 수신 동의가 필요해." };
    if (moment === "birthday")
      return { title: "생일 아침 운세, 알림으로 받아볼래?", sub: "생일 아침 운세는 광고 알림으로 가서, 아래 광고성 정보 수신 동의가 필요해." };
    return { title: "별콩이 소식도 받아볼래?", sub: "" };
  }
  if (moment === "birthday") return { title: "생일 아침에 운세 보내줄까?", sub: "생일 아침, 별콩이가 그날의 운세를 알려줄게." };
  if (moment === "byeolmaru_first") return { title: "내일 아침에도 알려줄까?", sub: "아침마다 오늘의 흐름을 별콩이가 알려줄게." };
  return { title: "별콩이가 알려줘도 될까?", sub: "알려줄 일이 생기면 별콩이가 알림으로 알려줄게. 알림을 켜 줘." };
}
