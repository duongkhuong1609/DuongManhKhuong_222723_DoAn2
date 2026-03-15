$ProgressPreference = 'SilentlyContinue'
$ports = @(3000,3001)
$base = $null
foreach ($p in $ports) {
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri ("http://localhost:" + $p + "/login") -Method GET -TimeoutSec 5
    if ($health.StatusCode -ge 200) { $base = "http://localhost:$p"; break }
  } catch {}
}
if (-not $base) { Write-Output "NO_SERVER"; exit 1 }
Write-Output ("BASE=" + $base)

$loginBody = @{ username = "admin"; password = "11111111" } | ConvertTo-Json
$loginResp = Invoke-WebRequest -UseBasicParsing -Uri ($base + "/api/auth/login") -Method POST -ContentType "application/json" -Body $loginBody -SessionVariable sess
$loginJson = $loginResp.Content | ConvertFrom-Json
if (-not $loginJson.success) { Write-Output "LOGIN_FAILED"; $loginResp.Content; exit 1 }
Write-Output "LOGIN_OK"

$optionsResp = Invoke-RestMethod -Uri ($base + "/api/schedules/generate") -WebSession $sess -Method GET
if (-not $optionsResp.success) { Write-Output "OPTIONS_FAILED"; $optionsResp | ConvertTo-Json -Depth 8; exit 1 }

$majors = @($optionsResp.data.majors)
$semesters = @($optionsResp.data.semesters)
if ($majors.Count -eq 0 -or $semesters.Count -eq 0) { Write-Output "NO_OPTIONS_DATA"; $optionsResp | ConvertTo-Json -Depth 8; exit 1 }

$targetMajor = $majors[0]
$majorId = [string]$targetMajor.id
$targetSemesters = @($semesters | Where-Object { [string]$_.majorId -eq $majorId } | Select-Object -ExpandProperty id)
if ($targetSemesters.Count -eq 0) { $targetSemesters = @($semesters | Select-Object -First 1 -ExpandProperty id) }

$payload = @{
  majorId = $majorId
  semesterIds = $targetSemesters
  settings = @{
    avoidConflicts = $true
    optimizeRooms = $true
    balanceWorkload = $true
    respectPreferences = $true
  }
  replaceExisting = $false
} | ConvertTo-Json -Depth 8

Write-Output ("RUN_MAJOR=" + $majorId + "; SEMESTERS=" + ($targetSemesters -join ','))
$startResp = Invoke-RestMethod -Uri ($base + "/api/schedules/generate") -WebSession $sess -Method POST -ContentType "application/json" -Body $payload
if (-not $startResp.success) { Write-Output "START_FAILED"; $startResp | ConvertTo-Json -Depth 8; exit 1 }

$jobId = [string]$startResp.data.jobId
Write-Output ("JOB_ID=" + $jobId)

$final = $null
for ($i=0; $i -lt 240; $i++) {
  Start-Sleep -Seconds 2
  $statusResp = Invoke-RestMethod -Uri ($base + "/api/schedules/generate?jobId=" + $jobId) -WebSession $sess -Method GET
  if (-not $statusResp.success) { Write-Output "POLL_FAILED"; $statusResp | ConvertTo-Json -Depth 8; exit 1 }
  $data = $statusResp.data
  Write-Output ("POLL " + $i + ": status=" + $data.status + "; progress=" + $data.progress)
  if ($data.status -ne 'running') { $final = $data; break }
}

if ($null -eq $final) { Write-Output "TIMEOUT_WAITING_JOB"; exit 1 }
Write-Output "FINAL_STATUS"
$final | ConvertTo-Json -Depth 16
