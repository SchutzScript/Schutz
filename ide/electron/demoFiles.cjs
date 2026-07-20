// 첫 실행 데모가 쓰는 샘플 프로젝트의 내용.
//
// main.cjs 에 인라인으로 두지 않는 이유가 두 가지다. 하나는 main.cjs 가 이미 크고
// 이건 데이터라 섞일 이유가 없다는 것. 다른 하나는 실용적인 것 — main.cjs 에는 NUL
// 바이트가 있어 git 이 바이너리로 취급하고, 편집 도구가 이스케이프를 망가뜨리기 쉽다.
// 실제로 여기 내용을 main.cjs 에 넣으려다 줄바꿈 이스케이프가 깨져 앱이 안 뜬 적이 있다.
//
// 템플릿 리터럴로 실제 줄바꿈을 쓴다 — \n 이스케이프가 아예 없으면 그 부류의 사고가 안 난다.

const FOOTER = `function Footer() {
  return (
    <footer className="footer">
      <p>© 2024 SCHUTZ STUDIO. MADE WITH INTENT.</p>
    </footer>
  );
}

export default Footer;
`;

const HEADER = `function Header() {
  return <header className="header">Schutz</header>;
}

export default Header;
`;

const GLOBAL_CSS = `.footer {
  padding: 24px;
  opacity: 0.7;
}

.header {
  font-weight: 700;
}
`;

const PACKAGE_JSON = `{
  "name": "schutz-demo",
  "version": "1.0.0",
  "private": true
}
`;

const README = `# Schutz 데모 프로젝트

첫 실행 안내에서 쓰는 예제입니다. 마음껏 고쳐도 되고, 지워도 다시 만들어집니다.
`;

module.exports = {
  DEMO_FILES: {
    "src/components/Footer.jsx": FOOTER,
    "src/components/Header.jsx": HEADER,
    "src/styles/global.css": GLOBAL_CSS,
    "package.json": PACKAGE_JSON,
    "README.md": README,
  },
};
