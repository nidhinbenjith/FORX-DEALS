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
