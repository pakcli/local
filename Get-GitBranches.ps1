<#
.SYNOPSIS
    PakCLI - Git Branches Inspector & Exporter (Interactive + CLI)
.PARAMETER Format
    Optional: 'csv' or 'tree'. If omitted, launches interactive menu [1 or 2].
.EXAMPLE
    .\Get-GitBranches.ps1
    .\Get-GitBranches.ps1 -Format csv
    .\Get-GitBranches.ps1 -Format tree
#>
[CmdletBinding()]
param (
    [ValidateSet('csv', 'tree')]
    [string]$Format
)

function Get-BranchesData {
    $rawHeads = git for-each-ref --format="%(refname:strip=2)" refs/heads/ 2>$null
    $rawRemotes = git for-each-ref --format="%(refname:strip=3)" refs/remotes/origin/ 2>$null

    $allBranches = @($rawHeads + $rawRemotes) | Where-Object { $_ -and $_ -ne 'HEAD' -and $_ -ne 'origin' } | Select-Object -Unique | Sort-Object

    $results = @()
    foreach ($b in $allBranches) {
        $hasLocal = (git rev-parse --verify --quiet "refs/heads/$b" 2>$null) -ne $null
        if ($hasLocal) {
            $localDate = git log -1 --format="%cd" --date=format:"%Y-%m-%d %H:%M:%S" "refs/heads/$b" 2>$null
            $localId   = git log -1 --format="%h" "refs/heads/$b" 2>$null
            $localMsg  = git log -1 --format="%s" "refs/heads/$b" 2>$null
        } else {
            $localDate = "-"
            $localId   = "-"
            $localMsg  = "-"
        }

        $hasRemote = (git rev-parse --verify --quiet "refs/remotes/origin/$b" 2>$null) -ne $null
        if ($hasRemote) {
            $remoteDate = git log -1 --format="%cd" --date=format:"%Y-%m-%d %H:%M:%S" "refs/remotes/origin/$b" 2>$null
            $remoteId   = git log -1 --format="%h" "refs/remotes/origin/$b" 2>$null
            $remoteMsg  = git log -1 --format="%s" "refs/remotes/origin/$b" 2>$null
        } else {
            $remoteDate = "-"
            $remoteId   = "-"
            $remoteMsg  = "-"
        }

        $results += [PSCustomObject]@{
            Branch     = $b
            RemoteDate = $remoteDate
            RemoteId   = $remoteId
            RemoteMsg  = $remoteMsg
            LocalDate  = $localDate
            LocalId    = $localId
            LocalMsg   = $localMsg
        }
    }
    return $results
}

function Format-AsCsv($results) {
    $lines = @("nama branch,latest commit date (remtote),latest commit id (remtote),latest commit message (remtote),latest commit date (local),latest commit id (local),latest commit message (local)")
    foreach ($r in $results) {
        $escRemoteMsg = '"' + ($r.RemoteMsg -replace '"', '""') + '"'
        $escLocalMsg  = '"' + ($r.LocalMsg -replace '"', '""') + '"'
        $lines += "$($r.Branch),$($r.RemoteDate),$($r.RemoteId),$escRemoteMsg,$($r.LocalDate),$($r.LocalId),$escLocalMsg"
    }
    return ($lines -join "`r`n")
}

function Format-AsTree($results) {
    $tab = [char]9
    $lines = @(
        '```tree',
        '-interactive: true',
        '-startshowlevel: 2',
        '-levelnumbered: 0',
        '-offsetlevelnumbered: 0',
        '-title: Git Branches',
        '-currentview: 1',
        '-header: lowercase',
        'branches'
    )

    foreach ($r in $results) {
        $bName = $r.Branch
        if ($bName -match '/') {
            $parts = $bName -split '/'
            $folder = $parts[0].ToLower()
            $subFolder = ($parts[1..($parts.Length-1)] -join '/').ToLower()
            $lines += "$tab$folder"
            $lines += "$tab$tab$subFolder"
            $lines += "$tab$tab$tab" + "Remote: $($r.RemoteDate) [$($r.RemoteId)] $($r.RemoteMsg)"
            $lines += "$tab$tab$tab" + "Local: $($r.LocalDate) [$($r.LocalId)] $($r.LocalMsg)"
        } else {
            $branchHeader = $bName.ToLower()
            $lines += "$tab$branchHeader"
            $lines += "$tab$tab" + "Remote: $($r.RemoteDate) [$($r.RemoteId)] $($r.RemoteMsg)"
            $lines += "$tab$tab" + "Local: $($r.LocalDate) [$($r.LocalId)] $($r.LocalMsg)"
        }
    }
    $lines += '```'
    return ($lines -join "`r`n")
}

# --- CLI Execution (jika ada parameter -Format) ---
if ($Format -eq 'csv') {
    $data = Get-BranchesData
    Write-Output (Format-AsCsv $data)
    exit 0
} elseif ($Format -eq 'tree') {
    $data = Get-BranchesData
    Write-Output (Format-AsTree $data)
    exit 0
}

# --- Interactive Menu (jika dijalankan tanpa parameter) ---
Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "         * PakCLI Suite - Git Branches Inspection Hub *         " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Repository: $(Split-Path -Leaf (Get-Location))" -ForegroundColor White
Write-Host "Branches:   Analyzing local and remote branches..." -ForegroundColor Gray
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  [1] Output CSV Format (Default)" -ForegroundColor Green
Write-Host "  [2] Output Obsidian Tree Codeblock" -ForegroundColor Cyan
Write-Host "  [3] Copy CSV to Clipboard" -ForegroundColor White
Write-Host "  [4] Copy Obsidian Tree Codeblock to Clipboard" -ForegroundColor Yellow
Write-Host "  [5] Save CSV to file (branches.csv)" -ForegroundColor Magenta
Write-Host "  [0] Exit" -ForegroundColor Red
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

$choice = Read-Host "Choose option [Default: 1]"
if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = "1"
}

$data = Get-BranchesData

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Output (Format-AsCsv $data)
    }
    "2" {
        Write-Host ""
        Write-Output (Format-AsTree $data)
    }
    "3" {
        $csvText = Format-AsCsv $data
        Set-Clipboard -Value $csvText
        Write-Host ""
        Write-Host "[OK] CSV data copied to Clipboard!" -ForegroundColor Green
    }
    "4" {
        $treeText = Format-AsTree $data
        Set-Clipboard -Value $treeText
        Write-Host ""
        Write-Host "[OK] Obsidian Tree codeblock copied to Clipboard!" -ForegroundColor Green
    }
    "5" {
        $csvText = Format-AsCsv $data
        $outFile = "branches.csv"
        Set-Content -Path $outFile -Value $csvText -Encoding UTF8
        Write-Host ""
        Write-Host "[OK] Saved to $outFile" -ForegroundColor Green
    }
    "0" {
        Write-Host "Exited." -ForegroundColor Gray
        exit 0
    }
    default {
        Write-Host "Invalid choice, printing default CSV:" -ForegroundColor Yellow
        Write-Output (Format-AsCsv $data)
    }
}
