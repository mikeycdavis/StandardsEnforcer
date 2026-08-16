#Requires -Version 5.1
<#
.SYNOPSIS
    Run this repository's complete CI pipeline locally, in Docker.

.DESCRIPTION
    The authoritative local CI command. It stages the exact commit under test, builds an
    ephemeral image from it, runs ci/checks.sh inside a network-isolated container with the
    authoritative standards oracle mounted read-only, and writes a machine-readable result to
    artifacts/local-ci/latest.json.

    WHAT IT VERIFIES, AND WHY THAT IS THE COMMIT. By default this runs against `git archive HEAD`
    — the committed tree — not the working tree. That is the whole point: scripts/submit-pr.ps1
    pushes a commit, so CI has to have verified a commit. Once the archive is taken, nothing on
    this machine can change what runs.

    Exit code 0 means every check passed. Any other exit code means it did not.

.PARAMETER WorkingTree
    Verify the working tree instead of the committed HEAD. For iterating on a change before
    committing it. The result is recorded with source "working-tree" and scripts/submit-pr.ps1
    will refuse to push on the strength of it.

.PARAMETER KeepOnFailure
    On failure, leave the built image and the staged source in place, and print how to get a
    shell inside them. Containers and networks are still removed.

.PARAMETER Oracle
    Path to the authoritative standards checkout. Defaults to $env:ENFORCER_ORACLE_HOST_PATH, then
    to a sibling MachineLearningStandards directory beside the repository.

.PARAMETER Verbose
    Stream the Docker build output rather than summarising it.

.EXAMPLE
    .\scripts\ci.ps1
.EXAMPLE
    .\scripts\ci.ps1 -WorkingTree -Verbose
.EXAMPLE
    .\scripts\ci.ps1 -KeepOnFailure
#>
[CmdletBinding()]
param(
    [switch] $WorkingTree,
    [switch] $KeepOnFailure,
    [string] $Oracle
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false   # native exit codes are checked explicitly

function Write-Step { param([string] $Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Fail { param([string] $Message) Write-Host "!!! $Message" -ForegroundColor Red }

function Invoke-Native {
    param([string] $Exe, [string[]] $Arguments, [string] $What)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}

# ---------------------------------------------------------------------------------------------
# Preconditions. Docker and git only: the point of containerising CI is that nothing else on this
# machine is allowed to matter.
# ---------------------------------------------------------------------------------------------

foreach ($tool in @('git', 'docker')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Fail "$tool is required and was not found on PATH."
        exit 127
    }
}

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'Docker Compose v2 is required (docker compose version).'
    exit 127
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'The Docker daemon is not reachable. Start Docker Desktop and try again.'
    exit 127
}

$RepoRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($RepoRoot)) {
    Write-Fail 'Not inside a git repository.'
    exit 2
}
$RepoRoot = $RepoRoot.Trim()
$RepoName = Split-Path -Leaf $RepoRoot

$Commit = (& git -C $RepoRoot rev-parse HEAD 2>$null)
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'HEAD does not resolve to a commit. Nothing to verify.'
    exit 2
}
$Commit = $Commit.Trim()
$Branch = (& git -C $RepoRoot rev-parse --abbrev-ref HEAD).Trim()
$Source = if ($WorkingTree) { 'working-tree' } else { 'commit' }

# ---------------------------------------------------------------------------------------------
# The oracle. This repository's one external dependency: a real standards release to integrate
# against. Resolved here rather than inside the container so that a wrong path is a clear message
# on the host instead of a mount that silently appears empty.
# ---------------------------------------------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($Oracle)) { $Oracle = $env:ENFORCER_ORACLE_HOST_PATH }
if ([string]::IsNullOrWhiteSpace($Oracle)) {
    $Oracle = Join-Path (Split-Path -Parent $RepoRoot) 'MachineLearningStandards'
}

