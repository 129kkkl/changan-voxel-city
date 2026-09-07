@echo off
chcp 65001 >nul
title 盛唐长安体素箱庭 - 本地预览
cd /d "%~dp0"
echo 正在启动盛唐长安本地预览服务...
node preview.js
pause
