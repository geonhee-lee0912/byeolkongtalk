// 헤드리스 Edge(CDP) 화면 찍기 [로컬에서] — node scripts/agent/cdpshot.mjs <url> <out.png> [--app ios|android] [--user <uuid>] [--eval <js>] [--steps <json>] [--full]
// --steps: [{"click":"css"},{"wait":500},{"eval":"js"},{"shot":"path"},{"back":true},{"scroll":800}]
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const url = args[0], out = args[1];
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const app = opt("--app"), user = opt("--user"), evalJs = opt("--eval"), steps = JSON.parse(opt("--steps") ?? "[]");
const EDGE = process.env.BK_EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), "cdp-"));
const proc = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--hide-scrollbars", "--no-first-run", "--disable-sync", "--disable-extensions", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver;
for (let i = 0; i < 50; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (ver.length) break; } catch {} await sleep(200); }
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
setTimeout(() => { console.log("TIMEOUT"); proc.kill(); process.exit(2); }, 90000);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
let castFrame = null;
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Page.screencastFrame") { castFrame = d.params.data; ws.send(JSON.stringify({ id: 999999, method: "Page.screencastFrameAck", params: { sessionId: d.params.sessionId } })); } if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) logs.push(d.params.type + ": " + d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300)); if (d.method === "Runtime.exceptionThrown") logs.push("exception: " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: Number(opt("--w") ?? 390), height: Number(opt("--h") ?? 844), deviceScaleFactor: opt("--w") ? 1 : 2, mobile: !opt("--w") });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
const baseUa = (await send("Runtime.evaluate", { expression: "navigator.userAgent", returnByValue: true })).result.result.value.replace("HeadlessChrome", "Chrome");
if (app) {
  await send("Emulation.setUserAgentOverride", { userAgent: `${baseUa} ByeolkongApp/1.0.0 (${app})` });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__BYEOLKONG_APP__={version:"1.0.0",platform:${JSON.stringify(app)},caps:${JSON.stringify((opt("--caps")??"push").split(","))}};` });
}
if (args.includes("--bridge")) {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__bridgeLog=[];window.ReactNativeWebView={postMessage(m){try{const t=JSON.parse(m).type;window.__bridgeLog.push(t);(window.__bridgeRaw=window.__bridgeRaw||[]).push(m);if(t==="push.status"||t==="push.request")setTimeout(()=>window.dispatchEvent(new CustomEvent("byeolkong:app",{detail:JSON.stringify({v:1,type:"push.state",state:t==="push.request"?"granted":"undetermined"})})),30)}catch(e){}}};` });
}
if (args.includes("--transparent")) await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
if (args.includes("--reduce")) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
if (user) await send("Network.setCookie", { name: "byeolkong_user_id", value: user, url: new URL(url).origin });
const ev = async (js) => (await send("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true })).result.result?.value;
const full = args.includes("--full");
const shot = async (p) => {
  let clip;
  if (full) { const m = (await send("Page.getLayoutMetrics")).result.cssContentSize; clip = { x: 0, y: 0, width: m.width, height: Math.min(m.height, 8000), scale: 1 }; }
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  writeFileSync(p, Buffer.from(r.result.data, "base64"));
};
await send("Page.navigate", { url });
for (let i = 0; i < 100; i++) { await sleep(300); if ((await ev("document.readyState")) === "complete") break; }
await sleep(2500);
for (const s of steps) {
  if (s.cast) { castFrame = null; await send("Page.startScreencast", { format: "png", everyNthFrame: 1 }); await sleep(600); if (castFrame) writeFileSync(s.cast, Buffer.from(castFrame, "base64")); await send("Page.stopScreencast"); }
  if (s.rate) { await send("Animation.enable"); await send("Animation.setPlaybackRate", { playbackRate: s.rate }); }
  if (s.drag) { const [x, y0, y1, ms] = s.drag; const steps = 8; await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] }); for (let i = 1; i <= steps; i++) { await sleep(ms / steps); await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] }); } await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
  if (s.click) await ev(`(()=>{const e=document.querySelector(${JSON.stringify(s.click)});if(!e)return "none";e.click();return "ok"})()`);
  if (s.clickText) await ev(`(()=>{const e=[...document.querySelectorAll("a,button")].find(x=>x.textContent.trim().includes(${JSON.stringify(s.clickText)})&&x.offsetParent);if(!e)return "none";e.click();return "ok"})()`);
  if (s.back) await ev("history.back()");
  if (s.scroll) await ev(`window.scrollTo(0,${s.scroll})`);
  if (s.eval) console.log("eval:", JSON.stringify(await ev(s.eval)));
  if (s.wait) await sleep(s.wait);
  if (s.shot) await shot(s.shot);
}
if (evalJs) console.log("eval:", JSON.stringify(await ev(evalJs)));
await shot(out);
console.log(JSON.stringify({ url: await ev("location.href"), logs: logs.slice(0, 8) }));
ws.close(); proc.kill(); process.exit(0);
