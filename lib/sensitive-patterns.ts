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
  { re: /(약|수면제|수면유도제).*(먹고|털어|모아)/, category: "suicide", severity: 3, certainty: "high" },
  { re: /(뛰어\s*내리|투신|목\s*매)/, category: "suicide", severity: 3, certainty: "high" },
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
  { re: /(애들|친구들|반애|반\s*애).*(괴롭|따돌|무시|돌려가)/, category: "school_violence", severity: 2, certainty: "high" },
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
  { re: /(강제로|억지로).*(만지|키스|관계|시켜)/, category: "sexual_violence", severity: 3, certainty: "high" },
  { re: /몸을?\s*만져|허락\s*없이.*만져/, category: "sexual_violence", severity: 2, certainty: "medium" },
  { re: /(사진|영상).*(유포|뿌려|올려)/, category: "sexual_violence", severity: 3, certainty: "high" },

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
