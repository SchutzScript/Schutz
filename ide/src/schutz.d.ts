/** Electron preload가 노출하는 파일 시스템 API (브라우저에서는 undefined) */
interface SchutzTreeEntry {
  rel: string;
  name: string;
  dir: boolean;
  depth: number;
}

interface SchutzWorkspaceTree {
  root: string;
  name: string;
  entries: SchutzTreeEntry[];
  truncated: boolean;
}

interface SchutzApi {
  openFolder(): Promise<string | null>;
  readTree(root: string): Promise<SchutzWorkspaceTree>;
  readFile(root: string, rel: string): Promise<string>;
  writeFile(root: string, rel: string, content: string): Promise<boolean>;
  termStart(cwd?: string): void;
  termInput(line: string): void;
  onTermData(cb: (data: string) => void): () => void;
}

interface Window {
  schutz?: SchutzApi;
}
