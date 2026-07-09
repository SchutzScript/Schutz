// Schutz 데모용 샘플 파일.
// 명령 팔레트에서 "Schutz: Run Demo Edit (Mock)" 를 실행하면
// 이 파일에 배너와 주석이 타이핑 애니메이션과 함께 pending 으로 추가됩니다.

interface User {
  id: string;
  name: string;
}

function greet(user: User): string {
  return `안녕하세요, ${user.name}님!`;
}

const alice: User = { id: "u1", name: "Alice" };
console.log(greet(alice));
