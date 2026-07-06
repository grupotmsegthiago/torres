# Script para sincronizar variáveis .env com Vercel
# Uso: .\sync-env-vercel.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Sincronizando .env com Vercel ===" -ForegroundColor Cyan
Write-Host ""

# Ler arquivo .env
$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERRO: Arquivo .env não encontrado!" -ForegroundColor Red
    exit 1
}

# Parear as variáveis
$vars = @{}
Get-Content $envFile | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($key -and $value) {
            $vars[$key] = $value
            Write-Host "✓ Encontrada: $key" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "Total de variáveis encontradas: $($vars.Count)" -ForegroundColor Yellow
Write-Host ""

# Instruções finais
Write-Host "=== PRÓXIMAS ETAPAS ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Abra: https://vercel.com/dashboard"
Write-Host "2. Clique em 'Torres'"
Write-Host "3. Vá em Settings → Environment Variables"
Write-Host ""
Write-Host "4. Adicione as seguintes variáveis (Production):" -ForegroundColor Yellow
Write-Host ""

$vars.GetEnumerator() | Sort-Object Name | ForEach-Object {
    Write-Host "   $($_.Key) = $($_.Value)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Após adicionar, volte aqui e rode:" -ForegroundColor Yellow
Write-Host "   git commit --allow-empty -m 'Sync env vars to Vercel'"
Write-Host "   git push origin main"
Write-Host ""
