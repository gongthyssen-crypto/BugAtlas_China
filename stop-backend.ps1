$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
if ($env:OS -eq 'Windows_NT') { & "$env:SystemRoot\System32\chcp.com" 65001 | Out-Null }

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $projectRoot 'server\data\backend.pid'
$healthUrl = 'http://127.0.0.1:3150/api/v1/health'

function Get-BugAtlasProcess([int]$ProcessId) {
  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if (-not $info -or $info.Name -notmatch '^node(\.exe)?$') { return $null }
  $command = ($info.CommandLine -replace '/', '\').ToLowerInvariant()
  if ($command -notlike '*src\index.js*') { return $null }
  return $info
}

function Find-HealthyBackend {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    $validService = $health.success -and $health.data.status -eq 'ok' -and (
      $health.data.serviceId -eq 'bug-atlas-china-local' -or $health.data.version -eq '0.1.0'
    )
    if (-not $validService) { return $null }
    $listeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 3150 -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
      $info = Get-BugAtlasProcess $listener.OwningProcess
      if ($info) { return $info }
    }
  } catch {}
  return $null
}

$processInfo = $null
if (Test-Path -LiteralPath $pidFile) {
  $backendPid = [int](Get-Content -Raw -LiteralPath $pidFile)
  $processInfo = Get-BugAtlasProcess $backendPid
  if (-not $processInfo) {
    Remove-Item -LiteralPath $pidFile -Force
  }
}

if (-not $processInfo) {
  $processInfo = Find-HealthyBackend
  if ($processInfo) { $backendPid = [int]$processInfo.ProcessId }
}

if (-not $processInfo) {
  Write-Host '没有发现运行中的虫宿博物志后端。' -ForegroundColor Yellow
  exit 0
}

Stop-Process -Id $backendPid
try { Wait-Process -Id $backendPid -Timeout 5 -ErrorAction SilentlyContinue } catch {}
$remaining = Get-Process -Id $backendPid -ErrorAction SilentlyContinue
if ($remaining) { Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue }
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "虫宿博物志后端已关闭（PID: $backendPid）。" -ForegroundColor Green
