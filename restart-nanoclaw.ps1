# Restart NanoClaw script
Write-Host "Stopping NanoClaw..." -ForegroundColor Yellow

# Find and kill node processes running nanoclaw
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
    if ($cmdLine -like "*nanoclaw*" -or $cmdLine -like "*start-with-opencode*") {
        Write-Host "Killing process $($_.Id): $cmdLine" -ForegroundColor Red
        Stop-Process -Id $_.Id -Force
    }
}

Write-Host "Waiting 2 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "Starting NanoClaw..." -ForegroundColor Green
npm start
