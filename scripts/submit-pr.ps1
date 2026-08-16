#Requires -Version 5.1
<#
.SYNOPSIS
    Verify the current commit with local Docker CI, then push exactly that commit and open a PR.

.DESCRIPTION
    Enforces one invariant:

        A pull request may only be submitted if the exact commit SHA being pushed has
        successfully passed the repository's complete containerized CI pipeline.

    The order matters and is not negotiable: record HEAD, run the full pipeline, resolve HEAD
    again, refuse if it moved, then push that SHA by name rather than pushing "the branch".

    This never commits anything, never amends, never stashes and never force-pushes. If the tree
    is dirty it stops and says so; making the pipeline pass is the developer's job, not this
    script's.

.PARAMETER Base
    Base branch for the pull request. Defaults to the remote's default branch.

.PARAMETER Title
    Pull request title. Defaults to the subject of the verified commit.

.PARAMETER Body
    Pull request body. The local-CI verification block is appended to it; your text is never
    replaced.

.PARAMETER BodyFile
    Read the pull request body from a file instead of -Body.

.PARAMETER Draft
    Open the pull request as a draft.

.PARAMETER Remote
    Git remote to push to. Defaults to origin.

.PARAMETER AllowDirty
    Permit a dirty working tree. The commit is still what gets verified and pushed, so this only
    means "I know uncommitted changes exist and they are not part of this PR".

.EXAMPLE
    .\scripts\submit-pr.ps1
.EXAMPLE
    .\scripts\submit-pr.ps1 -Draft -Base develop
#>
[CmdletBinding()]
param(
    [string] $Base,
    [string] $Title,
    [string] $Body,
    [string] $BodyFile,
    [switch] $Draft,
    [string] $Remote = 'origin',
    [switch] $AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Write-Step { param([string] $m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Fail { param([string] $m) Write-Host "!!! $m" -ForegroundColor Red }

# ---------------------------------------------------------------------------------------------
# 1. A git repository
# ---------------------------------------------------------------------------------------------

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Fail 'git is required.'; exit 127 }

$RepoRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($RepoRoot)) {
    Write-Fail 'Not inside a git repository.'
    exit 2
}
$RepoRoot = $RepoRoot.Trim()

# ---------------------------------------------------------------------------------------------
# 2. A branch that may be submitted
# ---------------------------------------------------------------------------------------------

$Branch = (& git -C $RepoRoot rev-parse --abbrev-ref HEAD).Trim()
if ($Branch -eq 'HEAD') {
    Write-Fail 'HEAD is detached. Check out a branch before submitting a pull request.'
    exit 2
}

# The remote's own idea of its default branch, asked rather than assumed — "main" is a convention,
# not a guarantee, and guessing it wrong is how a script pushes to the wrong place.
$DefaultBranch = $null
$symref = (& git -C $RepoRoot symbolic-ref --quiet "refs/remotes/$Remote/HEAD" 2>$null)
if ($LASTEXITCODE -eq 0 -and $symref) { $DefaultBranch = ($symref -replace ".*/", '').Trim() }
if (-not $DefaultBranch) { $DefaultBranch = 'main' }

if ([string]::IsNullOrWhiteSpace($Base)) { $Base = $DefaultBranch }

if ($Branch -eq $Base -or $Branch -in @('main', 'master', $DefaultBranch)) {
    Write-Fail "Refusing to submit from '$Branch': it is a default or base branch."
    Write-Host 'Create a feature branch and submit from that.'
    exit 2
}

# ---------------------------------------------------------------------------------------------
# 3. A clean working tree
# ---------------------------------------------------------------------------------------------
# CI verifies the committed tree, so uncommitted work is not what gets tested and is not what gets
# pushed. Refusing by default keeps "it passed" and "what I have in front of me" the same thing.

$Dirty = (& git -C $RepoRoot status --porcelain)
if ($Dirty -and -not $AllowDirty) {
    Write-Fail 'The working tree is dirty. Commit or stash before submitting.'
    Write-Host ''
    $Dirty | ForEach-Object { Write-Host "  $_" }
    Write-Host ''
    Write-Host 'Local CI verifies the committed tree, so these changes would be neither tested nor pushed.'
    Write-Host 'Use -AllowDirty only if you are certain they are not part of this pull request.'
    exit 2
}

# ---------------------------------------------------------------------------------------------
# 4. Record HEAD before verification
# ---------------------------------------------------------------------------------------------

$HeadBefore = (& git -C $RepoRoot rev-parse HEAD).Trim()
$Subject = (& git -C $RepoRoot log -1 --pretty=%s).Trim()

Write-Host ''
Write-Host '===========================================================================' -ForegroundColor Cyan
Write-Host ' Verified pull request submission' -ForegroundColor Cyan
Write-Host " branch  $Branch  ->  $Base"
Write-Host " commit  $HeadBefore"
Write-Host '===========================================================================' -ForegroundColor Cyan

# ---------------------------------------------------------------------------------------------
# 5-6. Run the authoritative pipeline; stop on failure
# ---------------------------------------------------------------------------------------------

Write-Step 'Running local CI'
& (Join-Path $RepoRoot 'scripts/ci.ps1')
$CiExit = $LASTEXITCODE

if ($CiExit -ne 0) {
    Write-Host ''
    Write-Fail 'CI failed. No branch was pushed and no PR was created.'
    exit 1
}

# ---------------------------------------------------------------------------------------------
# 7-8. Resolve HEAD again and refuse if it moved
# ---------------------------------------------------------------------------------------------
# The comparison itself lives in ci/verify.mjs and is unit-tested in test/local-ci-verify.test.mjs,
# because a guard nothing tests is a guard that fails open. It runs in a container so that
# enforcing this needs no Node on the developer's machine.

$HeadAfter = (& git -C $RepoRoot rev-parse HEAD).Trim()

Write-Step 'Verifying the commit to be pushed is the commit that passed'

& docker run --rm --network none `
    -v "$($RepoRoot)/ci:/ci:ro" `
    -v "$($RepoRoot)/artifacts/local-ci:/evidence:ro" `
    node:20-bookworm-slim `
    node /ci/verify.mjs --evidence=/evidence/latest.json --head=$HeadAfter --branch=$Branch

if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Fail 'Verification refused this submission. Nothing was pushed and no PR was created.'
    exit 1
}

