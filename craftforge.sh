#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

# Check for bundled executable first
if [ -f "$DIR/craftforge" ]; then
    echo "Starting CraftForge (standalone)..."
    "$DIR/craftforge"
    exit $?
fi

# Fall back to Python
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    echo "Error: Python 3.11+ is required."
    echo "Install it from https://python.org and try again."
    exit 1
fi

PYTHON=$(command -v python3 || command -v python)

echo "Installing dependencies..."
"$PYTHON" -m pip install -r "$DIR/requirements.txt" -q

echo "Starting CraftForge..."
echo "Open http://localhost:8080 in your browser."
echo "Press Ctrl+C to stop."
"$PYTHON" "$DIR/main.py"
