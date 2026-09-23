#!/usr/bin/env bash
#
# merge_overwrite_branch_a_from_b.sh
#
# Merges and completely overwrites Branch/Commit A with the exact tree state of Branch/Commit B.
#
# Default Commit Message:
#   merge(<Target Commit Message> FROM <Source Commit Message>)
#

set -e

# Styling helpers
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

write_header() {
    echo -e "\n${CYAN}=== $1 ===${NC}"
}
write_success() {
    echo -e "${GREEN}✓ $1${NC}"
}
write_warn() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}
write_err() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. Verify Git Repository
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    write_err "Not inside a valid Git repository."
    exit 1
fi

# 2. Check for Dirty Working Directory
if [ -n "$(git status --porcelain)" ]; then
    write_warn "Working directory has uncommitted changes:"
    git status --short
    echo ""
    read -rp "Stash changes automatically before proceeding? (y/n/abort) [Default: y]: " STASH_CHOICE
    STASH_CHOICE=${STASH_CHOICE:-y}
    if [[ "$STASH_CHOICE" =~ ^[Yy]$ ]]; then
        git stash push -m "merge_overwrite_backup_$(date +%Y%m%d_%H%M%S)"
        write_success "Changes stashed safely."
    else
        write_err "Aborted. Please commit or stash your changes first."
        exit 1
    fi
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)

write_header "Git Merge Overwrite: Branch A from Branch B"
echo -e "${GRAY}Current location: $CURRENT_BRANCH${NC}"

# Display Available Branches and Recent Commits
echo -e "\n${CYAN}--- Local Branches ---${NC}"
git branch --format="  %(refname:short)"

echo -e "\n${CYAN}--- Recent Commits (Top 8) ---${NC}"
git log -n 8 --oneline --decorate

# 3. Resolve Target (Branch / Commit A)
TARGET="$1"
if [ -z "$TARGET" ]; then
    echo ""
    read -rp "Target branch / commit to overwrite (Branch A) [Default: $CURRENT_BRANCH]: " TARGET_INPUT
    TARGET="${TARGET_INPUT:-$CURRENT_BRANCH}"
fi

TARGET_HASH=$(git rev-parse --verify "$TARGET^{commit}" 2>/dev/null) || {
    write_err "Invalid target branch or commit: '$TARGET'"
    exit 1
}
TARGET_SHORT=$(git rev-parse --short "$TARGET_HASH")
TARGET_MSG=$(git log -1 --format=%s "$TARGET_HASH")

# 4. Resolve Source (Branch / Commit B)
SOURCE="$2"
if [ -z "$SOURCE" ]; then
    echo ""
    read -rp "Source branch / commit ID to copy state FROM (Branch B): " SOURCE_INPUT
    if [ -z "$SOURCE_INPUT" ]; then
        write_err "Source branch or commit ID cannot be empty."
        exit 1
    fi
    SOURCE="$SOURCE_INPUT"
fi

SOURCE_HASH=$(git rev-parse --verify "$SOURCE^{commit}" 2>/dev/null) || {
    write_err "Invalid source branch or commit: '$SOURCE'"
    exit 1
}
SOURCE_SHORT=$(git rev-parse --short "$SOURCE_HASH")
SOURCE_MSG=$(git log -1 --format=%s "$SOURCE_HASH")

if [ "$TARGET_HASH" = "$SOURCE_HASH" ]; then
    write_warn "Target ($TARGET_SHORT) and Source ($SOURCE_SHORT) point to the exact same commit!"
    read -rp "Do you still want to proceed creating an overwrite commit? (y/N): " PROCEED_SAME
    if [[ ! "$PROCEED_SAME" =~ ^[Yy]$ ]]; then
        echo -e "${GRAY}Operation cancelled.${NC}"
        exit 0
    fi
fi

# 5. Formulate Commit Message
DEFAULT_MSG="merge($TARGET_MSG FROM $SOURCE_MSG)"
CUSTOM_MSG="$3"

if [ -z "$CUSTOM_MSG" ]; then
    echo -e "\n${CYAN}--- Commit Message ---${NC}"
    echo -e "Default message: ${YELLOW}$DEFAULT_MSG${NC}"
    read -rp "Enter custom commit message (or press Enter to use default): " USER_MSG
    FINAL_MSG="${USER_MSG:-$DEFAULT_MSG}"
else
    FINAL_MSG="$CUSTOM_MSG"
fi

# 6. Summary Confirmation
write_header "Execution Plan"
echo -e "Target (A)       : $TARGET [$TARGET_SHORT] -> \"$TARGET_MSG\""
echo -e "Source (B)       : $SOURCE [$SOURCE_SHORT] -> \"$SOURCE_MSG\""
echo -e "Commit Message   : ${YELLOW}$FINAL_MSG${NC}"
echo -e "Action           : ${MAGENTA}Overwrite Target A completely with Source B tree using 2-parent merge${NC}"

echo ""
read -rp "Are you sure you want to execute overwrite merge? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "${GRAY}Aborted by user.${NC}"
    exit 0
fi

# 7. Execute Overwrite Merge
write_header "Executing Merge Overwrite"

# Switch to target branch if Target is a branch name and not currently on it
if git show-ref --verify --quiet "refs/heads/$TARGET"; then
    if [ "$CURRENT_BRANCH" != "$TARGET" ]; then
        echo -e "${GRAY}Checking out branch '$TARGET'...${NC}"
        git checkout "$TARGET"
    fi
fi

# Extract Source B tree
SOURCE_TREE=$(git rev-parse "$SOURCE_HASH^{tree}")
echo -e "${GRAY}Extracted tree from source: $SOURCE_TREE${NC}"

# Create merge commit with 2 parents: Target (p1) and Source (p2)
NEW_COMMIT_HASH=$(git commit-tree "$SOURCE_TREE" -p "$TARGET_HASH" -p "$SOURCE_HASH" -m "$FINAL_MSG")
echo -e "${GRAY}Created merge commit object: $NEW_COMMIT_HASH${NC}"

# Fast-forward / reset working tree to newly created commit
git reset --hard "$NEW_COMMIT_HASH"

write_success "Merge overwrite completed successfully!"
echo -e "\n${CYAN}Latest Commit Details:${NC}"
git log -1 --stat --decorate
