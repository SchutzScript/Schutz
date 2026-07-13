; Schutz 원클릭 설치 확장 — 설치 시 자동으로:
;  · 탐색기 파일/폴더 우클릭 "Schutz(으)로 열기"
;  · 사용자 PATH에 설치 폴더 추가
; 제거 시 전부 원복. (모던 원클릭 UX — 옵션은 앱 내 설정에서 관리)

!include "WinMessages.nsh"
!include "WordFunc.nsh"

!macro customInstall
  ; 파일 우클릭 → "Schutz(으)로 열기"
  WriteRegStr HKCU "Software\Classes\*\shell\Schutz" "" 'Schutz(으)로 열기'
  WriteRegStr HKCU "Software\Classes\*\shell\Schutz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\*\shell\Schutz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; 폴더 우클릭(폴더 자체 + 폴더 배경) → "Schutz(으)로 열기"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Schutz" "" 'Schutz(으)로 열기'
  WriteRegStr HKCU "Software\Classes\Directory\shell\Schutz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Schutz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Schutz" "" 'Schutz(으)로 열기'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Schutz" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Schutz\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  ; 사용자 PATH에 설치 폴더 추가 (중복 없이)
  ReadRegStr $0 HKCU "Environment" "Path"
  ${WordAdd} "$0" ";" "+$INSTDIR" $0
  WriteRegExpandStr HKCU "Environment" "Path" "$0"
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=3000
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\Schutz"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Schutz"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Schutz"

  ReadRegStr $0 HKCU "Environment" "Path"
  ${un.WordAdd} "$0" ";" "-$INSTDIR" $0
  WriteRegExpandStr HKCU "Environment" "Path" "$0"
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=3000
!macroend
