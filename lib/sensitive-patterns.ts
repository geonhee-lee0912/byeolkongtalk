// 민감 주제 정규식 — 순수 모듈(클라 안전). 서버의 2차 판정·기록은 lib/sensitive.ts.
// 화면(고민 쓰기 위기 배너)도 같은 정규식을 써야 해서 분리했다 — 패턴을 고칠 땐 여기만. 스펙 2026-10-11-타로-로그인전-맛보기 §5-5

export type SensitiveCategory =
  | "suicide"
  | "school_violence"
  | "domestic_violence"
  | "sexual_violence"
  | "substance_abuse"
  | "other";

export type Severity = 1 | 2 | 3;

export interface SensitiveMatch {
  category: SensitiveCategory;
  severity: Severity;
  matchedKeywords: string[];
  method: "regex" | "claude" | "both";
  certainty: "high" | "medium" | "low";
}

interface Pattern {
  re: RegExp;
  category: SensitiveCategory;
  severity: Severity;
  certainty: "high" | "medium" | "low";
}

// 약 이름(+조사) — 앞뒤 어절 경계 필수. "약속·약간·계약·청약·예약·약국·약해" 의 '약' 은 약이 아니다.
// 옛 패턴은 '약' 부분문자열이라 농약·독약·극약·알약·약물에도 걸렸다 — 경계를 세우면서 이 수단 명사는 따로 적는다.
// 앞에 붙는 감기·두통 같은 말과 '약' 사이 공백은 허용("감기 약"). 조사 뒤, 그리고 띄어쓰기 없이 붙은 동사("수면제먹고") 앞도 경계로 본다 — "약잘먹고" 의 '잘' 은 경계가 아니다.
// 아래 약 과다복용 패턴 4개가 공유한다
const MED_S = String.raw`(?<![가-힣])(?:(?:(?:두통|감기|수면|진통|우울증|신경정신과|정신과|안정|불면증)\s*)?약|알약|처방약|약물|농약|독약|극약|쥐약|제초제|수면제|수면\s*유도제|진통제|안정제|신경안정제)(?:을|를|은|는|이|가|도|만|들|까지|으로|로|에|랑|이랑|과|와|의)?(?:(?![가-힣])|(?=먹|삼키|삼켰|털어|모아|모았|모으))`;
// 한 번에 먹는 분량이 아닌 말 — 과다복용 신호
const QTY = String.raw`(?:한\s*통|한\s*움큼|한\s*주먹|왕창|몽땅|통째로)`;

