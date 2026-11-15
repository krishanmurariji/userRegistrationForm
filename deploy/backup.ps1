# Backs up the database and the uploaded pictures into deploy\backups (Windows PowerShell). Keeps the last 14 days.
# Run it by hand, or daily with Task Scheduler (docs/DEPLOY.md).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$dest = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

docker compose exec -T db sh -c "pg_dump -U smallmart smallmart | gzip > /tmp/db.sql.gz"
docker compose cp db:/tmp/db.sql.gz (Join-Path $dest "db-$stamp.sql.gz")
docker compose cp api:/data (Join-Path $dest "pictures-$stamp")

Get-ChildItem $dest | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Recurse -Force
Get-ChildItem $dest | Sort-Object LastWriteTime -Descending | Select-Object -First 4
