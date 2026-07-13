// Inno Setup 컴파일 러너 — ISCC를 찾아 installer.iss를 package.json 버전으로 빌드
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const candidates = [
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Inno Setup 6", "ISCC.exe"),
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
  "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
  "ISCC.exe", // PATH
];

const iscc = candidates.find(p => p === "ISCC.exe" || fs.existsSync(p));
if (!iscc) {
  console.error("ISCC.exe를 찾을 수 없습니다. Inno Setup 6를 설치하세요 (winget install JRSoftware.InnoSetup).");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const iss = path.join(__dirname, "installer.iss");
const r = spawnSync(iscc, [`/DMyAppVersion=${pkg.version}`, iss], { stdio: "inherit" });
process.exit(r.status ?? 1);
