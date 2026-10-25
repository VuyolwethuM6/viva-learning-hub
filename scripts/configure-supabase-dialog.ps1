$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectUrl = 'https://ejyytozzqpeawxggsnbr.supabase.co'
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Configure Supabase locally'
$form.Size = New-Object System.Drawing.Size(520, 210)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true

$urlLabel = New-Object System.Windows.Forms.Label
$urlLabel.Location = New-Object System.Drawing.Point(16, 18)
$urlLabel.Size = New-Object System.Drawing.Size(470, 22)
$urlLabel.Text = "Project URL: $projectUrl"
$form.Controls.Add($urlLabel)

$keyLabel = New-Object System.Windows.Forms.Label
$keyLabel.Location = New-Object System.Drawing.Point(16, 50)
$keyLabel.Size = New-Object System.Drawing.Size(470, 22)
$keyLabel.Text = 'Paste the service_role / secret key here (input is masked):'
$form.Controls.Add($keyLabel)

$keyInput = New-Object System.Windows.Forms.TextBox
$keyInput.Location = New-Object System.Drawing.Point(16, 76)
$keyInput.Size = New-Object System.Drawing.Size(470, 26)
$keyInput.UseSystemPasswordChar = $true
$keyInput.Anchor = 'Top,Left,Right'
$form.Controls.Add($keyInput)

$warning = New-Object System.Windows.Forms.Label
$warning.Location = New-Object System.Drawing.Point(16, 108)
$warning.Size = New-Object System.Drawing.Size(470, 30)
$warning.Text = 'The key is saved only in this computer’s ignored .env.local file. Do not share it.'
$form.Controls.Add($warning)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Location = New-Object System.Drawing.Point(300, 145)
$saveButton.Size = New-Object System.Drawing.Size(90, 28)
$saveButton.Text = 'Save locally'
$saveButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($saveButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Location = New-Object System.Drawing.Point(396, 145)
$cancelButton.Size = New-Object System.Drawing.Size(90, 28)
$cancelButton.Text = 'Cancel'
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)
$form.AcceptButton = $saveButton
$form.CancelButton = $cancelButton
$form.Add_Shown({ $keyInput.Focus() })

$dialogResult = $form.ShowDialog()
if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Host 'Supabase configuration cancelled; .env.local was not changed.'
  exit 0
}

$serviceRoleKey = $keyInput.Text.Trim()
if ([string]::IsNullOrWhiteSpace($serviceRoleKey) -or $serviceRoleKey -match '[\r\n]') {
  $form.Dispose()
  throw 'A valid single-line service key is required.'
}

$envPath = Join-Path (Get-Location) '.env.local'
$lines = if (Test-Path $envPath) { @(Get-Content -Path $envPath) } else { @() }
$values = @{
  SUPABASE_URL = $projectUrl
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
$keyInput.Clear()
$form.Dispose()
$serviceRoleKey = $null
$values = $null
Write-Host 'Supabase settings saved to .env.local. Secret value was not displayed.'
