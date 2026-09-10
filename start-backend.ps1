$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $projectRoot 'server\data'
$logDir = Join-Path $dataDir 'logs'
$pidFile = Join-Path $dataDir 'backend.pid'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (Test-Path -LiteralPath $pidFile) {
  $existingPid = [int](Get-Content -Raw -LiteralPath $pidFile)
  if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
    Write-Host "后端已经在运行，PID: $existingPid" -ForegroundColor Yellow
    exit 0
  }
  Remove-Item -LiteralPath $pidFile -Force
}

# Read ignored local credentials into this process only. Values are never printed.
$kimiFile = Join-Path $projectRoot 'materials\private\apis\kimi.md'
if (Test-Path -LiteralPath $kimiFile) {
  $kimi = @{}
  Get-Content -LiteralPath $kimiFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') { $kimi[$matches[1].Trim()] = $matches[2].Trim() }
  }
  $env:KIMI_ANTHROPIC_BASE_URL = $kimi['base_url']
  $env:KIMI_ANTHROPIC_API_KEY = $kimi['api_key']
  $env:KIMI_ANTHROPIC_MODEL = $kimi['name']
  $env:KIMI_ANTHROPIC_AUTH_MODE = 'x-api-key'
}

$imageFile = Join-Path $projectRoot 'materials\private\apis\gpt_image.py'
if (Test-Path -LiteralPath $imageFile) {
  $imageSource = Get-Content -Raw -LiteralPath $imageFile
  if ($imageSource -match 'API_KEY\s*=\s*"([^"]+)"') { $env:IMAGE_API_KEY = $matches[1] }
  if ($imageSource -match 'BASE_URL\s*=\s*"([^"]+)"') { $env:IMAGE_API_BASE_URL = $matches[1] }
  $env:IMAGE_MODEL = 'gpt-image-2'
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'server\node_modules'))) {
  Write-Host '首次运行，正在安装后端依赖…' -ForegroundColor Cyan
  Push-Location $projectRoot
  try { & pnpm install } finally { Pop-Location }
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
$stdoutLog = Join-Path $logDir 'backend.log'
$stderrLog = Join-Path $logDir 'backend-error.log'
$process = Start-Process -FilePath $nodePath `
  -ArgumentList 'server/src/index.js' `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 250
  if ($process.HasExited) { break }
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3050/api/v1/health' -TimeoutSec 1
    if ($health.success) { $ready = $true; break }
  } catch {}
}

if (-not $ready) {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host "后端启动失败，请查看：$stderrLog" -ForegroundColor Red
  exit 1
}

$imageMode = if ($env:IMAGE_API_KEY) { 'IMAGE-2 凭证已载入，将生成真实 AI 插画' } else { '未找到 IMAGE-2 凭证，将明确回退原始照片' }
Write-Host '虫迹中国后端已启动：http://127.0.0.1:3050' -ForegroundColor Green
Write-Host "PID: $($process.Id)"
Write-Host $imageMode -ForegroundColor Cyan
Write-Host "日志目录：$logDir"
