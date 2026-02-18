#!/usr/bin/env bash
# Claude Code status line script

input=$(cat)

user=$(whoami)
host=$(hostname -s)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
[ -z "$cwd" ] && cwd=$(pwd)

# Shorten home directory to ~
home_dir="$HOME"
short_cwd="${cwd/#$home_dir/\~}"

model=$(echo "$input" | jq -r '.model.display_name // empty')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Git branch (skip optional locks to avoid contention with other processes)
git_branch=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    git_branch=$(git -C "$cwd" -c core.useBuiltinFSMonitor=false symbolic-ref --short HEAD 2>/dev/null \
        || git -C "$cwd" -c core.useBuiltinFSMonitor=false rev-parse --short HEAD 2>/dev/null)
fi

# Build status line using ANSI colors via printf
# Colors: dim cyan for user@host, dim yellow for path, dim green for git, dim blue for model/context
printf "\033[2;36m%s@%s\033[0m" "$user" "$host"
printf " \033[2;33m%s\033[0m" "$short_cwd"

if [ -n "$git_branch" ]; then
    printf " \033[2;32m(%s)\033[0m" "$git_branch"
fi

if [ -n "$model" ]; then
    printf " \033[2;34m[%s" "$model"
    if [ -n "$used_pct" ]; then
        printf " | ctx: %s%%" "$used_pct"
    fi
    printf "]\033[0m"
fi
