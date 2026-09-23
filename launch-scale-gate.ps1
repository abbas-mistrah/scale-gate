$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$healthUrl = 'http://127.0.0.1:4325/api/health'
$appUrl = 'http://127.0.0.1:4325/#decision'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'

$running = $false
try {
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
  $running = $response.StatusCode -eq 200
} catch {
  $running = $false
}

if (-not $running) {
  Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $projectRoot -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(12)
  do {
    Start-Sleep -Milliseconds 350
    try {
      $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1
      $running = $response.StatusCode -eq 200
    } catch {
      $running = $false
    }
  } until ($running -or (Get-Date) -gt $deadline)
}

if (-not $running) {
  throw 'SCALE GATE did not start on http://127.0.0.1:4325.'
}

if (Test-Path -LiteralPath $chrome) {
  Start-Process -FilePath $chrome -ArgumentList "--app=$appUrl"
} else {
  Start-Process $appUrl
}
