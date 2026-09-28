@echo off
chcp 65001 >nul
rem ===========================================================================
rem  Nonogram Online 数织工坊 - 以「局域网 / 临时对外分享」模式启动
rem
rem  和 start.bat 的区别：
rem    start.bat  跑的是「开发服务器」（热更新、能看到源码），适合自己开发；
rem    本脚本     先做生产构建，再把 dist/（纯静态文件、不含源码）挂在 5173 端口上，
rem               体积小、速度快，适合临时分享给别人玩。
rem
rem  安全须知（请先读完再决定是否对外暴露）：
rem    · 本脚本会让服务器监听 0.0.0.0：同一局域网、或经 frp / ngrok 映射后的**任何人都能访问**；
rem    · 它是静态文件服务器（不暴露项目源码），但仍可能被用来试探你的机器与内网；
rem    · 只做**临时**分享：玩完就关窗口，不要把 5173 长期挂在公网；
rem    · 想长期对外发布，请用静态托管（GitHub Pages / Vercel / Netlify），不要长期暴露本机端口；
rem    · 必须用自己的域名映射时，显式列出域名（未列出的域名会被 Vite 直接拒绝）：
rem        set NONOGRAM_ALLOWED_HOSTS=game.example.com
rem
rem  用法：双击本文件；需要公网访问时，请先自行做好 frp / ngrok 映射。
rem  停止：在本窗口按 Ctrl+C，或直接关闭窗口。
rem ===========================================================================
setlocal
cd /d "%~dp0"
rem  显式打开「对外监听」：vite.config.ts 的默认值是只监听本机（安全默认）
set "NONOGRAM_EXPOSE=1"
title Nonogram Online 数织工坊 - 临时分享模式

echo.
echo  ==================================================
echo    Nonogram Online 数织工坊 - 局域网 / 临时分享模式（端口 5173）
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
echo    [!] 安全提示：现在是「对外监听」状态，局域网 / 映射域名下的任何人都能访问。
echo        只做临时分享，玩完请关掉本窗口，不要把 5173 端口长期暴露在公网。
echo        域名映射请用 set NONOGRAM_ALLOWED_HOSTS=你的域名 显式放行。
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
