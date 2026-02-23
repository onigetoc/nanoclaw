# EureClaw Supervised Start Script for Windows
# This script starts EureClaw with automatic restart capability

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           EureClaw - Supervised Mode                      ║" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "║  • Use /restart in chat to restart the bot                ║" -ForegroundColor Cyan
Write-Host "║  • Press Ctrl+C to stop completely                        ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Start the supervised process
Write-Host ""
Write-Host "Starting EureClaw with auto-restart..." -ForegroundColor Yellow
Write-Host ""

npm run start:supervised
