#!/bin/sh
# Install or update FlexTile. Pass --no-launcher to leave KRunner alone.
exec python3 "$(dirname "$0")/tools/setup.py" install "$@"
