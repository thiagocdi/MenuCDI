param([string]$commitMsgFile)

if (-not $commitMsgFile) {
    Write-Error "Missing commit-msg file path argument."
    exit 1
}

try {
    $commitMsg = Get-Content -Raw -Path $commitMsgFile -ErrorAction Stop
} catch {
    Write-Error "Unable to read commit message file: $commitMsgFile"
    exit 1
}

# Conventional commit pattern: type(optional-scope): description
$pattern = '^(feat|fix|refactor|docs|chore|test|perf|ci|build)(\([^)]+\))?:\s+.+'

if ($commitMsg -notmatch $pattern) {
    Write-Host "`nERROR: Commit message does not follow the required conventional format.`n"
    Write-Host "Expected format: <type>(optional-scope): <description>"
    Write-Host "Allowed types: feat, fix, refactor, docs, chore, test, perf, ci, build"
    Write-Host "Example: feat: add new API endpoint"
    exit 1
}

exit 0
