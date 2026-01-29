@echo off

REM Első parancssor megnyitása és parancs futtatása az első mappában
start cmd /k "cd /d D:\satusso\backend && node server.js"

REM Második parancssor megnyitása és parancs futtatása a második mappában
start cmd /k "cd /d D:\satusso\backend\statusso-frontend && npm start"
