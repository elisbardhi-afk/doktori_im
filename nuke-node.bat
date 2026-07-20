@echo off
REM Kill orphaned node processes and clean .next cache
REM Useful when npm run dev hangs or takes too long to start

echo Killing orphaned node processes...
taskkill /F /IM node.exe 2>nul || echo (none found)

echo Waiting 1 second...
timeout /t 1 /nobreak

echo Cleaning .next cache...
if exist .next (
  rmdir /S /Q .next 2>nul || echo (cache cleanup skipped - in use)
)

echo Starting dev server...
npm run dev
