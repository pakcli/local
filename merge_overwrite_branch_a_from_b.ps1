<#
.SYNOPSIS
    Merges and completely overwrites Branch/Commit A with the exact tree state of Branch/Commit B.
    
.DESCRIPTION
    Creates a true 2-parent merge commit on Target (Branch A) whose tree is 100% identical
    to Source (Branch B), resolving any conflict automatically by adopting Source B's whole state.
    
    Default Commit Message:
        merge(<Target Commit Message> FROM <Source Commit Message>)
        
.EXAMPLE
    .\merge_overwrite_branch_a_from_b.ps1
    .\merge_overwrite_branch_a_from_b.ps1 -Target main -Source feature-xyz
    .\merge_overwrite_branch_a_from_b.ps1 -Target main -Source a1b2c3d -CustomMessage "merge: adopt release candidate"
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$Target,

    [Parameter(Mandatory = $false)]
    [string]$Source,

    [Parameter(Mandatory = $false)]
    [string]$CustomMessage
)

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

# Helper for colored output
function Write-Header($text) {
    Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Write-Success($text) {
    Write-Host "[OK] $text" -ForegroundColor Green
}

function Write-Warn($text) {
    Write-Host "[WARN] $text" -ForegroundColor Yellow
}

function Write-Err($text) {
    Write-Host "[ERROR] $text" -ForegroundColor Red
}

# 1. Verify Git Repository
try {
    $insideGit = (git rev-parse --is-inside-work-tree 2>$null)
    if ($insideGit -ne "true") {
        Write-Err "Not inside a valid Git repository."
        exit 1
    }
} catch {
    Write-Err "Git is not installed or not in PATH."
    exit 1
}

# 2. Check for Dirty Working Directory
$gitStatus = (git status --porcelain 2>$null)
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
    Write-Warn "Working directory has uncommitted changes:"
    git status --short
    $choice = Read-Host "`nStash changes automatically before proceeding? (y/n/abort) [Default: y]"
    if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "y" }
    
    if ($choice.ToLower() -eq "y") {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        git stash push -m "merge_overwrite_backup_$timestamp"
        Write-Success "Changes stashed safely."
    } else {
        Write-Err "Aborted. Please commit or stash your changes first."
        exit 1
    }
}

$currentBranch = (git branch --show-current 2>$null)
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
    $currentBranch = (git rev-parse --short HEAD 2>$null)
}

Write-Header "Git Merge Overwrite: Branch A from Branch B"
Write-Host "Current location: $currentBranch" -ForegroundColor DarkGray

# Display Available Branches and Recent Commits
Write-Host "`n--- Local Branches ---" -ForegroundColor DarkCyan
git branch --format="  %(refname:short)"

Write-Host "`n--- Recent Commits (Top 8) ---" -ForegroundColor DarkCyan
git log -n 8 --oneline --decorate

# 3. Resolve Target (Branch / Commit A)
if ([string]::IsNullOrWhiteSpace($Target)) {
    Write-Host ""
    $prompt = if ($currentBranch) { "Target branch / commit to overwrite (Branch A) [Default: $currentBranch]: " } else { "Target branch / commit to overwrite (Branch A): " }
    $TargetInput = Read-Host $prompt
    if ([string]::IsNullOrWhiteSpace($TargetInput)) {
        $Target = $currentBranch
    } else {
        $Target = $TargetInput.Trim()
    }
}

try {
    $targetHash = (git rev-parse --verify "$Target^{commit}" 2>$null)
    if (-not $targetHash) {
        Write-Err "Invalid target branch or commit: '$Target'"
        exit 1
    }
    $targetHash = $targetHash.Trim()
    $targetShort = (git rev-parse --short $targetHash).Trim()
    $targetMsg = (git log -1 --format=%s $targetHash).Trim()
} catch {
    Write-Err "Failed to resolve target: $($_.Exception.Message)"
    exit 1
}

