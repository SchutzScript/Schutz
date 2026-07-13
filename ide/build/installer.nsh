; Schutz 설치 마법사 확장 — VS Code식 "추가 작업 선택" 페이지
; (탐색기 컨텍스트 메뉴 · PATH 추가) + 설치/제거 시 실제 반영

!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "WordFunc.nsh"

!ifndef BUILD_UNINSTALLER
Var SchutzTasksDialog
Var SchutzCbFileCtx
Var SchutzCbDirCtx
Var SchutzCbPath
Var SchutzOptFileCtx
Var SchutzOptDirCtx
Var SchutzOptPath
!endif

!macro customPageAfterChangeDir
  Page custom SchutzTasksPage SchutzTasksPageLeave
!macroend

; 언인스톨러 컴파일 패스에는 설치 페이지가 없으므로 함수도 제외 (warning 6010 방지)
!ifndef BUILD_UNINSTALLER
Function SchutzTasksPage
  ; MUI_HEADER_TEXT는 include 시점에 아직 정의 전이므로 헤더 컨트롤(1037/1038)에 직접 기록
  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:추가 작업 선택"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:수행할 추가 작업을 선택하십시오."
  nsDialogs::Create 1018
  Pop $SchutzTasksDialog
  ${If} $SchutzTasksDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Schutz 설치 중 수행할 추가 작업을 선택한 다음, [다음]을 클릭하십시오."
  Pop $0

  ${NSD_CreateGroupBox} 0 24u 100% 68u "기타:"
  Pop $0

  ${NSD_CreateCheckbox} 10u 38u 95% 12u '탐색기의 파일 상황에 맞는 메뉴에 "Schutz(으)로 열기" 추가'
  Pop $SchutzCbFileCtx

  ${NSD_CreateCheckbox} 10u 52u 95% 12u '탐색기의 디렉터리 상황에 맞는 메뉴에 "Schutz(으)로 열기" 추가'
  Pop $SchutzCbDirCtx

  ${NSD_CreateCheckbox} 10u 66u 95% 12u "PATH에 추가 (다시 시작한 후 사용 가능)"
  Pop $SchutzCbPath
  ${NSD_Check} $SchutzCbPath

  nsDialogs::Show
FunctionEnd

Function SchutzTasksPageLeave
  ${NSD_GetState} $SchutzCbFileCtx $SchutzOptFileCtx
  ${NSD_GetState} $SchutzCbDirCtx $SchutzOptDirCtx
  ${NSD_GetState} $SchutzCbPath $SchutzOptPath
FunctionEnd
!endif

!macro customInstall
  ; 파일 우클릭 → "Schutz(으)로 열기"
  ${If} $SchutzOptFileCtx = ${BST_CHECKED}
    WriteRegStr HKCU "Software\Classes\*\shell\Schutz" "" 'Schutz(으)로 열기'
    WriteRegStr HKCU "Software\Classes\*\shell\Schutz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    WriteRegStr HKCU "Software\Classes\*\shell\Schutz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  ${EndIf}

  ; 폴더 우클릭(폴더 자체 + 폴더 배경) → "Schutz(으)로 열기"
  ${If} $SchutzOptDirCtx = ${BST_CHECKED}
    WriteRegStr HKCU "Software\Classes\Directory\shell\Schutz" "" 'Schutz(으)로 열기'
    WriteRegStr HKCU "Software\Classes\Directory\shell\Schutz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    WriteRegStr HKCU "Software\Classes\Directory\shell\Schutz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Schutz" "" 'Schutz(으)로 열기'
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Schutz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Schutz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  ${EndIf}

  ; 사용자 PATH에 설치 폴더 추가 (중복 없이)
  ${If} $SchutzOptPath = ${BST_CHECKED}
    ReadRegStr $0 HKCU "Environment" "Path"
    ${WordAdd} "$0" ";" "+$INSTDIR" $0
    WriteRegExpandStr HKCU "Environment" "Path" "$0"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=3000
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Schutz"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Schutz"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Schutz"

  ; PATH에서 설치 폴더 제거
  ReadRegStr $0 HKCU "Environment" "Path"
  ${un.WordAdd} "$0" ";" "-$INSTDIR" $0
  WriteRegExpandStr HKCU "Environment" "Path" "$0"
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=3000
!macroend