const PATTERNS: Pattern[] = [
  // 자살 / 자해
  // (?<![가-힣]) — "혼자 살고", "헤어지자 해" 처럼 앞 어절 끝 '자' 와 붙는 오탐 차단
  { re: /(?<![가-힣])자\s*살(?!\s*(놈|자|문|로|님))/, category: "suicide", severity: 3, certainty: "high" },
  { re: /죽\s*고\s*싶/, category: "suicide", severity: 3, certainty: "high" },
  { re: /(끝내|마감)\s*고?\s*싶/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /사라\s*지\s*고\s*싶/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /살\s*기\s*싫/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /없어\s*졌으면/, category: "suicide", severity: 1, certainty: "low" },
  { re: /(?<![가-힣])자\s*해/, category: "suicide", severity: 3, certainty: "high" },
  // 약 과다복용 — 옛 /(약|수면제|수면유도제).*(먹고|털어|모아)/ 는 "약속 잡고 밥 먹고"·"약간"·"청약 … 모아서"·감기약 먹고 잤다까지 즉시 위기로 확정했고
  // (2026-10-11 prod high 17건 중 8건이 이 패턴 — 과다복용은 0), 정작 "수면제 한 통 다 먹었어"·"약을 한꺼번에 다 삼켰어"(활용형)는 놓쳤다.
  // 모으기·분량·삼키기·죽으려는 의도가 보일 때만 high, 그냥 "약 + 먹다" 는 medium — 스트림 전 AI 2차 판정이 가린다(감기약 먹고 잤다 같은 일상 문장은 거기서 걸러진다)
  { re: new RegExp(MED_S + String.raw`[^.?!\n]{0,15}?(?:모아|모았|모으|털어\s*넣|` + QTY + String.raw`[^.?!\n]{0,4}?(?:먹|삼키|삼켰|털어))`), category: "suicide", severity: 3, certainty: "high" },
  { re: new RegExp(MED_S + String.raw`[^.?!\n]{0,15}?(?:먹|삼키|삼켰)[^.?!\n]{0,10}?(?:죽\s*(?:고|으려|을래|을까|어\s*버|으면)|안\s*깨|깨지\s*않|끝내|사라지)`), category: "suicide", severity: 3, certainty: "high" },
  { re: new RegExp(MED_S + String.raw`[^.?!\n]{0,15}?(?:다|한꺼번에)\s*삼켰`), category: "suicide", severity: 3, certainty: "high" },
  { re: new RegExp(MED_S + String.raw`[^.?!\n]{0,15}?(?:먹|삼키|삼켰|털어(?!\s*놓|\s*놨)|모아|모았)`), category: "suicide", severity: 2, certainty: "medium" },
  // 투신·목매기·뛰어내리기 — 옛 /(뛰어\s*내리|투신|목\s*매)/ 는 "재회에 목매"(집착 관용구)·"차에서 뛰어내리겠다고"(상대 협박 전언)까지 high 로 확정했고,
  // "목을 매고 싶어"·"한강 가서 뛰어내릴까"(활용형)는 놓쳤다. 투신·목매달기·높은 곳 + 뛰어내리기·"뛰어내리고 싶/내릴까" 같은 본인 의도만 high, 그 밖의 뛰어내리기는 medium.
  // '목을 매' 는 "그 사람한테 목을 매는 내가 싫어" 처럼 집착 관용구로도 흔해서(옛 패턴은 '을' 이 끼면 못 잡았다) 매달다·매려·매고 싶/죽·매어 죽 이 붙을 때만 high, 나머지는 medium
  { re: /투신|목(?:을)?\s*매\s*(?:달|려|고\s*(?:죽|싶)|[어서]\s*죽)|(?:옥상|다리|한강|난간|창문|창밖|베란다|아파트|건물|층|높은\s*곳)[^.?!\n]{0,10}?뛰어\s*내[리릴려렸]|뛰어\s*내리고\s*싶|뛰어\s*내릴\s*(?:까|래|거)|뛰어\s*내려\s*버리/, category: "suicide", severity: 3, certainty: "high" },
  { re: /뛰어\s*내[리릴려렸]|목을\s*(?:매|맸|맨)/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /칼.*(긋|손목)/, category: "suicide", severity: 3, certainty: "high" },
  { re: /힘들어\s*죽/, category: "suicide", severity: 1, certainty: "low" },
  { re: /지쳐\s*죽/, category: "suicide", severity: 1, certainty: "low" },
  // 모호한 실존적 절망 — banner + Claude 2차 검토 유도 (회색지대)
  { re: /사는\s*게\s*(의미\s*없|싫|힘들|버겁)/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /(다|모든\s*게|전부)\s*의미\s*없/, category: "suicide", severity: 1, certainty: "low" },
  { re: /더는?\s*못\s*버티/, category: "suicide", severity: 1, certainty: "low" },
  { re: /(다|전부)\s*(놓|포기)\s*(아?\s*버리|하)?\s*고\s*싶/, category: "suicide", severity: 2, certainty: "medium" },

  // 학교폭력 / 따돌림
  { re: /왕따/, category: "school_violence", severity: 2, certainty: "high" },
  // 옛 /(애들|친구들|반애|반\s*애).*(괴롭|따돌|무시|돌려가)/ 는 문장 전체를 훑어서 "친구들 만나도 마음이 괴롭다"(괴롭다=힘들다)·"친구들이 걔를 무시하는 것 같아"(제3자 얘기)까지 high 로 확정했다.
  // 같은 문장 안 15자 이내에서 괴롭히다·따돌리다·돌려 가며 만 high, '무시' 는 일상 어휘라 medium(AI 2차 판정)
  { re: /(?:애들|친구들|반\s*애)[^.?!\n]{0,15}?(?:괴롭[히혀혔힘힌힐힙]|따돌|돌려\s*가)/, category: "school_violence", severity: 2, certainty: "high" },
  { re: /(?:애들|친구들|반\s*애)[^.?!\n]{0,15}?무시/, category: "school_violence", severity: 2, certainty: "medium" },
  { re: /(맞고\s*있|맞아\s*왔|때리)/, category: "school_violence", severity: 2, certainty: "medium" },
  { re: /학교\s*가기\s*싫/, category: "school_violence", severity: 1, certainty: "low" },
  { re: /(단톡|단체\s*톡|반톡).*(괴롭|따돌|당해)/, category: "school_violence", severity: 2, certainty: "high" },
  { re: /(돈|용돈).*(뺏|빼앗|강요)/, category: "school_violence", severity: 2, certainty: "high" },

  // 가정폭력 / 아동학대
  { re: /(아빠|아버지|엄마|어머니|부모).*때려/, category: "domestic_violence", severity: 3, certainty: "high" },
  { re: /(맞고\s*자라|맞고\s*컸|매\s*맞)/, category: "domestic_violence", severity: 3, certainty: "high" },
  { re: /집\s*에?\s*들어가기?\s*무서/, category: "domestic_violence", severity: 2, certainty: "high" },
  { re: /(부모|아빠|엄마).*욕|폭언/, category: "domestic_violence", severity: 1, certainty: "low" },
  { re: /(가정|집).*(폭력|학대)/, category: "domestic_violence", severity: 3, certainty: "high" },

  // 성폭력 / 성희롱
  { re: /(성\s*추행|성\s*폭행|성\s*희롱)/, category: "sexual_violence", severity: 3, certainty: "high" },
  { re: /동의\s*없이.*(만지|키스|관계)/, category: "sexual_violence", severity: 3, certainty: "high" },
  // 옛 /(강제로|억지로).*(만지|키스|관계|시켜)/ 는 "관계를 유지하기보다 억지로 …"(인간관계)·"억지로 시켜서 …"(일상어)까지 high 로 확정했다.
  // 성적 행위를 가리키는 말만 high(어절 10자 이내), 애매한 스킨십·"관계를 하자"·'시켜' 는 medium(AI 2차 판정)
  { re: /(?:강제로|억지로)[^.?!\n]{0,10}?(?:만지|만졌|만져|키스|관계를?\s*(?:가졌|가지|맺|했)|성관계|잠자리)/, category: "sexual_violence", severity: 3, certainty: "high" },
  { re: /(?:강제로|억지로)[^.?!\n]{0,10}?(?:스킨십|뽀뽀|관계를?\s*(?:하자|하려)|시켜)/, category: "sexual_violence", severity: 2, certainty: "medium" },
  { re: /몸을?\s*만져|허락\s*없이.*만져/, category: "sexual_violence", severity: 2, certainty: "medium" },
  // 옛 /(사진|영상).*(유포|뿌려|올려)/ 는 "프사·스토리에 커플 사진 올려 놨더라"(prod 오탐 3건)까지 high 로 확정했고, "영상 올리겠다고 협박해"(활용형)는 놓쳤다.
  // 유포·퍼뜨리기·뿌리겠다, 또는 올리기/뿌리기 + 협박 이 같은 문장에 있을 때만 high, 그냥 "사진 올려" 는 medium(AI 2차 판정)
  { re: /(?:사진|영상|동영상)[^.?!\n]{0,20}?(?:유포|퍼[뜨트]|뿌린다|뿌리겠|뿌려\s*버|뿌릴|뿌린대)|(?:사진|영상|동영상)[^.?!\n]{0,20}?(?:올리|올린|올려|뿌리|뿌린|뿌려)[^.?!\n]{0,10}?협박/, category: "sexual_violence", severity: 3, certainty: "high" },
  { re: /(?:사진|영상|동영상)[^.?!\n]{0,20}?(?:올려|올리겠|올린다고|올린대|올릴\s*거|뿌려)/, category: "sexual_violence", severity: 2, certainty: "medium" },

  // 약물 / 알코올 / 도박 의존
  { re: /(약|마약|필로폰|대마)\s*끊고\s*싶/, category: "substance_abuse", severity: 2, certainty: "high" },
  { re: /술\s*못?\s*끊/, category: "substance_abuse", severity: 2, certainty: "high" },
  { re: /필름\s*끊겨/, category: "substance_abuse", severity: 1, certainty: "low" },
  { re: /도박\s*끊고?\s*싶|도박\s*중독/, category: "substance_abuse", severity: 2, certainty: "high" },
];

export function detectSensitiveSync(text: string): SensitiveMatch | null {
  if (!text || text.length < 2) return null;
  const normalized = text.toLowerCase();

  let best: SensitiveMatch | null = null;
  const allMatched: string[] = [];

  for (const p of PATTERNS) {
    const m = normalized.match(p.re);
    if (m) {
      allMatched.push(m[0]);
      if (
        !best ||
        p.severity > best.severity ||
        (p.severity === best.severity &&
          p.certainty === "high" &&
          best.certainty !== "high")
      ) {
        best = {
          category: p.category,
          severity: p.severity,
          matchedKeywords: [m[0]],
          method: "regex",
          certainty: p.certainty,
        };
      }
    }
  }

  if (best) best.matchedKeywords = Array.from(new Set(allMatched));
  return best;
}

/** 고민 쓰기 위기 배너 — 정규식 확신 high 만. 회색지대는 로그인 뒤 첫 대화의 AI 2차 판정이 맡는다(스펙 §5-5) */
export function concernSafetyMatch(text: string): SensitiveMatch | null {
  const m = detectSensitiveSync(text);
  return m && m.certainty === "high" ? m : null;
}
