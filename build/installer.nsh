
; ============================================================================
; DakeMusic 安装器自定义脚本
; ============================================================================
!include nsDialogs.nsh
!include LogicLib.nsh
!include WinMessages.nsh


; ── 安装前：结束残留进程 ──
!macro customInit
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  nsExec::ExecToStack 'taskkill /F /IM "Uninstall ${PRODUCT_NAME}.exe" /T'

  StrCpy $0 0
  uninstall_wait_loop:
    Delete "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
    IfFileExists "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe" 0 uninstall_wait_done
    IntOp $0 $0 + 1
    IntCmp $0 30 uninstall_wait_done 0 uninstall_wait_done
    Sleep 500
    Goto uninstall_wait_loop
  uninstall_wait_done:
!macroend

; ── 欢迎页（左侧品牌大图由 installerSidebar 提供） ──
!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "安装 ${PRODUCT_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "本向导将引导你完成 ${PRODUCT_NAME} 的安装。$\r$\n$\r$\n点击「下一步」继续。"
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ── 品牌安装页：路径 + 勾选项 ──
!macro customPageAfterChangeDir
  Page custom BrPageCreate BrPageLeave
!macroend

!ifndef BUILD_UNINSTALLER
Var BrDirEdit
Var BrChkDesktop
Var BrChkStart
Var BrDesktopOn
Var BrStartOn

Function BrBrowse
  ${NSD_GetText} $BrDirEdit $0
  nsDialogs::SelectFolderDialog "选择安装位置" "$0"
  Pop $1
  ${If} $1 != error
    ${NSD_SetText} $BrDirEdit "$1"
  ${EndIf}
FunctionEnd

Function BrPageCreate

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1037
  SendMessage $0 ${WM_SETTEXT} 0 "STR:安装 ${PRODUCT_NAME}"
  GetDlgItem $0 $HWNDPARENT 1038
  SendMessage $0 ${WM_SETTEXT} 0 "STR:选择安装位置与安装选项"

  ${NSD_CreateLabel} 0 0 100% 11u "安装位置"
  Pop $0
  ${NSD_CreateDirRequest} 0 14u -60u 13u "$INSTDIR"
  Pop $BrDirEdit
  ${NSD_CreateBrowseButton} -56u 14u 56u 13u "更改位置"
  Pop $0
  ${NSD_OnClick} $0 BrBrowse

  ${NSD_CreateCheckBox} 0 42u 100% 12u "创建桌面快捷方式"
  Pop $BrChkDesktop
  ${NSD_SetState} $BrChkDesktop ${BST_CHECKED}

  ${NSD_CreateCheckBox} 0 58u 100% 12u "添加到开始菜单"
  Pop $BrChkStart
  ${NSD_SetState} $BrChkStart ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function BrPageLeave
  ${NSD_GetText} $BrDirEdit $0
  ${If} $0 == ""
    MessageBox MB_ICONEXCLAMATION "请填写安装位置。"
    Abort
  ${EndIf}
  StrCpy $INSTDIR "$0"

  ${NSD_GetState} $BrChkDesktop $BrDesktopOn
  ${NSD_GetState} $BrChkStart $BrStartOn
FunctionEnd
!endif

; ── 安装：按勾选创建快捷方式 ──
!macro customInstall
  Delete "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe.old"

  ${If} $BrDesktopOn != 0
    Delete "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "--no-sandbox --no-stdio-init" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${Else}
    Delete "$newDesktopLink"
  ${EndIf}

  ${If} $BrStartOn != 0
    Delete "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "--no-sandbox --no-stdio-init" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${Else}
    Delete "$newStartMenuLink"
  ${EndIf}
!macroend
