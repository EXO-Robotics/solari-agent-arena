#!/bin/zsh
set -e

PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  print "Node.js and npm are required. Install Node.js, then open this launcher again."
  read -k 1 "?Press any key to close."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  print "Installing simulator dependencies…"
  npm install
fi

print "Starting the Humanoid Open Field…"
print "Keep this Terminal window open while you use the simulator."
exec npm run open
