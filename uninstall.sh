#!/bin/sh
# Remove FlexTile and give your previous shortcuts back.
exec python3 "$(dirname "$0")/tools/setup.py" uninstall "$@"
