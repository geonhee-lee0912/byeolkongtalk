// 디자인 전후 비교 [로컬에서] — 라우트 목록 × 3벌(폰·앱 아이폰·PC)을 찍고 화면마다 글자 넘침을 센다.
// node scripts/agent/design-sweep.mjs --base http://localhost:3000 --out <폴더> [--routes <추가 json>] [--user <uuid>]
// 결과: <폴더>/<벌>/<이름>.png · <폴더>/overflow.json — { "<이름>@<벌>": { truncated, offscreen, items } }
// 추가 json 은 { "이름": "/경로" } — id 가 든 주소(결과·대화 화면)는 저장소에 두지 말고 이걸로 준다.
// 스펙 docs/superpowers/specs/2026-11-09-디자인-다듬기-공통-design.md §4
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const base = opt("--base") ?? "http://localhost:3000";
const out = opt("--out");
if (!out) { console.error("--out 필요"); process.exit(1); }
const user = opt("--user");
const routes = { ...JSON.parse(readFileSync(join(here, "design-sweep.routes.json"), "utf8")) };
if (opt("--routes")) Object.assign(routes, JSON.parse(readFileSync(opt("--routes"), "utf8")));

const MODES = {
  phone: [],
  "app-ios": ["--app", "ios"],
  pc: ["--w", "1280", "--h", "900"],
};

// 넘침 세기 — truncated: 잘려 보이는 글자(가로 숨김·말줄임·줄 수 제한) / offscreen: 화면 오른쪽 밖으로 나간 글자(가로 스크롤 칸 안은 제외)
const MEASURE = `(()=>{const W=innerWidth,t=[],o=[];
const scrollX=(e)=>{for(let p=e.parentElement;p;p=p.parentElement){const x=getComputedStyle(p).overflowX;if(x==="auto"||x==="scroll")return true}return false};
const tag=(e)=>e.tagName.toLowerCase()+"."+String(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className).slice(0,40)+" | "+(e.textContent||"").trim().slice(0,20);
for(const e of document.querySelectorAll("body *")){const cs=getComputedStyle(e);if(cs.display==="none"||cs.visibility==="hidden")continue;
const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;const txt=(e.textContent||"").trim();if(!txt)continue;
const leaf=![...e.children].some((c)=>(c.textContent||"").trim());
const clipX=cs.overflowX==="hidden"||cs.overflowX==="clip"||cs.textOverflow==="ellipsis";
const clamp=cs.webkitLineClamp&&cs.webkitLineClamp!=="none";
if((clipX&&e.scrollWidth>e.clientWidth+1)||(clamp&&e.scrollHeight>e.clientHeight+1))t.push(tag(e));
if(leaf&&r.right>W+1&&!scrollX(e))o.push(tag(e))}
return {truncated:t.length,offscreen:o.length,items:[...t.map((x)=>"T "+x),...o.map((x)=>"O "+x)].slice(0,30)}})()`;

const report = {};
for (const [mode, extra] of Object.entries(MODES)) {
  mkdirSync(join(out, mode), { recursive: true });
  for (const [name, path] of Object.entries(routes)) {
    const png = join(out, mode, `${name}.png`);
    const r = spawnSync(process.execPath, [join(here, "cdpshot.mjs"), base + path, png, ...extra, "--full", "--eval", MEASURE, ...(user ? ["--user", user] : [])], { encoding: "utf8", timeout: 120000 });
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("eval: "));
    report[`${name}@${mode}`] = line ? JSON.parse(line.slice(6)) : { error: (r.stderr || r.stdout || "no output").slice(0, 200) };
    const m = report[`${name}@${mode}`];
    console.log(`${mode} ${name}: ${m.error ? "ERR " + m.error : `truncated ${m.truncated} · offscreen ${m.offscreen}`}`);
  }
}
writeFileSync(join(out, "overflow.json"), JSON.stringify(report, null, 1));
console.log("저장:", join(out, "overflow.json"));
