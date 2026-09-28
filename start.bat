@echo off
chcp 65001 >nul
rem ===========================================================================
rem  Nonogram Online 数织工坊 - 本地一键运行脚本
rem
rem  用法：直接双击本文件（可选参数 --no-open：不自动打开浏览器）。
rem  它会做四件事：
rem    1. 检查 Node.js 是否已安装；
rem    2. 第一次运行时自动安装依赖（node_modules 缺失时）；
rem    3. 检查 5173 端口是否已被占用（被占用时可一键结束占用进程）。
rem       这一步很关键：上一个运行窗口没关干净时，Vite 会直接报
rem       "Port 5173 is already in use" 然后退出，看起来像是项目坏了；
rem    4. 启动开发服务器并自动打开浏览器。
rem
rem  停止：关闭这个窗口，或在本窗口按 Ctrl+C。
rem  注意：
rem    · chcp 65001 必须放在所有中文文本之前，否则 cmd 会按本地代码页解码
rem      UTF-8 字节，中文会乱码、甚至把行拆断（已实测）。
rem    · 本文件必须保持 CRLF 换行，否则 goto / label 解析会错位（已实测）。
rem    · 启动 Vite 直接用 node_modules 里的本地入口（vite/bin/vite.js），
rem      不依赖 pnpm exec；后者在没有全局 shim 的机器上会报
rem      "'vite' is not recognized"（已实测）。
rem ===========================================================================
setlocal
cd /d "%~dp0"
title Nonogram Online 数织工坊 - 本地运行
set "PORT=5173"
set "OPEN_ARG=--open"
if /i "%~1"=="--no-open" set "OPEN_ARG="

echo.
echo  ==================================================
echo    Nonogram Online 数织工坊 - 本地一键运行
echo    项目目录: %CD%
echo  ==================================================
echo.

rem ---- 1/4 检查 Node.js -----------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto no_node
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo  [1/4] 已找到 Node.js %NODE_VER%

rem ---- 2/4 选择包管理器 + 按需安装依赖 --------------------------------------
set "PKG="
where pnpm >nul 2>nul && set "PKG=pnpm"
if not defined PKG (
  where npm >nul 2>nul && set "PKG=npm"
)
if not defined PKG goto no_pkg

if exist "node_modules\vite\package.json" (
  echo  [2/4] 依赖已存在，跳过安装
) else (
  echo  [2/4] 首次运行，正在安装依赖，请稍等 1-2 分钟...
  echo.
  call %PKG% install
  if errorlevel 1 goto install_failed
)

rem ---- 3/4 检查端口占用 ------------------------------------------------------
rem  用 netstat 找出监听该端口的进程号；findstr 只保留 LISTENING 行，避免
rem  把「本机作为客户端去连别人 5173」的连接也算进来。
set "PORT_PID="
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /r /c:"LISTENING" ^| findstr /r /c:":%PORT% "') do set "PORT_PID=%%p"
if not defined PORT_PID (
  echo  [3/4] 端口 %PORT% 可用
  goto start_server
)

set "PORT_NAME=未知程序"
for /f "tokens=1 delims=," %%n in ('tasklist /fi "PID eq %PORT_PID%" /nh /fo csv 2^>nul') do set "PORT_NAME=%%~n"

echo  [!] 端口 %PORT% 已被占用：%PORT_NAME% (PID %PORT_PID%)
echo      不处理的话，Vite 会直接报 "Port %PORT% is already in use" 并退出。
echo      最常见的原因：上一次的运行窗口没有关干净（残留的 node.exe）。
echo.
choice /c YN /n /m "  是否结束该进程并继续启动？(Y=结束并继续 / N=我自己处理) "
if errorlevel 2 goto port_busy

echo  [3/4] 正在结束 PID %PORT_PID% ...
taskkill /f /pid %PORT_PID% >nul 2>nul
rem  进程退出、端口真正释放需要一点时间，等一下再启动，避免刚结束就 bind 失败
ping -n 3 127.0.0.1 >nul
echo  [3/4] 端口 %PORT% 已释放

:start_server
rem ---- 4/4 启动开发服务器（Vite 会自动打开浏览器） --------------------------
echo  [4/4] 启动开发服务器...
echo.
echo  --------------------------------------------------
echo    本机访问：http://localhost:%PORT%/
echo    手机 / 局域网：默认只监听本机。需要手机访问时，先执行
echo                  set NONOGRAM_EXPOSE=1 再启动（会监听 0.0.0.0），
echo                  或直接双击 share.bat 用生产版本分享（更快、不带源码）。
echo    安全提示：开发服务器能读取项目源码，请不要把它长期暴露到公网。
echo  --------------------------------------------------
echo.

if exist "node_modules\vite\bin\vite.js" goto run_vite_local
if "%PKG%"=="pnpm" goto run_vite_pnpm
goto run_vite_npm

:run_vite_local
call node "node_modules\vite\bin\vite.js" %OPEN_ARG%
goto server_stopped

:run_vite_pnpm
call pnpm exec vite %OPEN_ARG%
goto server_stopped

:run_vite_npm
call npm run dev -- --open
goto server_stopped

:server_stopped
echo.
echo  开发服务器已停止。
echo.
pause
endlocal
exit /b 0

rem ---- 错误分支 ------------------------------------------------------------
:no_node
echo  [X] 没有找到 Node.js。
echo.
echo      本项目需要 Node.js 18 或更高版本。
echo      请到 https://nodejs.org/ 下载 LTS 版本并按默认选项安装，
echo      安装完成后重新双击本脚本即可。
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
echo  [X] 依赖安装失败。可以尝试：
echo      1. 删除 node_modules 目录后重新双击本脚本；
echo      2. 在项目目录手动执行  %PKG% install  查看具体报错。
echo.
pause
endlocal
exit /b 1

:port_busy
echo.
echo      好，那就不动它。你可以：
echo      1. 关掉占用 %PORT% 端口那个程序（例如之前那个运行窗口），再双击本脚本；
echo      2. 或者在任务管理器里结束 PID %PORT_PID%；
echo      3. 或者手动执行：taskkill /f /pid %PORT_PID%
echo.
pause
endlocal
exit /b 1
