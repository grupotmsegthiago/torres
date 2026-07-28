$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Publicando Torres ===" -ForegroundColor Cyan
Write-Host ""

$currentBranch = git branch --show-current
if ($currentBranch -ne "dev") {
    Write-Host "Trocando para branch dev..." -ForegroundColor Yellow
    git checkout dev
}

$pending = git status --porcelain
if ($pending) {
    Write-Host "ERRO: Ha alteracoes nao commitadas na dev." -ForegroundColor Red
    Write-Host "Faca commit antes de publicar (ou peca a IA para commitar)." -ForegroundColor Red
    git status -sb
    exit 1
}

Write-Host "[1/4] Merge dev -> main..." -ForegroundColor Yellow
git checkout main
git merge dev --no-edit

Write-Host "[2/4] Enviando main para GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host "[3/4] Enviando dev para GitHub..." -ForegroundColor Yellow
git push origin dev

Write-Host "[4/4] Voltando para dev..." -ForegroundColor Yellow
git checkout dev

Write-Host ""
Write-Host "Torres publicado com sucesso!" -ForegroundColor Green
Write-Host "A Vercel faz deploy automatico da branch main." -ForegroundColor Gray
Write-Host ""
