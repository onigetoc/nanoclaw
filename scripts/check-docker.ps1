# Docker Detection for EureClaw
# Run with: powershell -File check-docker.ps1

Write-Host "=== Docker Capability Detection ===" -ForegroundColor Cyan
Write-Host ""

# Check Docker CLI
try {
    $dockerVersion = docker --version 2>$null | ForEach-Object { $_ -match '(\d+\.\d+)' ; $matches[1] }
    Write-Host "[OK] Docker CLI installed: v$dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "[SKIP] Docker CLI not found" -ForegroundColor Yellow
    exit 0
}

# Check Docker daemon
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Docker daemon is running" -ForegroundColor Green
    
    # Check for GPU support
    $gpuTest = docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] GPU passthrough available for containers" -ForegroundColor Green
    } else {
        Write-Host "[INFO] No GPU passthrough (containers will run on CPU only)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[FAIL] Docker daemon is NOT running" -ForegroundColor Red
    Write-Host ""
    Write-Host "To enable Docker:" -ForegroundColor Cyan
    Write-Host "  1. Install Docker Desktop from https://docker.com"
    Write-Host "  2. Start Docker Desktop"
    Write-Host "  3. Or use WSL2 backend: wsl --install"
    Write-Host ""
    Write-Host "Note: Docker Desktop requires:" -ForegroundColor Yellow
    Write-Host "  - Windows 10/11 Pro or Enterprise"
    Write-Host "  - WSL2 with Linux kernel update"
    Write-Host "  - Modern CPU with virtualization"
}

# Check WSL2
Write-Host ""
Write-Host "=== WSL2 Status ===" -ForegroundColor Cyan
$wslStatus = wsl --status 2>&1
if ($wslStatus -match "version 2") {
    Write-Host "[OK] WSL2 is available" -ForegroundColor Green
} else {
    Write-Host "[WARN] WSL2 may not be properly configured" -ForegroundColor Yellow
}
