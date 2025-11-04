param()

$repoRoot = Resolve-Path "$PSScriptRoot\.." | Select-Object -ExpandProperty Path
$githooksSrc = Join-Path $repoRoot ".githooks"
$githooksDst = Join-Path $repoRoot ".git\hooks"

if (-not (Test-Path $githooksDst)) {
    Write-Error ".git/hooks not found. Make sure you run this script from inside the repository (scripts folder)."
    exit 1
}

Get-ChildItem -Path $githooksSrc -File | ForEach-Object {
    $srcFile = $_.FullName
    $dstFile = Join-Path $githooksDst $_.Name
    Copy-Item -Path $srcFile -Destination $dstFile -Force
    Write-Host "Installed hook: $($_.Name)"
}

Write-Host "\nGit hooks installed. Commit message validation is now active."
Write-Host "If you want this automated for all clones, consider setting core.hooksPath or committing a setup script into your project's README."
