# Agent Execution and Permission Protocol

> Managed via apply-config.ps1 and config.csv.

## 1. Allowed Automatically (No Prompts / No Confirmation)
The agent MUST proceed automatically without prompting for:
- ***** (FileOperations): Edit and view any workspace file freely
- **Select-String*** (Inspection): Search text in files without prompt
- **Get-ChildItem*** (Inspection): List directory contents without prompt
- **Get-Content*** (Inspection): Read file content without prompt
- **Test-Path*** (Inspection): Check path existence without prompt
- **dir*** (Inspection): Directory listing without prompt
- **git *** (Inspection): Git status, diff, and inspection checks
- **Move-Item*** (Inspection): Move files safely to trash or target
- **Copy-Item*** (Inspection): Copy files safely without prompt
- **npm run*** (BuildRun): Run existing npm scripts without prompt
- **npm test*** (BuildRun): Run existing npm test scripts without prompt
- **pnpm run*** (BuildRun): Run existing pnpm scripts without prompt
- **pnpm build*** (BuildRun): Build project with pnpm without prompt
- **pnpm test*** (BuildRun): Test project with pnpm without prompt
- **node*** (Screenshot): Run Node and Playwright verification screenshots
- **npx*** (Screenshot): Run npx tools for verification without prompt

## 2. File Cleanup Policy (Never Hard Delete)
The agent MUST NEVER use Remove-Item -Force or permanently delete files.
Instead, move the files to the designated trash folder:
- Pattern: **verify_desktop_*.png** -> Move to: **trash-bin/** (Move screenshot verifications to trash-bin instead of hard delete)
- Pattern: ***.tmp** -> Move to: **trash-bin/** (Move temporary artifacts to trash-bin instead of hard delete)
- Pattern: ***.bak** -> Move to: **trash-bin/** (Move backup files to trash-bin instead of hard delete)
- Pattern: ***.old** -> Move to: **trash-bin/** (Move old artifacts to trash-bin instead of hard delete)

## 3. Strictly Require User Approval (Must Ask Permission)
The agent MUST STOP and obtain explicit user permission before executing any of the following:
- ***.ps1** (Restricted): PowerShell script execution requires user approval
- ***.bat** (Restricted): Batch script execution requires user approval
- ***.cmd** (Restricted): Command script execution requires user approval
- **npm install*** (Restricted): Installing npm packages requires user approval
- **npm i*** (Restricted): Installing npm packages requires user approval
- **pnpm add*** (Restricted): Installing pnpm packages requires user approval
- **pnpm i*** (Restricted): Installing pnpm packages requires user approval
- **pip install*** (Restricted): Installing pip packages requires user approval
- **curl*** (Restricted): Downloading external files requires user approval
- **wget*** (Restricted): Downloading external files requires user approval
- **Invoke-WebRequest*** (Restricted): PowerShell web requests require user approval
- **Remove-Item -Force*** (Restricted): Hard delete is forbidden without approval
