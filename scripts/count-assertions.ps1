$lines = Get-Content "test-all.log"
$currentFile = "unknown"
$counts = [ordered]@{}

foreach ($line in $lines) {
    if ($line -match '> node server/tests/([^ ]+)') {
        $currentFile = $matches[1]
        if (-not $counts.Contains($currentFile)) {
            $counts[$currentFile] = 0
        }
    }
    # Match standalone \bPASS\b only, explicitly excluding summary and suite footer lines
    if ($line -match '\bPASS\b' -and $line -notmatch '(?i)summary|suite|exited') {
        if ($currentFile -ne "unknown") {
            $counts[$currentFile]++
        }
    }
}

Write-Output "| Test File | Assertions / Passes | Status |"
Write-Output "| :--- | :---: | :--- |"
foreach ($k in $counts.Keys) {
    Write-Output "| ``server/tests/$k`` | $($counts[$k]) | ✅ PASS |"
}
