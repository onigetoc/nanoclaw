#!/usr/bin/env pwsh
# Kill all EureClaw-related processes

Write-Host "🔍 Finding EureClaw processes..." -ForegroundColor Yellow

# Find all node and bun processes
$processes = Get-Process | Where-Object { 
    $_.ProcessName -like "*node*" -or 
    $_.ProcessName -like "*bun*" 
}

if ($processes.Count -eq 0) {
    Write-Host "✓ No processes found" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($processes.Count) processes:" -ForegroundColor Cyan
$processes | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize

Write-Host "`n⚠️  This will kill ALL node and bun processes!" -ForegroundColor Red
$confirm = Read-Host "Continue? (y/N)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host "`n🔪 Killing processes..." -ForegroundColor Yellow

foreach ($proc in $processes) {
    try {
        Stop-Process -Id $proc.Id -Force
        Write-Host "  ✓ Killed $($proc.ProcessName) (PID: $($proc.Id))" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Failed to kill $($proc.ProcessName) (PID: $($proc.Id)): $_" -ForegroundColor Red
    }
}

Write-Host "`n✅ Done! All processes killed." -ForegroundColor Green
Write-Host "You can now restart EureClaw with: bun run dev" -ForegroundColor Cyan
