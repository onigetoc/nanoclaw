# Nettoyage final des références à claude (cas sensibles à la casse)

$specificReplacements = @(
    @{File='README.md'; Old='# - Anthropic (Claude)'; New='# - Anthropic (Claude/OpenAI/etc)'},
    @{File='.opencode/skills/skill-creator/SKILL.md'; Pattern='claude'; Replacement='opencode'; CaseSensitive=$false},
    @{File='.opencode/skills/debug/SKILL.md'; Pattern='claude'; Replacement='opencode'; CaseSensitive=$false},
    @{File='.opencode/skills/setup/SKILL.md'; Pattern='claude'; Replacement='opencode'; CaseSensitive=$false},
    @{File='docs/SPEC.md'; Pattern='claude'; Replacement='opencode'; CaseSensitive=$false},
    @{File='docs/SDK_DEEP_DIVE.md'; Pattern='claude'; Replacement='opencode'; CaseSensitive=$false},
    @{File='docs/REQUIREMENTS.md'; Pattern='claude'; Replacement='opencode'; CaseSensitive=$false}
)

Write-Host "Nettoyage final des fichiers spécifiques..." -ForegroundColor Cyan

$totalFixed = 0

foreach ($item in $specificReplacements) {
    if ($item.File) {
        $filePath = $item.File
        if (Test-Path $filePath) {
            try {
                $content = Get-Content $filePath -Raw
                $originalContent = $content
                
                if ($item.Old -and $item.New) {
                    $content = $content -replace [regex]::Escape($item.Old), $item.New
                } elseif ($item.Pattern -and $item.Replacement) {
                    if ($item.CaseSensitive) {
                        $content = $content -creplace $item.Pattern, $item.Replacement
                    } else {
                        $content = $content -replace $item.Pattern, $item.Replacement
                    }
                }
                
                if ($content -ne $originalContent) {
                    Set-Content -Path $filePath -Value $content -NoNewline
                    $count = ([regex]::Matches($originalContent, 'claude', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
                    Write-Host "  OK $filePath : $count occurrences traitées" -ForegroundColor Green
                    $totalFixed++
                }
            }
            catch {
                Write-Host "  ERREUR $filePath : $_" -ForegroundColor Red
            }
        }
    }
}

Write-Host ""
Write-Host "Fichiers traités: $totalFixed" -ForegroundColor Green

# Vérification finale
Write-Host ""
Write-Host "Comptage final des occurrences..." -ForegroundColor Cyan

$extensions = @('*.md', '*.ts', '*.js', '*.json', '*.sh', '*.yml', '*.yaml')
$excludeDirs = @('node_modules', 'dist', '.git', 'logs', 'data')

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

Write-Host "Occurrences restantes: $remaining" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: Les occurrences restantes sont probablement dans:" -ForegroundColor Cyan
Write-Host "  - Fichiers de migration/rollback (références historiques)" -ForegroundColor Gray
Write-Host "  - Logs (données historiques)" -ForegroundColor Gray
Write-Host "  - node_modules (dépendances externes)" -ForegroundColor Gray
Write-Host "  - Commentaires sur la migration depuis Claude SDK" -ForegroundColor Gray
