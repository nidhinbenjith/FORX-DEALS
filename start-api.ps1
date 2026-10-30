$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '.env.local'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^FOREX_ADMIN_PASSWORD=(.+)$') {
      $env:FOREX_ADMIN_PASSWORD = $Matches[1]
    }
  }
}

if ([string]::IsNullOrWhiteSpace($env:FOREX_ADMIN_PASSWORD)) {
  $env:FOREX_ADMIN_PASSWORD = Read-Host 'Enter an admin password for this local session'
}
if ([string]::IsNullOrWhiteSpace($env:FOREX_ADMIN_PASSWORD)) {
  throw 'An admin password is required to start the API.'
}

$apiPort = if ([string]::IsNullOrWhiteSpace($env:JAVA_API_PORT)) { 8081 } else { [int]$env:JAVA_API_PORT }
$listeners = @(Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -eq 0) {
  $tcpClient = New-Object System.Net.Sockets.TcpClient
  try {
    $connectTask = $tcpClient.ConnectAsync('127.0.0.1', $apiPort)
    $portInUse = $connectTask.Wait(500) -and $tcpClient.Connected
  }
  catch {
    $portInUse = $false
  }
  finally {
    $tcpClient.Close()
  }
} else {
  $portInUse = $true
}

if ($portInUse) {
  $processIds = @($listeners.OwningProcess | Sort-Object -Unique)
  $processList = if ($processIds.Count -gt 0) { $processIds -join ', ' } else { 'unknown' }
  try {
    $headers = @{ Authorization = [string]::Concat('Bearer ', [Environment]::GetEnvironmentVariable('FOREX_ADMIN_PASSWORD')) }
    Invoke-WebRequest -Uri "http://127.0.0.1:$apiPort/api/admin/products" `
      -Headers $headers `
      -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop | Out-Null
    Write-Host "Forex Deals API is already running on port $apiPort and accepted the configured admin password (PID(s): $processList). Not starting a duplicate."
    exit 0
  }
  catch {
    $statusCode = 'no response'
    if ($_.Exception.Response) {
      try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
    }
    throw "Port $apiPort is already in use by process ID(s) $processList, but the API did not accept the configured admin password (HTTP $statusCode). The existing process was left untouched. Stop only the old Forex Deals API instance, then run this command again."
  }
}

Push-Location $PSScriptRoot
try {
  & mvn -B package dependency:copy-dependencies
  if ($LASTEXITCODE -ne 0) { throw 'Maven could not build the API.' }

  & java -cp "$PSScriptRoot\target\classes;$PSScriptRoot\target\dependency\*" com.shop.api.StoreApi
  if ($LASTEXITCODE -ne 0) { throw 'The Java API stopped with an error.' }
}
finally {
  Pop-Location
}
