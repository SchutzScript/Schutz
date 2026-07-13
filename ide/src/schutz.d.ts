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
  branch?: string | null;
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
  newWindow(): void;
  setOverlay(color: string, symbolColor: string): void;
  renameEntry(root: string, relFrom: string, relTo: string): Promise<boolean>;
  deleteEntry(root: string, rel: string): Promise<boolean>;
  cliCheck(): Promise<{ agents: Record<string, { ok: boolean; version: string; hasConfig: boolean }> }>;
  cliLogin(id: string): void;
  cliRun(opts: { agent?: string; cwd?: string; prompt: string; resume?: string; continue?: boolean }): void;
  cliStop(): void;
  onCliEvent(cb: (line: string) => void): () => void;
  oauthStart(id: string): Promise<{ ok: boolean; mode?: string; message?: string }>;
  oauthExchange(id: string, code: string): Promise<{ ok: boolean; access?: string; refresh?: string | null; exp?: number; message?: string }>;
  oauthRefresh(id: string, refreshToken: string): Promise<{ ok: boolean; access?: string; refresh?: string | null; exp?: number; message?: string }>;
  onOauthResult(cb: (line: string) => void): () => void;
  oaiRun(opts: { id: string; access: string; accountId?: string | null; body: any }): void;
  oaiStop(id: string): void;
  onOaiEvent(cb: (line: string) => void): () => void;
}

interface Window {
  schutz?: SchutzApi;
}
