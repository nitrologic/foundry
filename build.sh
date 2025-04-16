#!/bin/bash

#deno compile --allow-run --allow-env --allow-net --allow-read --allow-write foundry.js

DIR="rc2"
DEPENDENCIES=("foundry.js" "README.md" "LICENSE.txt" "foundry.md" "welcome.txt" "accounts.json" "rates.json" "forge/readme.txt")

if [ ! -f "foundry.js" ]; then
	echo "Error: foundry.js not found in the current directory."
	exit 1
fi

deno cache foundry.js
if [ $? -ne 0 ]; then
	echo "Error: Failed to cache dependencies."
	exit 1
fi

deno compile --allow-run --allow-env --allow-net --allow-read --allow-write --output "$DIR/foundry" foundry.js
if [ $? -ne 0 ]; then
	echo "Error: Failed to compile foundry.js."
	exit 1
fi

if [ ! -f "$DIR/foundry" ]; then
	echo "Error: foundry executable not created by compiler."
	exit 1
fi

MISSING=0
for file in "${DEPENDENCIES[@]}"; do
	if [ -f "$file" ]; then
		cp --parents "$file" "$DIR/" && echo "  Copied $file" || { echo "  Failed to copy $file"; }
	else
		echo "  $file not found"
		MISSING=$((MISSING + 1))
	fi
done

if [ $MISSING -gt 0 ]; then
	echo "Warning: $MISSING file(s) were missing or failed to copy."
fi

echo "Foundry $DIR build completed successfully."

# upx --best "$DIR/foundry"

exit 0
