@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $lnk = $ws.CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\NeuroStudy OS.lnk\"); $lnk.TargetPath = \"$PWD\start.cmd\"; $lnk.WorkingDirectory = \"$PWD\"; $lnk.Description = 'NeuroStudy OS starten (localhost:8788)'; $lnk.Save(); Write-Host 'Startmenu-Shortcut erstellt:' $lnk.TargetPath"