# ---------------------------------------------------------------------------------------------
# 9. Push the exact verified commit
# ---------------------------------------------------------------------------------------------
# `<sha>:refs/heads/<branch>` rather than `git push <remote> <branch>`. The two are the same thing
# only as long as nothing moved the branch, and "nothing moved" is the assumption this whole
# script exists to stop making.

& git -C $RepoRoot remote get-url $Remote *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Fail "No such remote: $Remote"
    exit 2
}

Write-Step "Pushing $HeadAfter to $Remote/$Branch"
& git -C $RepoRoot push $Remote "$($HeadAfter):refs/heads/$Branch"
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Push failed. No PR was created.'
    exit 1
}
& git -C $RepoRoot branch --set-upstream-to="$Remote/$Branch" $Branch *> $null

# ---------------------------------------------------------------------------------------------
# 10. Create the pull request
# ---------------------------------------------------------------------------------------------

$Verification = @"

---

## Local CI

``````
Verified commit: $HeadAfter
Result:          PASS
Environment:     Docker (containerised local pipeline, ``scripts/ci.ps1``)
Checks:          environment, no-install-invariant, oracle-readiness, test-suite
``````

This branch was verified by the repository's containerised local pipeline before it was pushed.
The commit above is the exact commit that passed it — see ``docs/local-ci.md``.

**This is not a GitHub Actions result.** GitHub-hosted workflows report separately, and nothing
here should be read as a claim about them.
"@

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host 'GitHub CLI (gh) is not installed, so no PR was created.' -ForegroundColor Yellow
    Write-Host "The verified commit is pushed. Open the PR manually against '$Base'."
    exit 0
}

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'GitHub CLI is not authenticated, so no PR was created.' -ForegroundColor Yellow
    Write-Host "Run 'gh auth login', then open the PR against '$Base'."
    exit 0
}

# An existing PR is updated by the push that just happened. Creating a second one would be wrong,
# and overwriting the first one's body would destroy whatever a human wrote in it.
#
# But the body's verification block names the commit that was verified when the PR was opened, and
# the head has just moved past it. Leaving it there would make the pull request assert that a
# commit which is no longer the head was the verified one — a stale verification claim on the
# artefact whose whole purpose is to carry a fresh one. So the new result is added as a comment:
# additive, so nothing a human wrote is touched, and the newest verification is the newest comment.
$existing = (& gh pr view $Branch --json url --jq .url 2>$null)
if ($LASTEXITCODE -eq 0 -and $existing) {
    $tmpComment = Join-Path ([System.IO.Path]::GetTempPath()) "pr-verify-$PID.md"
    Set-Content -Path $tmpComment -Encoding UTF8 -Value @"
Re-verified after a push to this branch.

``````
Verified commit: $HeadAfter
Result:          PASS
Environment:     Docker (containerised local pipeline, ``scripts/ci.ps1``)
Checks:          environment, no-install-invariant, oracle-readiness, test-suite
``````

The verification block in the description names the commit that was head when this pull request was
opened. **This comment supersedes it.** Local Docker verification only — not a GitHub Actions result.
"@
    try {
        & gh pr comment $Branch --body-file $tmpComment *> $null
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Could not add the verification comment; the description may name an older commit.' -ForegroundColor Yellow
        }
    }
    finally {
        Remove-Item -Force $tmpComment -ErrorAction SilentlyContinue
    }

    Write-Host ''
    Write-Host 'A pull request already exists and now points at the verified commit:' -ForegroundColor Green
    Write-Host "  $existing"
    Write-Host "  verified $HeadAfter (recorded as a comment)"
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Title)) { $Title = $Subject }

$bodyText = ''
if (-not [string]::IsNullOrWhiteSpace($BodyFile)) { $bodyText = Get-Content -Raw $BodyFile }
elseif (-not [string]::IsNullOrWhiteSpace($Body)) { $bodyText = $Body }
else { $bodyText = (& git -C $RepoRoot log -1 --pretty=%b).Trim() }

$tmpBody = Join-Path ([System.IO.Path]::GetTempPath()) "pr-body-$PID.md"
Set-Content -Path $tmpBody -Value ($bodyText.TrimEnd() + "`n" + $Verification) -Encoding UTF8

try {
    Write-Step "Creating the pull request against $Base"
    $ghArgs = @('pr', 'create', '--base', $Base, '--head', $Branch, '--title', $Title, '--body-file', $tmpBody)
    if ($Draft) { $ghArgs += '--draft' }
    & gh @ghArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'gh pr create failed. The verified commit is pushed; open the PR manually.'
        exit 1
    }
}
finally {
    Remove-Item -Force $tmpBody -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host "Submitted. Verified commit $HeadAfter" -ForegroundColor Green
exit 0
