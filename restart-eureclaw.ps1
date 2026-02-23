# Restart EureClaw script
Write-Host "Stopping EureClaw..." -ForegroundColor Yellow

# Find and kill node processes running eureclaw
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
    if ($cmdLine -like "*eureclaw*" -or $cmdLine -like "*start-with-opencode*") {
        Write-Host "Killing process $($_.Id): $cmdLine" -ForegroundColor Red
        Stop-Process -Id $_.Id -Force
    }
}

Write-Host "Waiting 2 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "Starting EureClaw..." -ForegroundColor Green
npm start
