@echo off
REM build.bat - 打包插件，排除开发和系统临时文件

setlocal enabledelayedexpansion

set OUTPUT=package.zip
set PLUGIN_DIR=.

if not exist "%PLUGIN_DIR%" (
    echo ❌ 错误: 未找到插件目录 '%PLUGIN_DIR%' >&2
    exit /b 1
)

REM ✅ 保存原始工作目录
set ORIGINAL_DIR=%cd%

REM 创建临时目录
set TEMP_DIR=%TEMP%\plugin_build_%RANDOM%
mkdir "%TEMP_DIR%"

echo 📁 复制插件文件到临时目录...

REM 复制全部内容 (排除临时目录本身)
xcopy "%PLUGIN_DIR%\*" "%TEMP_DIR%\" /E /I /Q /H /Y

REM 删除不需要的文件和目录
if exist "%TEMP_DIR%\.git" rd /s /q "%TEMP_DIR%\.git"
if exist "%TEMP_DIR%\.gitignore" del /q "%TEMP_DIR%\.gitignore"
if exist "%TEMP_DIR%\.history" rd /s /q "%TEMP_DIR%\.history"
if exist "%TEMP_DIR%\.idea" rd /s /q "%TEMP_DIR%\.idea"
if exist "%TEMP_DIR%\.DS_Store" del /q "%TEMP_DIR%\.DS_Store"
if exist "%TEMP_DIR%\node_modules" rd /s /q "%TEMP_DIR%\node_modules"
if exist "%TEMP_DIR%\build.sh" del /q "%TEMP_DIR%\build.sh"
if exist "%TEMP_DIR%\build.bat" del /q "%TEMP_DIR%\build.bat"
if exist "%TEMP_DIR%\.hotreload" del /q "%TEMP_DIR%\.hotreload"

REM 删除旧的输出文件
if exist "%ORIGINAL_DIR%\%OUTPUT%" del /q "%ORIGINAL_DIR%\%OUTPUT%"

REM 使用 PowerShell 打包 (Windows 内置)
echo 📦 正在打包...
powershell -nologo -noprofile -command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%ORIGINAL_DIR%\%OUTPUT%' -Force"

if %errorlevel% neq 0 (
    echo ❌ 打包失败
    rd /s /q "%TEMP_DIR%"
    exit /b 1
)

REM 清理临时目录
rd /s /q "%TEMP_DIR%"

echo ✅ 打包成功: %OUTPUT%

endlocal