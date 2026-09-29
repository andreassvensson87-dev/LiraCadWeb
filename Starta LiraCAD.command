#!/bin/zsh
cd "${0:A:h}"
lira_node="$(command -v node)"
if [[ -z "$lira_node" ]]; then
  lira_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$lira_node" ]]; then
  print "Node.js saknas. Installera Node.js och kör npm start i denna mapp."
  read -k 1
  exit 1
fi
print "Öppna http://127.0.0.1:5174 i din webbläsare. Ctrl+C stoppar servern."
"$lira_node" server.mjs
