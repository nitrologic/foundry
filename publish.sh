#!/bin/bash

DIR="rc2"
DMG_NAME="foundry.dmg"

# Check for required environment variables
if [ -z "$DEVELOPER_ID" ] || [ -z "$APPLE_ID" ] || [ -z "$APPLE_TEAM_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
    echo "Error: Missing required environment variables. Set DEVELOPER_ID, APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_SPECIFIC_PASSWORD."
    exit 1
fi

if [ ! -d "$DIR" ]; then
    echo "Error: $DIR directory not found. Run build.sh first."
    exit 1
fi

if [ ! -f "$DIR/foundry" ]; then
    echo "Error: $DIR/foundry binary not found."
    exit 1
fi

echo "Signing $DIR/foundry..."
codesign --force --sign "$DEVELOPER_ID" "$DIR/foundry"
if [ $? -ne 0 ]; then
    echo "Error: Failed to sign $DIR/foundry."
    exit 1
fi

echo "Creating $DMG_NAME..."
hdiutil create -volname "Foundry" -srcfolder "$DIR" -ov -format UDBZ "$DMG_NAME"
if [ $? -ne 0 ]; then
    echo "Error: Failed to create $DMG_NAME."
    exit 1
fi

echo "Signing $DMG_NAME..."
codesign --force --sign "$DEVELOPER_ID" "$DMG_NAME"
if [ $? -ne 0 ]; then
    echo "Error: Failed to sign $DMG_NAME."
    exit 1
fi

echo "Notarizing $DMG_NAME..."
xcrun notarytool submit "$DMG_NAME" --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait
if [ $? -ne 0 ]; then
    echo "Error: Failed to notarize $DMG_NAME."
    exit 1
fi

echo "Stapling notarization ticket to $DMG_NAME..."
xcrun stapler staple "$DMG_NAME"
if [ $? -ne 0 ]; then
    echo "Error: Failed to staple notarization ticket."
    exit 1
fi

echo "Verifying $DMG_NAME..."
spctl -a -t open --context context:primary-signature -v "$DMG_NAME"
if [ $? -ne 0 ]; then
    echo "Warning: Gatekeeper verification failed."
fi

echo "$DMG_NAME created, signed, and notarized successfully."

exit 0
