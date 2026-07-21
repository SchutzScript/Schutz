// 함수 컴포넌트용 언어 구독 훅.
//
// App 은 onLangChange 에서 forceUpdate 하지만, 그건 **자기 자신**만 다시 그리게 한다.
// React.memo 로 감싼 자식은 얕은 비교에서 바로 빠져나가므로(props 가 전부 안정 참조면
// 항상 그렇다) 부모가 아무리 다시 그려도 도달하지 않는다. 그런 컴포넌트는 직접 구독해야
// 한다 — MonacoPane 안의 "수정됨" 배지가 언어를 바꿔도 옛말로 남아 있던 게 그 경우다.
//
// 반환하는 틱은 **effect 의존성**으로 쓰라고 있다. 렌더가 다시 돌아도 t() 를 effect 안에서
// 굳혀둔 값(예: Monaco 데코레이션의 hover 메시지)은 그 effect 가 다시 돌아야 갈린다.
import { useEffect, useState } from "react";
import { onLangChange } from "../i18n";

export function useLang(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => onLangChange(() => setTick(n => n + 1)), []);
  return tick;
}
