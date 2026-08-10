// 중단점 목록의 지문.
//
// 개수로 견주다가 놓친 자리가 있었다 — 하나 끄고 하나 켜면 길이가 같아서 "안 바뀌었다"
// 가 되고, 확장은 옛 목록을 그대로 믿은 채 엉뚱한 줄에 표시를 남긴다.
// 자리로 키를 만들면 그 판이 걸린다.

export function bpKey(list: readonly unknown[]): string {
  return (list ?? [])
    .map(b => {
      const loc = (b as any)?.location;
      return String(loc?.uri ?? "") + ":" + String(loc?.range?.start?.line ?? "");
    })
    .sort()
    .join("|");
}
