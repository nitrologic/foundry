@echo off

set DIR=rc2
set DEPENDENCIES=foundry.js README.md LICENSE.txt foundry.md welcome.txt accounts.json rates.json forge\readme.txt

if not exist "foundry.js" (
	echo Error: foundry.js not found in the current directory.
	exit /b 1
)

deno cache foundry.js
if errorlevel 1 (
	echo Error: Failed to cache dependencies.
	exit /b 1
)

deno compile --allow-run --allow-env --allow-net --allow-read --allow-write --output %DIR%\foundry.exe foundry.js
if errorlevel 1 (
	echo Error: Failed to compile foundry.js.
	exit /b 1
)

if not exist "%DIR%\foundry.exe" (
	echo Error: foundry.exe not created by compiler.
	exit /b 1
)

set MISSING=0
for %%F in (%DEPENDENCIES%) do (
	if exist "%%F" (
		xcopy /Y "%%F" "%DIR%\%%F" >nul && (
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

if %MISSING% gtr 0 (
	echo Warning: %MISSING% file(s) were missing or failed to copy.
)

echo Foundry %DIR% build completed successfully.

rem upx --best %DIR%\foundry.exe

exit /b 0
