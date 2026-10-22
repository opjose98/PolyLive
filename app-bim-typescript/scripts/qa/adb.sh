#!/usr/bin/env bash
# Ayudantes de adb para la prueba en teléfono (Windows, Git Bash). Uso: source scripts/qa/adb.sh
ADB="/c/asdk/platform-tools/adb.exe"
PKG=com.polylivebim.qa
tap()   { "$ADB" shell input tap "$1" "$2"; }          # coordenadas de pantalla real (1220x2712)
type_() { "$ADB" shell input text "$1"; }               # sin espacios; usar %s
key()   { "$ADB" shell input keyevent "$1"; }           # 4=atrás, 66=enter
shot()  { "$ADB" exec-out screencap -p > "${1:-shot.png}"; }
errs()  { "$ADB" logcat -d -s ReactNativeJS:E AndroidRuntime:E | grep -v '^---' | tail -${1:-10}; }
launch(){ "$ADB" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1; }
reset() { "$ADB" shell pm clear $PKG; }                 # solo borra la app .qa, no la de producción
