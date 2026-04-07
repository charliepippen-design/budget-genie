@echo off
REM Start Budget Genie dev environment in both VS Code and Cursor

cd /d "c:\Users\lenov\OneDrive\Documents\GitHub\budget-genie"

echo.
echo 🚀 Starting Budget Genie dev environment...
echo.

REM Install deps if needed
if not exist "node_modules" (
  echo 📦 Installing dependencies...
  call npm install
)

REM Start dev server
echo 🔨 Starting Vite dev server...
start npm run dev

REM Open in VS Code
echo 📝 Opening in VS Code...
timeout /t 2 /nobreak
start code .

REM Open in Cursor
echo 🤖 Opening in Cursor...
timeout /t 2 /nobreak
start cursor .

echo.
echo ✅ Environment ready! Both editors should open in a moment.
echo Dev server: http://localhost:5174
echo.
