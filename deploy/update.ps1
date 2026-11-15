# Gets the newest code and restarts the API (Windows PowerShell).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
git pull --ff-only
Set-Location deploy
docker compose up -d --build
docker image prune -f | Out-Null
docker compose ps
