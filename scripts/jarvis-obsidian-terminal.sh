#!/bin/zsh
set -euo pipefail

PROJECT_DIR="/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
VAULT_DIR="${JARVIS_OBSIDIAN_VAULT:-$PROJECT_DIR/data/obsidian-vault}"
NOTES_DIR="$VAULT_DIR/Inbox"
LOG_FILE="$VAULT_DIR/jarvis-terminal.log"
LANGUAGE="${JARVIS_WHISPER_LANGUAGE:-ro}"
MODEL="${JARVIS_WHISPER_MODEL:-base}"

mkdir -p "$NOTES_DIR"
mkdir -p "$VAULT_DIR"
touch "$LOG_FILE"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/jarvis-obsidian-terminal.sh --text "Creeaza notita: Idei Trade AI"
  ./scripts/jarvis-obsidian-terminal.sh --audio /path/to/input.wav
  ./scripts/jarvis-obsidian-terminal.sh --listen /path/to/input.wav

Environment:
  JARVIS_OBSIDIAN_VAULT   Override vault path
  JARVIS_WHISPER_LANGUAGE Whisper language, default: ro
  JARVIS_WHISPER_MODEL    Whisper model, default: base

Supported commands:
  Creeaza notita: TITLU
  Cauta notita: TEXT
EOF
}

log_event() {
  local level="$1"
  local message="$2"
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$level" "$message" >> "$LOG_FILE"
}

normalize_title() {
  local raw="$1"
  printf '%s' "$raw" \
    | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null || printf '%s' "$raw"
}

safe_filename() {
  local raw="$1"
  local ascii
  ascii="$(normalize_title "$raw")"
  ascii="${ascii//[^A-Za-z0-9._ -]/-}"
  ascii="${ascii## }"
  ascii="${ascii%% }"
  ascii="${ascii//  / }"
  if [[ -z "$ascii" ]]; then
    ascii="Untitled"
  fi
  printf '%s' "$ascii"
}

transcribe_audio() {
  local audio_path="$1"
  if [[ ! -f "$audio_path" ]]; then
    echo "Audio file not found: $audio_path" >&2
    exit 1
  fi

  if command -v whisper-cli >/dev/null 2>&1; then
    whisper-cli --model "$MODEL" --language "$LANGUAGE" --output_format txt "$audio_path"
    return
  fi

  if command -v whisper >/dev/null 2>&1; then
    local out_dir
    out_dir="$(mktemp -d)"
    whisper "$audio_path" --model "$MODEL" --language "$LANGUAGE" --output_format txt --output_dir "$out_dir" >/dev/null
    cat "$out_dir/$(basename "${audio_path%.*}").txt"
    rm -rf "$out_dir"
    return
  fi

  echo "No Whisper CLI found. Install 'whisper-cli' or 'whisper', or use --text for testing." >&2
  exit 1
}

create_note() {
  local title="$1"
  local safe_title
  safe_title="$(safe_filename "$title")"
  local file_path="$NOTES_DIR/$safe_title.md"

  {
    printf '# %s\n\n' "$title"
    printf '_Created by JARVIS Terminal on %s._\n' "$(date '+%Y-%m-%d %H:%M')"
  } > "$file_path"

  log_event "CREATE" "Created note '$title' at $file_path"
  echo "Notita a fost creata: $file_path"
}

search_notes() {
  local query="$1"
  log_event "SEARCH" "Searching notes for '$query'"
  if ! rg -n --hidden --glob '*.md' "$query" "$VAULT_DIR"; then
    echo "Nu am gasit notite pentru: $query"
  fi
}

handle_command() {
  local command_text="$1"
  local trimmed
  trimmed="$(printf '%s' "$command_text" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"

  if [[ -z "$trimmed" ]]; then
    echo "Comanda goala."
    return 1
  fi

  echo "Comanda receptionata: $trimmed"
  log_event "INPUT" "$trimmed"

  if [[ "$trimmed" == "Creeaza notita:"* ]] || [[ "$trimmed" == "Creează notiță:"* ]]; then
    local title="${trimmed#Creeaza notita: }"
    title="${title#Creează notiță: }"
    create_note "$title"
    return 0
  fi

  if [[ "$trimmed" == "Cauta notita:"* ]] || [[ "$trimmed" == "Cauta notita:"* ]] || [[ "$trimmed" == "Caută notița:"* ]]; then
    local query="${trimmed#Cauta notita: }"
    query="${query#Cauta notita: }"
    query="${query#Caută notița: }"
    search_notes "$query"
    return 0
  fi

  echo "Comanda necunoscuta. Foloseste 'Creeaza notita:' sau 'Cauta notita:'."
  return 1
}

MODE=""
VALUE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --text)
      MODE="text"
      VALUE="${2:-}"
      shift 2
      ;;
    --audio|--listen)
      MODE="audio"
      VALUE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$MODE" || -z "$VALUE" ]]; then
  usage
  exit 1
fi

if [[ "$MODE" == "text" ]]; then
  handle_command "$VALUE"
else
  echo "Ascult comanda vocala din: $VALUE"
  handle_command "$(transcribe_audio "$VALUE")"
fi
