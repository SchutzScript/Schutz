; Schutz — Inno Setup 설치 스크립트 (VS Code/Antigravity와 동일 계열의 모던 위저드)
; 빌드: electron-builder --dir 로 release\win-unpacked 생성 후 ISCC로 컴파일

#define MyAppName "Schutz"
#ifndef MyAppVersion
#define MyAppVersion "0.0.2"
#endif
#define MyAppPublisher "SchutzScript"
#define MyAppURL "https://github.com/SchutzScript/Schutz"
#define MyAppExeName "Schutz.exe"
#define SourceDir "..\release\win-unpacked"

[Setup]
AppId={{9B2E7A41-6C0D-4E8F-9A3B-5D1C2F8E4A70}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
; 사용자 설치 (관리자 권한 불필요 — VS Code User Setup 방식)
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=license.txt
OutputDir=..\release
OutputBaseFilename=SchutzSetup-{#MyAppVersion}
SetupIconFile=icon.ico
WizardSmallImageFile=wizardSmall.bmp
Compression=lzma2
SolidCompression=yes
; 모던 플랫 위저드 (스크린샷과 동일 스타일)
WizardStyle=modern
ShowLanguageDialog=auto
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
ChangesEnvironment=yes
ChangesAssociations=yes

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "addcontextmenufiles"; Description: "탐색기의 파일 상황에 맞는 메뉴에 ""{#MyAppName}(으)로 열기"" 추가"; GroupDescription: "기타:"
Name: "addcontextmenufolders"; Description: "탐색기의 디렉터리 상황에 맞는 메뉴에 ""{#MyAppName}(으)로 열기"" 추가"; GroupDescription: "기타:"
Name: "addtopath"; Description: "PATH에 추가 (다시 시작한 후 사용 가능)"; GroupDescription: "기타:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; 파일 우클릭 → Schutz(으)로 열기
Root: HKCU; Subkey: "Software\Classes\*\shell\{#MyAppName}"; ValueType: string; ValueName: ""; ValueData: "{#MyAppName}(으)로 열기"; Tasks: addcontextmenufiles; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\*\shell\{#MyAppName}"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName}"; Tasks: addcontextmenufiles
Root: HKCU; Subkey: "Software\Classes\*\shell\{#MyAppName}\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: addcontextmenufiles
; 폴더 우클릭
Root: HKCU; Subkey: "Software\Classes\Directory\shell\{#MyAppName}"; ValueType: string; ValueName: ""; ValueData: "{#MyAppName}(으)로 열기"; Tasks: addcontextmenufolders; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\{#MyAppName}"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName}"; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "Software\Classes\Directory\shell\{#MyAppName}\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: addcontextmenufolders
; 폴더 배경 우클릭
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\{#MyAppName}"; ValueType: string; ValueName: ""; ValueData: "{#MyAppName}(으)로 열기"; Tasks: addcontextmenufolders; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\{#MyAppName}"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#MyAppExeName}"; Tasks: addcontextmenufolders
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\{#MyAppName}\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: addcontextmenufolders
; PATH 추가 (중복 방지 Check)
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Tasks: addtopath; Check: NeedsAddPath(ExpandConstant('{app}'))

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{#MyAppName} 실행"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 제거 시 사용자 데이터(온보딩 기록·설정·키)도 삭제 → 재설치하면 튜토리얼부터 다시 시작
Type: filesandordirs; Name: "{userappdata}\{#MyAppName}"

[Code]
const
  UNINST_KEY = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{9B2E7A41-6C0D-4E8F-9A3B-5D1C2F8E4A70}_is1';

function GetUninstallString(): string;
begin
  Result := '';
  if not RegQueryStringValue(HKEY_CURRENT_USER, UNINST_KEY, 'UninstallString', Result) then
    RegQueryStringValue(HKEY_LOCAL_MACHINE, UNINST_KEY, 'UninstallString', Result);
end;

// 이미 설치되어 있으면: 재설치 / 제거 / 취소 선택
function InitializeSetup(): Boolean;
var
  U: string;
  Btn, ResultCode: Integer;
begin
  Result := True;
  U := GetUninstallString();
  if U <> '' then
  begin
    Btn := TaskDialogMsgBox('Schutz이(가) 이미 설치되어 있습니다.',
      '어떻게 할까요?' + #13#10 + #13#10 +
      '· 재설치 — 최신 파일로 덮어씁니다 (설정 유지)' + #13#10 +
      '· 제거 — 앱과 사용자 데이터를 삭제합니다',
      mbInformation, MB_YESNOCANCEL, ['재설치(&R)', '제거(&U)'], 0);
    if Btn = IDNO then
    begin
      Exec(RemoveQuotes(U), '', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
      Result := False;
    end
    else if Btn = IDCANCEL then
      Result := False;
  end;
end;

function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;

// 제거 시 PATH에서 설치 폴더 제거
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Path, App: string;
  P: Integer;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Path) then
    begin
      App := ';' + ExpandConstant('{app}');
      P := Pos(Uppercase(App), Uppercase(Path));
      if P > 0 then
      begin
        Delete(Path, P, Length(App));
        RegWriteExpandStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', Path);
      end;
    end;
  end;
end;
