# Restart EureClaw script
Write-Host "Stopping EureClaw..." -ForegroundColor Yellow

# Find and kill ONLY EureClaw runtime processes (avoid killing editor tsserver, etc.)
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
    if (-not $cmdLine) { return }

    $isEureClawRuntime = (
        $cmdLine -match 'src\\index\.ts' -or
        $cmdLine -match 'scripts\\start-with-opencode\.js' -or
        $cmdLine -match 'scripts\\run-with-restart\.js' -or
        $cmdLine -match 'container\\agent-runner\\(src|dist)\\index\.ts' -or
        $cmdLine -match 'container\\agent-runner\\dist\\ipc-mcp-stdio\.js' -or
        $cmdLine -match 'opencode.*serve'
    )

    $isDevTooling = (
        $cmdLine -match 'tsserver\.js' -or
        $cmdLine -match 'typingsInstaller\.js'
    )

    if ($isEureClawRuntime -and -not $isDevTooling) {
        Write-Host "Killing process $($_.Id): $cmdLine" -ForegroundColor Red
        Stop-Process -Id $_.Id -Force
    }
}

Write-Host "Waiting 2 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "Starting EureClaw..." -ForegroundColor Green
npm start
