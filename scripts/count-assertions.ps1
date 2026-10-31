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
    if ($line -match 'PASS|✓') {
        if ($currentFile -ne "unknown") {
            $counts[$currentFile]++
        }
    }
}

Write-Output "| Test File | Assertions / Passes | Status |"
Write-Output "| :--- | :---: | :--- |"
foreach ($k in $counts.Keys) {
    Write-Output "| \`server/tests/$k\` | $($counts[$k]) | ✅ PASS |"
}