# 4. Resolve Source (Branch / Commit B)
if ([string]::IsNullOrWhiteSpace($Source)) {
    Write-Host ""
    $SourceInput = Read-Host "Source branch / commit ID to copy state FROM (Branch B): "
    if ([string]::IsNullOrWhiteSpace($SourceInput)) {
        Write-Err "Source branch or commit ID cannot be empty."
        exit 1
    }
    $Source = $SourceInput.Trim()
}

try {
    $sourceHash = (git rev-parse --verify "$Source^{commit}" 2>$null)
    if (-not $sourceHash) {
        Write-Err "Invalid source branch or commit: '$Source'"
        exit 1
    }
    $sourceHash = $sourceHash.Trim()
    $sourceShort = (git rev-parse --short $sourceHash).Trim()
    $sourceMsg = (git log -1 --format=%s $sourceHash).Trim()
} catch {
    Write-Err "Failed to resolve source: $($_.Exception.Message)"
    exit 1
}

if ($targetHash -eq $sourceHash) {
    Write-Warn "Target ($targetShort) and Source ($sourceShort) point to the exact same commit!"
    $proceedSame = Read-Host "Do you still want to proceed creating an overwrite commit? (y/N)"
    if ($proceedSame.ToLower() -ne "y") {
        Write-Host "Operation cancelled." -ForegroundColor DarkGray
        exit 0
    }
}

# 5. Formulate Commit Message
$defaultCommitMsg = "merge($($targetMsg) FROM $($sourceMsg))"

if ([string]::IsNullOrWhiteSpace($CustomMessage)) {
    Write-Host "`n--- Commit Message ---" -ForegroundColor DarkCyan
    Write-Host "Default message: " -NoNewline
    Write-Host $defaultCommitMsg -ForegroundColor Yellow
    $userMsg = Read-Host "Enter custom commit message (or press Enter to use default)"
    if (-not [string]::IsNullOrWhiteSpace($userMsg)) {
        $finalCommitMsg = $userMsg.Trim()
    } else {
        $finalCommitMsg = $defaultCommitMsg
    }
} else {
    $finalCommitMsg = $CustomMessage.Trim()
}

# 6. Summary Confirmation
Write-Header "Execution Plan"
Write-Host "Target (A)       : $Target [$targetShort] -> '$targetMsg'" -ForegroundColor White
Write-Host "Source (B)       : $Source [$sourceShort] -> '$sourceMsg'" -ForegroundColor White
Write-Host "Commit Message   : $finalCommitMsg" -ForegroundColor Yellow
Write-Host "Action           : Overwrite Target A completely with Source B tree using 2-parent merge" -ForegroundColor Magenta

$confirm = Read-Host "`nAre you sure you want to execute overwrite merge? (y/N)"
if ($confirm.ToLower() -ne "y") {
    Write-Host "Aborted by user." -ForegroundColor DarkGray
    exit 0
}

# 7. Execute Overwrite Merge
Write-Header "Executing Merge Overwrite"

# Switch to target branch if Target is a branch and not currently on it
$allBranches = (git branch --format="%(refname:short)") -split "`r?`n"
if ($allBranches -contains $Target) {
    if ($currentBranch -ne $Target) {
        Write-Host "Checking out branch '$Target'..." -ForegroundColor DarkGray
        git checkout $Target
    }
}

try {
    # Extract Source B tree
    $sourceTree = (git rev-parse "$sourceHash^{tree}").Trim()
    Write-Host "Extracted tree from source: $sourceTree" -ForegroundColor DarkGray

    # Create merge commit with 2 parents: Target (p1) and Source (p2)
    # Using git commit-tree creates a commit without touching working tree first
    $newCommitHash = (git commit-tree $sourceTree -p $targetHash -p $sourceHash -m $finalCommitMsg).Trim()
    Write-Host "Created merge commit object: $newCommitHash" -ForegroundColor DarkGray

    # Fast-forward / reset Target to the newly created merge commit
    git reset --hard $newCommitHash

    Write-Success "Merge overwrite completed successfully!"
    Write-Host "`nLatest Commit Details:" -ForegroundColor Cyan
    git log -1 --stat --decorate
} catch {
    Write-Err "Merge overwrite failed: $($_.Exception.Message)"
    exit 1
}
