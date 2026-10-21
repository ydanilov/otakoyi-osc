// Headless check of the static Storybook build (CI-friendly, no extra test framework):
// serves storybook-static, opens every story in dark and light with Chromium (Playwright),
// and fails if a story throws, logs a React error, or its `play` interaction test fails.
//
//   pnpm build-storybook && pnpm test-storybook
//   STORY=chrome-button pnpm test-storybook      # only stories whose id contains "chrome-button"
//   SHOTS=/tmp/shots pnpm test-storybook          # also save a screenshot per story and theme
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../storybook-static/", import.meta.url));
if (!existsSync(join(root, "index.json"))) {
  console.error("storybook-static not found — run `pnpm build-storybook` first.");
  process.exit(1);
}
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(
    /^(\.\.[/\\])+/,
    "",
  );
  let file = join(root, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const filter = process.env.STORY ?? "";
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
const stories = Object.values(index.entries).filter(
  (e) => e.type === "story" && e.id.includes(filter),
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
let errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().split("\n")[0]));

// Record Storybook's preview events: `storyRendered` fires after `play` has finished;
// `playFunctionThrewException` / `storyThrewException` / `storyErrored` mean a failure.
await page.addInitScript(() => {
  window.__sbEvents = [];
  const names = ["storyRendered", "playFunctionThrewException", "storyThrewException", "storyErrored"];
  const attach = setInterval(() => {
    const channel = window.__STORYBOOK_ADDONS_CHANNEL__;
    if (!channel) return;
    clearInterval(attach);
    for (const n of names)
      channel.on(n, (e) => window.__sbEvents.push({ n, msg: e?.message ?? e?.title ?? "" }));
  }, 5);
});

const failures = [];
for (const s of stories) {
  for (const theme of ["dark", "light"]) {
    errors = [];
    await page.goto(`${base}/iframe.html?id=${s.id}&viewMode=story&globals=theme:${theme}`);
    await page
      .waitForFunction(() => window.__sbEvents.length > 0, null, { timeout: 30000 })
      .catch(() => errors.push("timeout: story did not finish rendering / play"));
    await page.waitForTimeout(300);
    const shown = await page.evaluate(() => {
      const bad = window.__sbEvents.filter((e) => e.n !== "storyRendered");
      return bad.length ? bad.map((e) => `${e.n}: ${e.msg}`).join(" | ") : null;
    });
    if (shots) await page.screenshot({ path: join(shots, `${s.id}-${theme}.png`) });
    const errs = errors.filter((e) => !/favicon|Download the React DevTools/.test(e));
    if (shown || errs.length)
      failures.push(`${s.id} [${theme}] ${shown ?? ""} ${errs.slice(0, 2).join(" | ")}`.trim());
  }
}
await browser.close();
server.close();

console.log(`${stories.length} stories × 2 themes checked.`);
if (failures.length) {
  console.error(
    `${failures.length} failed:\n` + failures.map((f) => "  ✗ " + f.slice(0, 500)).join("\n"),
  );
  process.exit(1);
}
console.log("✓ all stories render and their play tests pass");
