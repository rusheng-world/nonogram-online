@echo off
chcp 65001 >nul
rem ===========================================================================
rem  Nonogram Online 数织工坊 - 一键构建 + 本地预览
rem
rem  用法：直接双击本文件。
rem  它会：检查 Node.js -> 按需安装依赖 -> 生产构建（产物 dist/）-> 预览并打开浏览器。
rem  想部署到静态托管时，直接把 dist/ 目录上传即可。
rem ===========================================================================
setlocal
cd /d "%~dp0"
title Nonogram Online 数织工坊 - 构建并预览

echo.
echo  ==================================================
echo    Nonogram Online 数织工坊 - 一键构建 + 本地预览
echo    项目目录: %CD%
echo  ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo  [1/3] 已找到 Node.js %NODE_VER%

set "PKG="
where pnpm >nul 2>nul && set "PKG=pnpm"
if not defined PKG (
  where npm >nul 2>nul && set "PKG=npm"
)
if not defined PKG goto no_pkg

if exist "node_modules\vite\package.json" (
  echo  [2/3] 依赖已存在，跳过安装
) else (
  echo  [2/3] 首次运行，正在安装依赖，请稍等 1-2 分钟...
  echo.
  call %PKG% install
  if errorlevel 1 goto install_failed
)

echo  [3/3] 正在做类型检查 + 生产构建...
echo.
call %PKG% run build
if errorlevel 1 goto build_failed

echo.
echo  构建完成，产物在 dist\ 目录（纯静态文件，可直接上传到 GitHub Pages / Vercel / Netlify）。
echo  接下来本地预览生产版本，浏览器会自动打开；按 Ctrl+C 可停止。
echo.
call %PKG% exec vite preview --open

echo.
echo  预览已停止。
echo.
pause
endlocal
exit /b 0

:no_node
echo  [X] 没有找到 Node.js。
echo      请到 https://nodejs.org/ 下载 LTS 版本并按默认选项安装，然后重新双击本脚本。
echo.
pause
endlocal
exit /b 1

:no_pkg
echo  [X] 没有找到 pnpm 或 npm，无法安装依赖。
echo      请重新安装 Node.js（自带 npm），或执行：npm i -g pnpm
echo.
pause
endlocal
exit /b 1

:install_failed
echo.
echo  [X] 依赖安装失败。可以尝试：删除 node_modules 后重新双击本脚本，或手动执行  %PKG% install
echo.
pause
endlocal
exit /b 1

:build_failed
echo.
echo  [X] 构建失败，请查看上面的报错信息。
echo.
pause
endlocal
exit /b 1