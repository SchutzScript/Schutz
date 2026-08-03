import { describe, it, expect } from "vitest";
import { planRun, langFor, extOf, quote, artifactPath, LANGS } from "./runFile";

const WIN = { platform: "win32" as const, tmpDir: "C:\\Temp" };
const NIX = { platform: "posix" as const, tmpDir: "/tmp" };

describe("확장자 판별", () => {
  it("경로에서 확장자만 뽑는다", () => {
    expect(extOf("src/a.ts")).toBe("ts");
    expect(extOf("C:\\x\\y\\main.CPP")).toBe("cpp");
    expect(extOf("Makefile")).toBe("");
    expect(extOf(".gitignore")).toBe("");          // 앞의 점은 확장자가 아니다
    expect(extOf("a.b.c.py")).toBe("py");
  });

  it("아는 언어를 찾는다", () => {
    expect(langFor("x.c")?.label).toBe("C");
    expect(langFor("x.cxx")?.label).toBe("C++");
    expect(langFor("x.mjs")?.label).toBe("Node");
    expect(langFor("x.txt")).toBeNull();
  });

  it("한 확장자가 두 언어에 걸리지 않는다", () => {
    const all = LANGS.flatMap(l => l.ext);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("따옴표 — 공백 있는 경로가 조용히 깨지던 자리", () => {
  it("Windows 는 큰따옴표", () => {
    expect(quote("C:\\Program Files\\a.c", "win32")).toBe('"C:\\Program Files\\a.c"');
  });
  it("POSIX 는 작은따옴표", () => {
    expect(quote("/home/my code/a.c", "posix")).toBe("'/home/my code/a.c'");
  });
  it("POSIX 경로 안의 작은따옴표를 탈출시킨다", () => {
    expect(quote("/tmp/it's.c", "posix")).toBe("'/tmp/it'\\''s.c'");
  });
  it("Windows 경로 안의 큰따옴표를 겹쳐 쓴다", () => {
    expect(quote('C:\\a"b.c', "win32")).toBe('"C:\\a""b.c"');
  });
});

describe("산출물 경로", () => {
  it("프로젝트 폴더가 아니라 임시 폴더에 만든다", () => {
    expect(artifactPath("/proj/src/main.c", "/tmp", "posix")).toBe("/tmp/schutz-run-main");
  });
  it("Windows 는 .exe 를 붙이고 역슬래시를 쓴다", () => {
    expect(artifactPath("C:\\p\\main.c", "C:\\Temp", "win32")).toBe("C:\\Temp\\schutz-run-main.exe");
  });
  it("tmpDir 끝의 구분자를 두 번 넣지 않는다", () => {
    expect(artifactPath("/p/a.c", "/tmp/", "posix")).toBe("/tmp/schutz-run-a");
  });
  it("이름에 쓸 수 없는 글자는 밑줄로 — 한글·공백 파일명이 흔하다", () => {
    // 공백도 대상이다 — 산출물 이름에 공백이 남으면 && 뒤의 실행이 다시 깨진다
    expect(artifactPath("/p/내 코드.c", "/tmp", "posix")).toBe("/tmp/schutz-run-____");
  });
});

describe("planRun", () => {
  it("스크립트 언어는 한 줄로 끝난다", () => {
    const r = planRun({ absFile: "/p/a.py", ...NIX });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.plan.command).toBe("python '/p/a.py'");
      expect(r.plan.artifact).toBeNull();
      expect(r.plan.spec.requires).toBe("python");
    }
  });

  it("컴파일 언어는 빌드하고 바로 실행한다", () => {
    const r = planRun({ absFile: "/p/main.c", ...NIX });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.command).toBe("gcc '/p/main.c' -o '/tmp/schutz-run-main' && '/tmp/schutz-run-main'");
      expect(r.plan.artifact).toBe("/tmp/schutz-run-main");
      expect(r.plan.spec.compiled).toBe(true);
    }
  });

  it("공백 있는 경로가 통째로 따옴표 안에 들어간다", () => {
    const r = planRun({ absFile: "C:\\Program Files\\my app\\main.cpp", ...WIN });
    if (!r.ok) throw new Error("계획을 못 세움");
    expect(r.plan.command).toBe(
      'g++ "C:\\Program Files\\my app\\main.cpp" -o "C:\\Temp\\schutz-run-main.exe" && "C:\\Temp\\schutz-run-main.exe"',
    );
  });

  it("모르는 확장자는 거절한다 — 아무 명령이나 지어내지 않는다", () => {
    const r = planRun({ absFile: "/p/notes.txt", ...NIX });
    expect(r).toEqual({ ok: false, reason: "unsupported", ext: "txt" });
  });

  it("확장자가 아예 없어도 거절한다", () => {
    expect(planRun({ absFile: "/p/Makefile", ...NIX })).toMatchObject({ ok: false, ext: "" });
  });

  it("설정에서 덮어쓴 명령을 쓴다 — clang·python3 을 쓰는 사람이 있다", () => {
    const r = planRun({ absFile: "/p/a.c", ...NIX, override: "clang ${file} -O2 -o ${out} && ${out}" });
    if (!r.ok) throw new Error("계획을 못 세움");
    expect(r.plan.command).toBe("clang '/p/a.c' -O2 -o '/tmp/schutz-run-a' && '/tmp/schutz-run-a'");
  });

  it("덮어쓴 값이 공백뿐이면 기본으로 되돌아간다", () => {
    const r = planRun({ absFile: "/p/a.py", ...NIX, override: "   " });
    if (!r.ok) throw new Error("계획을 못 세움");
    expect(r.plan.command).toBe("python '/p/a.py'");
  });

  it("같은 파일은 늘 같은 명령을 만든다 — 실행할 때마다 달라지면 못 믿는다", () => {
    const a = planRun({ absFile: "/p/a.c", ...NIX });
    const b = planRun({ absFile: "/p/a.c", ...NIX });
    expect(a).toEqual(b);
  });

  it("모든 언어가 파일 경로를 실제로 쓴다 — 템플릿 오타 방지", () => {
    for (const l of LANGS) {
      const r = planRun({ absFile: "/p/x." + l.ext[0], ...NIX });
      if (!r.ok) throw new Error(l.label + ": 계획 실패");
      expect(r.plan.command, l.label).toContain("'/p/x." + l.ext[0] + "'");
      if (l.compiled) expect(r.plan.command, l.label).toContain("schutz-run-x");
    }
  });
});