if (-not (Test-Path (Join-Path $Oracle '.git'))) {
    Write-Fail "No git repository at the oracle path: $Oracle"
    Write-Host ''
    Write-Host 'Local CI runs the authoritative integration suite, which needs a real standards'
    Write-Host 'release to run against. A synthetic one does not satisfy it, by design (FE-14).'
    Write-Host ''
    Write-Host 'Point at a checkout with:   .\scripts\ci.ps1 -Oracle <path>'
    Write-Host 'or set ENFORCER_ORACLE_HOST_PATH.'
    exit 3
}
$Oracle = (Resolve-Path $Oracle).Path

# ---------------------------------------------------------------------------------------------
# Uniquely named, ephemeral resources. Two repositories, two branches, or two developers on one
# machine must not be able to collide — and nothing here may name, touch, or remove a resource
# this run did not create.
# ---------------------------------------------------------------------------------------------

$Slug = ($RepoName.ToLowerInvariant() -replace '[^a-z0-9]', '')
if ($Slug.Length -gt 24) { $Slug = $Slug.Substring(0, 24) }
$Project = "localci-$Slug-$($Commit.Substring(0,12))-$PID"
$Image = "local-ci/$Slug`:$Commit"

$StageDir = Join-Path ([System.IO.Path]::GetTempPath()) "localci-stage-$Project"
$OutDir = Join-Path $RepoRoot 'artifacts/local-ci'
$Cleaned = $false

function Invoke-Cleanup {
    param([bool] $Passed)
    if ($script:Cleaned) { return }
    $script:Cleaned = $true

    Write-Step 'Cleaning up'

    # Scoped to this run's compose project by name. It cannot reach a container, network or
    # volume that belongs to anything else — including another concurrent run of this same
    # pipeline, which has a different project name.
    & docker compose -p $Project -f (Join-Path $RepoRoot 'compose.ci.yml') down `
        --volumes --remove-orphans --timeout 10 *> $null

    if ($Passed -or -not $KeepOnFailure) {
        if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir -ErrorAction SilentlyContinue }
        # Only the image this run built and tagged. `docker image prune` is never called: it would
        # reach images unrelated to this repository.
        & docker image rm -f $Image *> $null
    }
    else {
        Write-Host ''
        Write-Host 'Kept for debugging (-KeepOnFailure):' -ForegroundColor Yellow
        Write-Host "  image        $Image"
        Write-Host "  staged src   $StageDir"
        Write-Host ''
        Write-Host '  Shell into the failed environment:'
        Write-Host "    docker run --rm -it --entrypoint bash -v `"$Oracle`:/oracle:ro`" $Image"
        Write-Host ''
        Write-Host '  Remove it when you are done:'
        Write-Host "    docker image rm -f $Image"
    }
}

# Cleanup must happen on a failed check, on a thrown error, and on Ctrl-C. `finally` covers the
# first two; the trap covers the third.
trap { Invoke-Cleanup -Passed $false; break }

