@echo off
setlocal EnableDelayedExpansion

set DIR=rc2
set COMPILE_ARGS=--allow-run --allow-env --allow-net --allow-read --allow-write
set CORE=README.md LICENSE.txt foundry.md welcome.txt accounts.json modelrates.json
set EXTRAS=isolation\readme.txt isolation\test.js forge\readme.txt
set DEPENDENCIES=%CORE% %EXTRAS%

if not exist "foundry.js" (
	echo Error: foundry.js not found.
	exit /b 1
)

deno cache foundry.js
if errorlevel 1 (
	echo Error: Failed to cache dependencies.
	exit /b 1
)

deno compile %COMPILE_ARGS% --output %DIR%\foundry.exe foundry.js
if errorlevel 1 (
	echo Error: Failed to compile foundry.js.
	exit /b 1
)

if not exist "%DIR%\foundry.exe" (
	echo Error: foundry.exe not created.
	exit /b 1
)

set MISSING=0
for %%F in (%DEPENDENCIES%) do (
	if exist "%%F" (
		set TARGET=%DIR%\%%F
		xcopy /Y /-I /F "%%F" "%DIR%\%%F" && (
			echo   Copied %%F
		) || (
			echo   Failed to copy %%F
			set /a MISSING+=1
		)
	) else (
		echo   %%F not found
		set /a MISSING+=1
	)
)

if !MISSING! gtr 0 (
	echo "Failure, please check dependencies."
	exit /b 1
)

echo Foundry %DIR% build completed.

rem upx --best %DIR%\foundry.exe

exit /b 0
