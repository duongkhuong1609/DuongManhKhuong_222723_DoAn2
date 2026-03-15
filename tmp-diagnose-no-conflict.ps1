$ProgressPreference = 'SilentlyContinue'
$base = "http://localhost:3000"
$loginBody = @{ username = "admin"; password = "11111111" } | ConvertTo-Json
$loginResp = Invoke-WebRequest -UseBasicParsing -Uri ($base + "/api/auth/login") -Method POST -ContentType "application/json" -Body $loginBody -SessionVariable sess
$loginJson = $loginResp.Content | ConvertFrom-Json
if (-not $loginJson.success) { Write-Output "LOGIN_FAILED"; exit 1 }

$optionsResp = Invoke-RestMethod -Uri ($base + "/api/schedules/generate") -WebSession $sess -Method GET
$majorId = [string]@($optionsResp.data.majors)[0].id
$semesters = @($optionsResp.data.semesters | Where-Object { [string]$_.majorId -eq $majorId } | Select-Object -ExpandProperty id)
if ($semesters.Count -eq 0) { $semesters = @($optionsResp.data.semesters | Select-Object -First 1 -ExpandProperty id) }

$payload = @{
  majorId = $majorId
  semesterIds = $semesters
  settings = @{ avoidConflicts = $false; optimizeRooms = $true; balanceWorkload = $true; respectPreferences = $true }
  replaceExisting = $false
} | ConvertTo-Json -Depth 8

$startResp = Invoke-RestMethod -Uri ($base + "/api/schedules/generate") -WebSession $sess -Method POST -ContentType "application/json" -Body $payload
$jobId = [string]$startResp.data.jobId
Write-Output ("JOB_ID=" + $jobId)

$final = $null
for ($i = 0; $i -lt 240; $i++) {
  Start-Sleep -Seconds 2
  $statusResp = Invoke-RestMethod -Uri ($base + "/api/schedules/generate?jobId=" + $jobId) -WebSession $sess -Method GET
  if ($statusResp.data.status -ne 'running') { $final = $statusResp.data; break }
}

if ($null -eq $final) { Write-Output "TIMEOUT"; exit 1 }
$final | ConvertTo-Json -Depth 14
