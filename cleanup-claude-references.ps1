# Script pour remplacer les références à Claude par OpenCode
# Exclut: node_modules, dist, logs, .git, fichiers binaires

$replacements = @(
    @{Pattern='Claude Code'; Replacement='OpenCode'},
    @{Pattern='Claude Agent SDK'; Replacement='OpenCode SDK'},
    @{Pattern='claude-agent-sdk'; Replacement='opencode-sdk'},
    @{Pattern='@anthropic-ai/claude-agent-sdk'; Replacement='@opencode-ai/sdk'},
    @{Pattern='Claude Opus'; Replacement='modern LLMs'},
    @{Pattern='\.claude/'; Replacement='.opencode/'},
    @{Pattern='/\.claude/'; Replacement='/.opencode/'},
    @{Pattern='claude\.ai'; Replacement='opencode.ai'},
    @{Pattern='code\.claude\.com'; Replacement='opencode.ai'}
)

# Extensions de fichiers à traiter
$extensions = @('*.md', '*.ts', '*.js', '*.json', '*.sh', '*.yml', '*.yaml', '*.txt')

# Dossiers à exclure
$excludeDirs = @('node_modules', 'dist', '.git', 'logs', 'data/sessions', 'data/ipc')

Write-Host "Recherche des fichiers à traiter..." -ForegroundColor Cyan

$files = Get-ChildItem -Recurse -File -Include $extensions | Where-Object {
    $path = $_.FullName
    $exclude = $false
    foreach ($dir in $excludeDirs) {
        if ($path -like "*\$dir\*") {
            $exclude = $true
            break
        }
    }
    -not $exclude
}

Write-Host "Trouvé $($files.Count) fichiers à traiter" -ForegroundColor Green

$totalReplacements = 0

foreach ($file in $files) {
    try {
        $content = Get-Content $file.FullName -Raw -ErrorAction Stop
        $originalContent = $content
        $fileReplacements = 0
        
        foreach ($item in $replacements) {
            $pattern = $item.Pattern
            $replacement = $item.Replacement
            if ($content -match $pattern) {
                $matches = ([regex]::Matches($content, $pattern)).Count
                $content = $content -replace $pattern, $replacement
                $fileReplacements += $matches
            }
        }
        
        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            $relativePath = $file.FullName.Replace($PWD, '.')
            Write-Host "  OK $relativePath : $fileReplacements remplacements" -ForegroundColor Yellow
            $totalReplacements += $fileReplacements
        }
    }
    catch {
        Write-Host "  ERREUR avec $($file.FullName): $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Résumé ===" -ForegroundColor Cyan
Write-Host "Total de remplacements effectués: $totalReplacements" -ForegroundColor Green
Write-Host ""
Write-Host "Vérification finale..." -ForegroundColor Cyan

# Compter les occurrences restantes
$remaining = (Get-ChildItem -Recurse -File -Include $extensions | Where-Object {
    $path = $_.FullName
    $exclude = $false
    foreach ($dir in $excludeDirs) {
        if ($path -like "*\$dir\*") {
            $exclude = $true
            break
        }
    }
    -not $exclude
} | Select-String -Pattern "claude" -CaseSensitive:$false).Count

Write-Host "Occurrences restantes de claude (hors exclusions): $remaining" -ForegroundColor Yellow
