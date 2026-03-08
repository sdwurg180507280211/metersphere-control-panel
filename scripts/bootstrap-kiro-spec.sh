#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACK_DIR="$(cd "$SCRIPT_DIR/../templates/kiro-spec-bootstrap" && pwd)"

TARGET_DIR=""
PROJECT_NAME=""
INSTALL_SKILL="false"
INSTALL_GLOBAL_AGENTS="false"
FORCE="false"

usage() {
  cat <<USAGE
Usage:
  scripts/bootstrap-kiro-spec.sh --target-dir <repo-path> [options]

Options:
  --target-dir <path>         Target repository path
  --project-name <name>       Project name written into repo AGENTS template
  --install-skill             Copy the portable kiro-specs skill into ~/.codex/skills/
  --install-global-agents     Install ~/AGENTS.md if absent, otherwise create ~/AGENTS.kiro-spec.snippet.md
  --force                     Overwrite existing bootstrap-managed files where applicable
  -h, --help                  Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-dir)
      TARGET_DIR="$2"
      shift 2
      ;;
    --project-name)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --install-skill)
      INSTALL_SKILL="true"
      shift
      ;;
    --install-global-agents)
      INSTALL_GLOBAL_AGENTS="true"
      shift
      ;;
    --force)
      FORCE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET_DIR" ]]; then
  echo "Error: --target-dir is required" >&2
  usage >&2
  exit 1
fi

TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd || true)"
if [[ -z "$TARGET_DIR" ]]; then
  echo "Error: target directory does not exist" >&2
  exit 1
fi

if [[ -z "$PROJECT_NAME" ]]; then
  PROJECT_NAME="$(basename "$TARGET_DIR")"
fi

copy_file() {
  local src="$1"
  local dest="$2"

  if [[ -e "$dest" && "$FORCE" != "true" ]]; then
    echo "Skip existing: $dest"
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "Wrote: $dest"
}

copy_template_with_project_name() {
  local src="$1"
  local dest="$2"

  if [[ -e "$dest" && "$FORCE" != "true" ]]; then
    echo "Skip existing: $dest"
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  sed "s/__PROJECT_NAME__/${PROJECT_NAME//\//\\/}/g" "$src" > "$dest"
  echo "Wrote: $dest"
}

echo "Bootstrapping Kiro Spec pack into: $TARGET_DIR"

mkdir -p "$TARGET_DIR/.kiro/specs/_templates/feature"
mkdir -p "$TARGET_DIR/.kiro/specs/_templates/bugfix"
mkdir -p "$TARGET_DIR/docs"

copy_file "$PACK_DIR/specs/feature/requirements.md.template" "$TARGET_DIR/.kiro/specs/_templates/feature/requirements.md.template"
copy_file "$PACK_DIR/specs/feature/design.md.template" "$TARGET_DIR/.kiro/specs/_templates/feature/design.md.template"
copy_file "$PACK_DIR/specs/feature/tasks.md.template" "$TARGET_DIR/.kiro/specs/_templates/feature/tasks.md.template"
copy_file "$PACK_DIR/specs/bugfix/bugfix.md.template" "$TARGET_DIR/.kiro/specs/_templates/bugfix/bugfix.md.template"
copy_file "$PACK_DIR/specs/bugfix/design.md.template" "$TARGET_DIR/.kiro/specs/_templates/bugfix/design.md.template"
copy_file "$PACK_DIR/specs/bugfix/tasks.md.template" "$TARGET_DIR/.kiro/specs/_templates/bugfix/tasks.md.template"
copy_file "$PACK_DIR/README.md" "$TARGET_DIR/docs/kiro-spec-bootstrap-pack.md"

if [[ -f "$TARGET_DIR/AGENTS.md" ]]; then
  copy_template_with_project_name "$PACK_DIR/repo/AGENTS.md.template" "$TARGET_DIR/AGENTS.kiro-spec.template.md"
else
  copy_template_with_project_name "$PACK_DIR/repo/AGENTS.md.template" "$TARGET_DIR/AGENTS.md"
fi

if [[ "$INSTALL_GLOBAL_AGENTS" == "true" ]]; then
  if [[ -f "$HOME/AGENTS.md" ]]; then
    copy_file "$PACK_DIR/global/AGENTS.md" "$HOME/AGENTS.kiro-spec.snippet.md"
  else
    copy_file "$PACK_DIR/global/AGENTS.md" "$HOME/AGENTS.md"
  fi
fi

if [[ "$INSTALL_SKILL" == "true" ]]; then
  SKILL_TARGET="$HOME/.codex/skills/kiro-specs"
  mkdir -p "$HOME/.codex/skills"
  if [[ -e "$SKILL_TARGET" && "$FORCE" != "true" ]]; then
    echo "Skip existing skill: $SKILL_TARGET"
  else
    rm -rf "$SKILL_TARGET"
    mkdir -p "$SKILL_TARGET"
    cp -R "$PACK_DIR/skill/kiro-specs/"* "$SKILL_TARGET/"
    echo "Installed skill: $SKILL_TARGET"
  fi
fi

echo
 echo "Next steps:"
echo "1. Fill in repo-specific sections in $TARGET_DIR/AGENTS.md or AGENTS.kiro-spec.template.md"
echo "2. Pick a real feature or bugfix and copy templates from $TARGET_DIR/.kiro/specs/_templates/"
echo "3. Turn an existing plan, design doc, PRFAQ, or bug report into a real spec"
