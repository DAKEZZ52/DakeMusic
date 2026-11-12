!macro customInit
  ; 安装前强制结束残留进程（包括卸载程序），解决重装时卸载器被锁定的问题。
  nsExec::ExecToStack 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  nsExec::ExecToStack 'taskkill /F /IM "Uninstall ${PRODUCT_NAME}.exe" /T'
  ; 品牌改名后，从旧版升级时先结束旧进程，避免文件占用
  nsExec::ExecToStack 'taskkill /F /IM "DakeMusic.exe" /T'
  nsExec::ExecToStack 'taskkill /F /IM "Uninstall DakeMusic.exe" /T'

  ; taskkill 返回后文件锁可能仍需一点时间释放，循环删除直到成功或超时。
  StrCpy $0 0
  uninstall_wait_loop:
    Delete "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
    IfFileExists "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe" 0 uninstall_wait_done
    IntOp $0 $0 + 1
    IntCmp $0 30 uninstall_wait_done 0 uninstall_wait_done
    Sleep 500
    Goto uninstall_wait_loop
  uninstall_wait_done:

  ; ---------------------------------------------------------------------------
  ; 旧版检测：品牌改名后 appId 变化（com.dake.dakemusic -> com.lyrise.music），
  ; Windows 会把新旧版本当成两个不同软件，旧版不会被覆盖，也不会自动卸载。
  ; 这里在安装前检测旧版，提示用户卸载，避免两个播放器并存。
  ; ---------------------------------------------------------------------------
  ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.dake.dakemusic" "UninstallString"
  ReadRegStr $R9 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.dake.dakemusic" "UninstallString"
  StrCmp $R8 "" 0 legacy_found
  StrCmp $R9 "" legacy_check_done
  StrCpy $R8 $R9

  legacy_found:
    ; 静默安装时无法弹窗，直接跳过（由安装完成页提示手动卸载）
    IfSilent legacy_check_done
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "检测到已安装旧版 DakeMusic。$\r$\n$\r$\n新版已更名为 LyriseMusic，两者使用不同的应用标识，会同时存在。是否现在静默卸载旧版？" \
      IDNO legacy_check_done
    ; UninstallString 一般形如 "C:\...\Uninstall DakeMusic.exe" /currentuser
    ; 追加 /S 走静默卸载；等待其结束后再继续安装，避免文件锁冲突。
    ExecWait '$R8 /S' $R7
    Sleep 1000
    nsExec::ExecToStack 'taskkill /F /IM "Uninstall DakeMusic.exe" /T'

  legacy_check_done:
!macroend

!macro customInstall
  ; 清理历史版本可能遗留的旧卸载程序
  Delete "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe.old"

  ; Electron 43 on Windows can abort before app code starts if the NUL device is
  ; unavailable. Pass --no-stdio-init from shortcuts so startup reaches main.
  Delete "$newDesktopLink"
  CreateShortCut "$newDesktopLink" "$appExe" "--no-sandbox --no-stdio-init" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"

  Delete "$newStartMenuLink"
  CreateShortCut "$newStartMenuLink" "$appExe" "--no-sandbox --no-stdio-init" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

  ; 静默安装无法弹窗询问时，在安装完成后再次确认旧版是否残留
  IfSilent 0 legacy_cleanup_done
  ReadRegStr $R8 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.dake.dakemusic" "UninstallString"
  ReadRegStr $R9 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.dake.dakemusic" "UninstallString"
  StrCmp $R8 "" 0 legacy_cleanup_run
  StrCmp $R9 "" legacy_cleanup_done
  StrCpy $R8 $R9
  legacy_cleanup_run:
    ExecWait '$R8 /S' $R7
  legacy_cleanup_done:
!macroend
