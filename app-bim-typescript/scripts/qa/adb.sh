#!/usr/bin/env bash
# Ayudantes de adb para la prueba en teléfono/tableta (Windows, Git Bash). Uso: source scripts/qa/adb.sh
ADB="/c/asdk/platform-tools/adb.exe"
PKG=com.polylivebim.qa
size()  { "$ADB" shell wm size; }                       # las coordenadas de tap dependen del equipo: mirar antes
tap()   { "$ADB" shell input tap "$1" "$2"; }          # coordenadas de pantalla real (ver size)
type_() { "$ADB" shell input text "$1"; }               # sin espacios; usar %s
key()   { "$ADB" shell input keyevent "$1"; }           # 4=atrás, 66=enter
shot()  { "$ADB" exec-out screencap -p > "${1:-shot.png}"; }
errs()  { "$ADB" logcat -d -s ReactNativeJS:E AndroidRuntime:E | grep -v '^---' | tail -${1:-10}; }
launch(){ "$ADB" shell monkey -p $PKG -c android.intent.category.LAUNCHER 1; }
metro() { "$ADB" reverse tcp:8081 tcp:8081; }           # build de desarrollo: el equipo carga el JS de Metro del PC
reset() { "$ADB" shell pm clear $PKG; }                 # solo borra la app .qa, no la de producción
