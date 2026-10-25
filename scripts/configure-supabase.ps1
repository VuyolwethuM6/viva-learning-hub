$ErrorActionPreference = 'Stop'

$projectUrl = Read-Host 'Supabase Project URL (https://<project-ref>.supabase.co)'
if ($projectUrl -notmatch '^https://[a-zA-Z0-9-]+\.supabase\.co/?$') {
  throw 'Enter the HTTPS Project URL shown in Supabase Project Settings.'
}

$secureKey = Read-Host 'Supabase service_role key (input is hidden; do not share it)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $serviceRoleKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}
if ([string]::IsNullOrWhiteSpace($serviceRoleKey)) {
  throw 'The service_role key cannot be empty.'
}

$envPath = Join-Path (Get-Location) '.env.local'
$lines = if (Test-Path $envPath) { @(Get-Content -Path $envPath) } else { @() }
$values = @{
  SUPABASE_URL = $projectUrl.TrimEnd('/')
  SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
}

foreach ($name in $values.Keys) {
  $pattern = '^\s*' + [Regex]::Escape($name) + '\s*='
  $updated = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match $pattern) {
      $lines[$index] = "$name=$($values[$name])"
      $updated = $true
      break
    }
  }
  if (-not $updated) {
    $lines += "$name=$($values[$name])"
  }
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envPath, $lines, $encoding)
$serviceRoleKey = $null
$secureKey.Dispose()
Write-Host "Saved Supabase settings to .env.local. The secret value was not printed."
