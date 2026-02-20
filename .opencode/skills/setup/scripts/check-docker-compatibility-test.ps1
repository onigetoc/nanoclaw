# check-docker-compatibility.ps1
# Détecte si Docker peut fonctionner sur ce système Windows

$ErrorActionPreference = "SilentlyContinue"

Write-Host "=== Docker Compatibility Check ===" -ForegroundColor Cyan
Write-Host ""

$compatible = $true
$reasons = @()

# 1. Vérifier la version de Windows
Write-Host "Checking Windows version..." -ForegroundColor Yellow
$osVersion = [System.Environment]::OSVersion.Version
$buildNumber = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").CurrentBuildNumber

Write-Host "  Windows version: $($osVersion.Major).$($osVersion.Minor) (Build $buildNumber)"

if ($osVersion.Major -lt 10) {
    $compatible = $false
    $reasons += "Windows 10 or later required (you have Windows $($osVersion.Major))"
    Write-Host "  ❌ Windows too old" -ForegroundColor Red
} elseif ($buildNumber -lt 19041) {
    $compatible = $false
    $reasons += "Windows 10 build 19041+ required for WSL2 (you have build $buildNumber)"
    Write-Host "  ❌ Windows build too old for WSL2" -ForegroundColor Red
} else {
    Write-Host "  ✅ Windows version OK" -ForegroundColor Green
}

# 2. Vérifier la virtualisation matérielle
Write-Host ""
Write-Host "Checking hardware virtualization..." -ForegroundColor Yellow

$computerInfo = Get-ComputerInfo -ErrorAction SilentlyContinue

if ($computerInfo) {
    $hyperVPresent = $computerInfo.HyperVisorPresent
    $virtEnabled = $computerInfo.HyperVRequirementVirtualizationFirmwareEnabled
    
    Write-Host "  Hypervisor present: $hyperVPresent"
    Write-Host "  Virtualization enabled in firmware: $virtEnabled"
    
    if (-not $virtEnabled) {
        $compatible = $false
        $reasons += "Hardware virtualization not enabled in BIOS/UEFI"
        Write-Host "  ❌ Virtualization disabled in BIOS" -ForegroundColor Red
    } else {
        Write-Host "  ✅ Virtualization enabled" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠️  Could not check virtualization (Get-ComputerInfo failed)" -ForegroundColor Yellow
    # Try alternative method
    $cpuVirt = (Get-WmiObject Win32_Processor).VirtualizationFirmwareEnabled
    if ($cpuVirt -eq $false) {
        $compatible = $false
        $reasons += "Hardware virtualization not enabled"
        Write-Host "  ❌ Virtualization disabled" -ForegroundColor Red
    }
}

# 3. Vérifier Hyper-V (optionnel, WSL2 peut suffire)
Write-Host ""
Write-Host "Checking Hyper-V..." -ForegroundColor Yellow

$hyperV = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction SilentlyContinue

if ($hyperV -and $hyperV.State -eq "Enabled") {
    Write-Host "  ✅ Hyper-V enabled" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Hyper-V not enabled (WSL2 can be used instead)" -ForegroundColor Yellow
}

# 4. Vérifier WSL
Write-Host ""
Write-Host "Checking WSL..." -ForegroundColor Yellow

$wslInstalled = $false
$wsl2Available = $false

try {
    $wslStatus = wsl --status 2>&1
    $wslInstalled = $LASTEXITCODE -eq 0
    
    if ($wslInstalled) {
        Write-Host "  ✅ WSL installed" -ForegroundColor Green
        
        # Check if WSL2 is available
        $wslVersion = wsl --version 2>&1
        if ($wslVersion -match "WSL version: 2" -or $wslVersion -match "Kernel version") {
            $wsl2Available = $true
            Write-Host "  ✅ WSL2 available" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  WSL1 only (WSL2 recommended for Docker)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ❌ WSL not installed" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ WSL not installed" -ForegroundColor Red
}

# 5. Vérifier si Docker est déjà installé
Write-Host ""
Write-Host "Checking Docker installation..." -ForegroundColor Yellow

$dockerInstalled = $false
$dockerRunning = $false

try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerInstalled = $true
        Write-Host "  ✅ Docker installed: $dockerVersion" -ForegroundColor Green
        
        # Try to run a test
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
            Write-Host "  ✅ Docker is running" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Docker installed but not running" -ForegroundColor Yellow
            Write-Host "     Error: $dockerInfo" -ForegroundColor Gray
            
            # Check if it's a compatibility issue
            if ($dockerInfo -match "hardware assisted virtualization" -or 
                $dockerInfo -match "VT-x" -or 
                $dockerInfo -match "Hyper-V") {
                $compatible = $false
                $reasons += "Docker installed but cannot start (virtualization issue)"
            }
        }
    } else {
        Write-Host "  ℹ️  Docker not installed" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ℹ️  Docker not installed" -ForegroundColor Gray
}

# 6. Vérifier la RAM (Docker recommande 4GB minimum)
Write-Host ""
Write-Host "Checking system resources..." -ForegroundColor Yellow

$ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
Write-Host "  Total RAM: $ram GB"

if ($ram -lt 4) {
    Write-Host "  ⚠️  Less than 4GB RAM (Docker may be slow)" -ForegroundColor Yellow
} else {
    Write-Host "  ✅ RAM sufficient" -ForegroundColor Green
}

# 7. Résumé final
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host ""

if ($compatible) {
    Write-Host "✅ Docker SHOULD work on this system" -ForegroundColor Green
    Write-Host ""
    
    if (-not $dockerInstalled) {
        Write-Host "Recommendation: Install Docker Desktop" -ForegroundColor Yellow
        Write-Host "  Download: https://www.docker.com/products/docker-desktop" -ForegroundColor Gray
    } elseif (-not $dockerRunning) {
        Write-Host "Recommendation: Start Docker Desktop" -ForegroundColor Yellow
    } else {
        Write-Host "Docker is ready to use!" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Docker CANNOT work on this system" -ForegroundColor Red
    Write-Host ""
    Write-Host "Reasons:" -ForegroundColor Yellow
    foreach ($reason in $reasons) {
        Write-Host "  • $reason" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Recommendation: Use NanoClaw in Direct Mode (no containers)" -ForegroundColor Yellow
    Write-Host "  Direct mode works perfectly on Windows without Docker!" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== End of Check ===" -ForegroundColor Cyan

# Return exit code
if ($compatible) {
    exit 0
} else {
    exit 1
}

