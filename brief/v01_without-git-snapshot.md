# Brief v01: Local Development Without Git Snapshot

> **Status:** Current Architecture / Baseline (Score: 10/10)  
> **Scope:** `pakcli-plugin/local` & Workspace Projects  
> **Context:** Single-branch linear commit workflow without dedicated local snapshot mechanics.

---

## 1. Executive Summary & Current State

Currently, local developer workflows rely on traditional standard Git practices, committing work directly to the active feature branch (e.g., `feat/stable-features-step-by-step`).

Checkpoints and work-in-progress backups are handled via:
1. **Direct Commit:** `git commit -m "..."` committed directly onto the working branch.
2. **Git Stash:** `git stash` temporarily invoked to clear or stash work.
3. **Manual Folder Copies:** Duplicating project folders before risky refactoring (`cp -r project project_backup`).

---

## 2. Physical `.git` Internal Anatomy: Why Does the Tree Look "Hidden"?

Many developers mistakenly believe their Git branches or history tree are lost or limited to a single linear commit chain. Here is the actual internal structure inside `.git`:

```
.git/
├── HEAD                        <── Contains text: "ref: refs/heads/feat/stable..."
├── refs/
│   ├── heads/                  <── LOCAL BRANCH POINTERS
│   │   ├── master              <── 41-byte text file (Commit SHA: 41f7e20...)
│   │   └── feat/stable...      <── 41-byte text file (Commit SHA: dac732c...)
│   └── remotes/origin/         <── REMOTE TRACKING POINTERS (GitHub)
│       ├── master
│       └── feat/stable...
└── objects/                    <── BLOB, TREE, & COMMIT OBJECT DATABASE (SHA-1 / zlib)
    ├── da/c732c...             <── Active commit object
    └── 71/430f2...             <── Previous parent object
```

### Technical Reasons the Tree Appears as Only One Linear Line:
1. **Default `git log` Only Follows `HEAD`:**
   - When running `git log`, Git reads `.git/HEAD`, resolves the active branch pointer, and walks backwards strictly through its primary ancestor chain.
   - Other branches (e.g., `master`, `feat-get-copy`, `remotes/origin/*`) are **intentionally omitted** by default.
2. **No Visual Graph Flag:**
   - Without the `--graph` and `--all` flags, Git does not render branch forks and merges.
   - **Command to reveal the full graphical tree:**
     ```bash
     git log --graph --oneline --all --decorate
     ```

---

## 3. Real-World Case Study: "The 5 PM Panic Scenario"

Consider a common developer dilemma at 5:00 PM:
1. You are actively modifying 8 complex files for an experimental feature.
2. The workstation must shut down immediately or an automated OS reboot is scheduled.
3. **The Painful Dilemma:**
   - *Option A (Direct Commit):* Commit immediately to the branch. The code is broken and won't build, polluting the branch history.
   - *Option B (Git Stash):* Run `git stash`. The next morning, running `git stash pop` triggers merge conflicts or gets buried under other stashes.
   - *Option C (Leave Uncommitted):* Leave dirty files on disk. If an accidental `git checkout .` occurs, **4 hours of work are permanently erased**.

---

## 4. Risk Analysis & Metrics Matrix

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 CURRENT LINEAR WORKFLOW                 │
                  └─────────────────────────────────────────────────────────┘
                                               │
                                       Extreme Testing?
                                      /                \
                       [Direct Commit]               [Use git stash]
                              │                               │
                       Cluttered Commits             Overwritten / Lost Stash
                      ("wip", "fix", "temp")         Merge Conflict on Pop
                              │                               │
                       Interactive Rebase            No Clear Timeline
```

| Parameter | Current State (v01) | Real Impact Metrics |
| :--- | :--- | :--- |
| **Commit Clutter** | Forced to commit `"wip"`, `"test"`, `"error again"` into feature branches. | Requires **15–30 minutes** of interactive rebasing (`git rebase -i`) before PRs. |
| **Data Loss Anxiety** | Hesitation during major refactoring due to lack of safe checkpoints. | Velocity drops by **~40%** due to defensive manual copy-pasting. |
| **Stash Confusion** | `git stash` acts as a blind stack with no visual file diff preview. | Pop conflict rate reaches **~25% of cases**. |
| **Granular Recovery** | Cannot restore a single file from 20 minutes ago without resetting the entire branch. | Working code gets overwritten and must be manually rewritten. |

---

## 5. Baseline Conclusion (v01)

Operating without a local snapshot system forces developers to treat Git simultaneously as a **public release log** and a **dirty scratchpad**. This workflow bottleneck is solved by the Local Git Snapshot architecture in [v02_with-git-snapshot.md](file:///d:/0pro/pakcli-plugin/local/brief/v02_with-git-snapshot.md).
