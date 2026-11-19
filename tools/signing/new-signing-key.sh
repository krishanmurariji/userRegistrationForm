#!/usr/bin/env bash
# Creates the Small Mart Android signing key on macOS or Linux and, if the GitHub CLI is signed in, saves the four
# secrets the Release workflow needs. Run once from the repository folder:  bash tools/signing/new-signing-key.sh
# KEEP THE .jks FILE AND THE PASSWORD SAFE FOR EVER.
set -euo pipefail
REPO=${REPO:-krishanmurariji/SmallMart}
ALIAS=smallmart
OUT_DIR=${OUT_DIR:-$HOME/SmallMart-Signing}
JKS=$OUT_DIR/smallmart-upload.jks
command -v keytool >/dev/null || { echo "keytool not found: install a Java JDK (for example Temurin 21) first."; exit 1; }
mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
[ -e "$JKS" ] && { echo "$JKS already exists. Use the key you have; never make a second one for the same app."; exit 1; }
while :; do
  read -rsp "Password for the signing key (8+ characters): " P1; echo
  read -rsp "Same password again: " P2; echo
  [ "$P1" = "$P2" ] && [ ${#P1} -ge 8 ] && break
  echo "The passwords differ or are too short. Try again."
done
read -rp "Your name or business name: " NAME; NAME=${NAME:-Small Mart}
keytool -genkeypair -v -keystore "$JKS" -storetype PKCS12 -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$P1" -keypass "$P1" -dname "CN=${NAME//[,=+]/ }, O=Small Mart, L=Jaipur, ST=Rajasthan, C=IN"
echo; echo "Key created: $JKS"; echo "Fingerprints (not secret):"
keytool -list -v -keystore "$JKS" -alias "$ALIAS" -storepass "$P1" | grep -E 'SHA1:|SHA256:'
B64=$(base64 < "$JKS" | tr -d '\n')
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  printf '%s' "$B64"   | gh secret set ANDROID_KEYSTORE_BASE64   --repo "$REPO"
  printf '%s' "$P1"    | gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$REPO"
  printf '%s' "$ALIAS" | gh secret set ANDROID_KEY_ALIAS         --repo "$REPO"
  printf '%s' "$P1"    | gh secret set ANDROID_KEY_PASSWORD      --repo "$REPO"
  echo "Saved the 4 secrets to $REPO."
else
  printf '%s' "$B64" > "$OUT_DIR/keystore-base64.txt"
  echo "Add 4 secrets at https://github.com/$REPO/settings/secrets/actions :"
  echo "  ANDROID_KEYSTORE_BASE64 = contents of $OUT_DIR/keystore-base64.txt (delete the file afterwards)"
  echo "  ANDROID_KEYSTORE_PASSWORD and ANDROID_KEY_PASSWORD = your password, ANDROID_KEY_ALIAS = $ALIAS"
fi
echo "Back up $JKS and the password now. Then run the Release workflow."
