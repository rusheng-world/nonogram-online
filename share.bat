@echo off
chcp 65001 >nul
rem ===========================================================================
rem  Nonogram Online 数织工坊 - 以「公网 / 局域网分享」模式启动
rem
rem  和 start.bat 的区别：
rem    start.bat  跑的是「开发服务器」（热更新、能看到源码），适合自己开发；
rem    本脚本     先做生产构建，再把 dist/ 用静态服务器挂在 5173 端口上，
rem               体积小、速度快、不暴露源码，适合分享给别人玩。
rem
rem  用法：先保证 frp 已经把 5173 映射到公网（或同一局域网），然后双击本文件。
rem  停止：在本窗口按 Ctrl+C，或直接关闭窗口。
rem ===========================================================================
setlocal
cd /d "%~dp0"
title Nonogram Online 数织工坊 - 公网分享模式

echo.
echo  ==================================================
echo    Nonogram Online 数织工坊 - 公网 / 局域网分享模式（端口 5173）
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

echo  [3/3] 正在构建生产版本并用 5173 端口开放...
echo.
echo  --------------------------------------------------
echo    本机访问：   http://localhost:5173/
echo    公网访问：   frp 配置里的「外部地址:端口」或自定义域名
echo    局域网访问： http://本机局域网IP:5173/
echo.
echo    注意：这个窗口必须保持开着，关掉网页就打不开了。
echo    如果提示端口被占用，说明 start.bat 的开发服务器还在跑，
echo    请先关掉那个窗口（一个端口只能给一个服务用）。
echo  --------------------------------------------------
echo.

if "%PKG%"=="pnpm" (
  call pnpm run share
) else (
  call npm run share
)

echo.
echo  分享服务已停止。
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