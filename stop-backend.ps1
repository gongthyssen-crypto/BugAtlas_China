$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $projectRoot 'server\data\backend.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host '没有发现运行中的虫迹中国后端。' -ForegroundColor Yellow
  exit 0
}

$backendPid = [int](Get-Content -Raw -LiteralPath $pidFile)
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $backendPid" -ErrorAction SilentlyContinue
if (-not $processInfo) {
  Remove-Item -LiteralPath $pidFile -Force
  Write-Host '后端进程已经结束，PID 文件已清理。' -ForegroundColor Yellow
  exit 0
}

$normalizedCommand = ($processInfo.CommandLine -replace '/', '\').ToLowerInvariant()
if ($processInfo.Name -notmatch '^node(\.exe)?$' -or $normalizedCommand -notlike '*server\src\index.js*') {
  Write-Host "PID $backendPid 不是虫迹中国后端，为安全起见没有终止它。" -ForegroundColor Red
  exit 1
}

Stop-Process -Id $backendPid
try { Wait-Process -Id $backendPid -Timeout 5 -ErrorAction SilentlyContinue } catch {}
if (Get-Process -Id $backendPid -ErrorAction SilentlyContinue) { Stop-Process -Id $backendPid -Force }
Remove-Item -LiteralPath $pidFile -Force
Write-Host '虫迹中国后端已关闭。' -ForegroundColor Green
