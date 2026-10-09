$ErrorActionPreference='Stop'
$taskNode=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $taskNode)) { $taskNode=(Get-Command node -ErrorAction Stop).Source }
Write-Host 'เปิดหน้า http://127.0.0.1:8768 ในเบราว์เซอร์ และเปิดหน้าต่างนี้ไว้ระหว่างใช้งาน'
& $taskNode (Join-Path $PSScriptRoot 'webapp_server.mjs')
