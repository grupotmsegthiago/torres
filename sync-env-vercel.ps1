# Script SEGURO: lista nomes do .env e orienta push via script Node (sem imprimir valores).
# Uso: .\sync-env-vercel.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Sync .env -> Vercel (seguro) ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".env")) {
    Write-Host "ERRO: Arquivo .env nao encontrado!" -ForegroundColor Red
    exit 1
}

Write-Host "Nomes encontrados no .env (valores ocultos):" -ForegroundColor Yellow
node scripts/list-env-keys.mjs .env
Write-Host ""
Write-Host "Para enviar a Vercel sem revelar valores:" -ForegroundColor Cyan
Write-Host "  1) npx vercel login"
Write-Host "  2) npx vercel link"
Write-Host "  3) npm run env:push-vercel"
Write-Host ""
Write-Host "O script NAO imprime valores e NAO sobrescreve variaveis existentes (use --force com cuidado)." -ForegroundColor Gray
Write-Host ""
