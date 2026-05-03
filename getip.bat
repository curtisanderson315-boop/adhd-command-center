@echo off
ipconfig | findstr /i "IPv4" > "%~dp0myip.txt"
type "%~dp0myip.txt"
