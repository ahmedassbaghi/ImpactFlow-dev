# ImpactFlow — start backend (8013) + frontend (5173) en dues finestres.
# Ús:  .\start.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Mata processos previs als ports 8013 i 5173 si existeixen
foreach ($port in 8013, 5173) {
    $pids = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
    foreach ($procId in $pids) {
        if ($procId) {
            Write-Host "Aturant procés $procId al port $port..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

# Backend (FastAPI a 8013)
$backendCmd = "cd `"$root\apps\backend`"; `$env:IMPACTFLOW_BACKEND_PORT=8013; python run_local_backend.py"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

# Frontend (Vite a 5173)
$frontendCmd = "cd `"$root\apps\frontend`"; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

Write-Host ""
Write-Host "OK -> Backend:  http://localhost:8013" -ForegroundColor Green
Write-Host "OK -> Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Tanca les finestres de PowerShell per aturar els servidors." -ForegroundColor Cyan
