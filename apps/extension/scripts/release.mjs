#!/usr/bin/env node
// Build → sign unlisted (AMO API) → hash → upload .xpi + regenerated updates.json
// to the fossync-builds R2 bucket. See docs/superpowers/specs/
// 2026-06-15-self-hosted-extension-updates-design.md.
//
// Requires env: AMO_JWT_ISSUER, AMO_JWT_SECRET. Wrangler must be logged in to the
// Floatpoint Cloudflare account (pinned below via CLOUDFLARE_ACCOUNT_ID).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { emptyManifest, upsertVersion } from "./updates.mjs";

const ADDON_ID = "fossync@floatpoint.net";
const BUCKET = "fossync-builds";
const BASE = "https://fossync.cloud";
const ACCOUNT_ID = "b654800db7aae56c4efb698fd7399fff"; // Floatpoint (login has several)

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = join(here, ".."); // apps/extension
const buildDir = join(extRoot, ".output", "firefox-mv2");
const signedDir = join(extRoot, ".output", "signed");

function die(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

const issuer = process.env.AMO_JWT_ISSUER;
const secret = process.env.AMO_JWT_SECRET;
if (!issuer || !secret) {
  die("Set AMO_JWT_ISSUER and AMO_JWT_SECRET (see apps/extension/.env.example).");
}

const version = JSON.parse(readFileSync(join(extRoot, "package.json"), "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  die(`Version "${version}" must be MAJOR.MINOR.PATCH (no pre-release suffix) — the worker's /download route and update sort require it.`);
}
const xpiKey = `fossync-${version}.xpi`;
console.log(`▶ Releasing fossync ${version}`);

// 1. Guard: refuse if this version is already published (AMO won't re-sign it).
const current = await fetch(`${BASE}/updates.json`)
  .then((r) => (r.ok ? r.json() : emptyManifest(ADDON_ID)))
  .catch(() => emptyManifest(ADDON_ID));
const already = (current.addons?.[ADDON_ID]?.updates ?? []).some((u) => u.version === version);
if (already) {
  die(`Version ${version} is already published. Bump version in apps/extension/package.json first.`);
}

// 2. Build the extension (manifest already carries update_url via wxt.config.ts).
console.log("▶ Building…");
execFileSync("pnpm", ["build"], { cwd: extRoot, stdio: "inherit" });

// 3. Sign unlisted via AMO. Clear any stale artifacts first so the .xpi selection
// below is unambiguous (the dir is not cleared between runs otherwise).
// Secrets passed through env, not argv.
console.log("▶ Signing (unlisted, automated)…");
rmSync(signedDir, { recursive: true, force: true });
mkdirSync(signedDir, { recursive: true });
execFileSync(
  "npx",
  [
    "web-ext",
    "sign",
    "--channel=unlisted",
    `--source-dir=${buildDir}`,
    `--artifacts-dir=${signedDir}`,
  ],
  {
    cwd: extRoot,
    stdio: "inherit",
    env: { ...process.env, WEB_EXT_API_KEY: issuer, WEB_EXT_API_SECRET: secret },
  },
);

// 4. Locate the signed artifact. signedDir was just cleared, so exactly one .xpi
// should exist; sanity-check it carries this version.
const xpis = readdirSync(signedDir).filter((f) => f.endsWith(".xpi"));
if (xpis.length !== 1) {
  die(`Expected exactly one signed .xpi in ${signedDir}, found ${xpis.length}: ${xpis.join(", ")}`);
}
const signed = xpis[0];
if (!signed.includes(version)) {
  die(`Signed artifact ${signed} does not match version ${version}.`);
}
const signedPath = join(signedDir, signed);

// 5. Hash it for update_hash.
const bytes = readFileSync(signedPath);
const hash = "sha256:" + createHash("sha256").update(bytes).digest("hex");
console.log(`▶ ${signed} ${hash}`);

// NOTE: signing has now succeeded, so AMO will refuse to re-sign this version.
// If either upload below fails, do NOT bump+rerun — recover by manually pushing
// the artifacts already in .output/signed/ (the .xpi, and after step 7 writes it,
// updates.json) with:
//   CLOUDFLARE_ACCOUNT_ID=b654800db7aae56c4efb698fd7399fff npx wrangler r2 object \
//     put fossync-builds/<key> --file=.output/signed/<file> --content-type=<ct> --remote

// 6. Upload the .xpi to R2.
const wranglerEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
console.log("▶ Uploading .xpi…");
execFileSync(
  "npx",
  [
    "wrangler", "r2", "object", "put", `${BUCKET}/${xpiKey}`,
    `--file=${signedPath}`, "--content-type=application/x-xpinstall", "--remote",
  ],
  { cwd: extRoot, stdio: "inherit", env: wranglerEnv },
);

// 7. Regenerate updates.json and upload it.
const next = upsertVersion(current, ADDON_ID, {
  version,
  update_link: `${BASE}/download/${xpiKey}`,
  update_hash: hash,
});
const manifestPath = join(signedDir, "updates.json");
writeFileSync(manifestPath, JSON.stringify(next, null, 2));
console.log("▶ Uploading updates.json…");
execFileSync(
  "npx",
  [
    "wrangler", "r2", "object", "put", `${BUCKET}/updates.json`,
    `--file=${manifestPath}`, "--content-type=application/json", "--remote",
  ],
  { cwd: extRoot, stdio: "inherit", env: wranglerEnv },
);

console.log(`\n✔ Released ${version}. Install/update link: ${BASE}/latest.xpi`);