$ExitCode = 1
try {
    Write-Host ''
    Write-Host '===========================================================================' -ForegroundColor Cyan
    Write-Host " Local CI — $RepoName" -ForegroundColor Cyan
    Write-Host " branch $Branch"
    Write-Host " commit $Commit"
    Write-Host " source $Source"
    Write-Host " oracle $Oracle"
    Write-Host '===========================================================================' -ForegroundColor Cyan
    Write-Host ''

    # --- stage the source under test ----------------------------------------------------------
    Write-Step "Staging source ($Source)"
    if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
    New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

    if ($WorkingTree) {
        # Tracked and untracked-but-not-ignored, so an uncommitted new file is included and
        # node_modules or artifacts/local-ci are not.
        $files = & git -C $RepoRoot ls-files --cached --others --exclude-standard
        if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed' }
        foreach ($f in $files) {
            $src = Join-Path $RepoRoot $f
            if (-not (Test-Path $src -PathType Leaf)) { continue }   # deleted-but-tracked
            $dst = Join-Path $StageDir $f
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
            Copy-Item -LiteralPath $src -Destination $dst -Force
        }
    }
    else {
        # `git archive` is the exact committed tree — no working-tree state can leak in, which is
        # what makes the verified SHA mean something.
        $tar = Join-Path ([System.IO.Path]::GetTempPath()) "$Project.tar"
        Invoke-Native git @('-C', $RepoRoot, 'archive', '--format=tar', '-o', $tar, $Commit) 'git archive'
        Invoke-Native tar @('-xf', $tar, '-C', $StageDir) 'tar extract'
        Remove-Item -Force $tar -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path (Join-Path $StageDir 'ci/checks.sh'))) {
        throw "ci/checks.sh is not present in the staged source. It must be committed before CI can run it."
    }

    # --- prepare the evidence directory -------------------------------------------------------
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    # A stale result from a previous run must not be readable as this run's. If this run dies
    # before writing one, the absence is the honest record — and ci/verify.mjs refuses on absence.
    Remove-Item -Force (Join-Path $OutDir 'latest.json') -ErrorAction SilentlyContinue

    # --- compose environment ------------------------------------------------------------------
    $env:CI_PROJECT = $Project
    $env:CI_CONTEXT = $StageDir
    $env:CI_IMAGE = $Image
    $env:CI_ORACLE_PATH = $Oracle
    $env:CI_OUT_PATH = $OutDir
    $env:CI_COMMIT = $Commit
    $env:CI_BRANCH = $Branch
    $env:CI_REPOSITORY = $RepoName
    $env:CI_SOURCE = $Source

    $compose = @('compose', '-p', $Project, '-f', (Join-Path $RepoRoot 'compose.ci.yml'))

    # --- build --------------------------------------------------------------------------------
    Write-Step 'Building the CI image'
    if ($PSBoundParameters.ContainsKey('Verbose') -or $VerbosePreference -eq 'Continue') {
        & docker @compose build --progress plain ci
    }
    else {
        & docker @compose build ci
    }
    if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed' }

    # --- run ----------------------------------------------------------------------------------
    # `run` rather than `up`, so the pipeline's exit code is this command's exit code. When this
    # compose file grows service dependencies, `run` still honours their `service_healthy`
    # conditions — the wait is a real health check, never a sleep.
    Write-Step 'Running the pipeline'
    Write-Host ''
    & docker @compose run --rm --no-TTY ci
    $ExitCode = $LASTEXITCODE

    # --- bind the result back to what we staged -----------------------------------------------
    # The container reports the commit it was told it was running. This confirms the report agrees
    # with what was actually archived, so a mislabelled result cannot become the record.
    $resultFile = Join-Path $OutDir 'latest.json'
    if ($ExitCode -eq 0) {
        if (-not (Test-Path $resultFile)) {
            Write-Fail 'The pipeline reported success but wrote no result. Treating as a failure.'
            $ExitCode = 1
        }
        else {
            $result = Get-Content -Raw $resultFile | ConvertFrom-Json
            if ($result.commit -ne $Commit -or $result.result -ne 'passed') {
                Write-Fail "The recorded result does not match this run (commit $($result.commit), result $($result.result)). Treating as a failure."
                $ExitCode = 1
            }
        }
    }

    Invoke-Cleanup -Passed ($ExitCode -eq 0)

    Write-Host ''
    if ($ExitCode -eq 0) {
        Write-Host "LOCAL CI PASS  $Commit" -ForegroundColor Green
        Write-Host "Result: $resultFile"
    }
    else {
        Write-Fail "LOCAL CI FAIL (exit $ExitCode)"
    }
    Write-Host ''
}
catch {
    Write-Fail $_.Exception.Message
    Invoke-Cleanup -Passed $false
    $ExitCode = 1
}
finally {
    Invoke-Cleanup -Passed ($ExitCode -eq 0)
}

exit $ExitCode
