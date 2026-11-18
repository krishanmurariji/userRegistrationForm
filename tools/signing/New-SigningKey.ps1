<#
.SYNOPSIS
  Creates the Small Mart Android signing key and (optionally) saves it as GitHub secrets.

.DESCRIPTION
  Run this once, on your own Windows PC, from the repository folder:

      powershell -ExecutionPolicy Bypass -File tools\signing\New-SigningKey.ps1

  It creates smallmart-upload.jks in your Documents\SmallMart-Signing folder (outside the repository, so it can never
  be committed), prints its fingerprints, and, if the GitHub CLI (gh) is installed and signed in, stores the four
  secrets the Release workflow needs. Otherwise it tells you what to paste where.

  KEEP THE .jks FILE AND THE PASSWORD SAFE FOR EVER. Samsung Galaxy Store and any APK you hand out are tied to this key.
#>
param(
  [string]$Repo = 'krishanmurariji/userRegistrationForm',
  [string]$Alias = 'smallmart',
  [string]$OutDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'SmallMart-Signing')
)
$ErrorActionPreference = 'Stop'

function Find-Keytool {
  $onPath = Get-Command keytool -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $candidates = @(
    "$env:ProgramFiles\Android\Android Studio\jbr\bin\keytool.exe",
    "$env:ProgramFiles\Android\Android Studio\jre\bin\keytool.exe",
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr\bin\keytool.exe"
  )
  if ($env:JAVA_HOME) { $candidates = @("$env:JAVA_HOME\bin\keytool.exe") + $candidates }
  $candidates += Get-ChildItem "$env:ProgramFiles\Java", "$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Microsoft" -Recurse -Filter keytool.exe -ErrorAction SilentlyContinue | ForEach-Object FullName
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  throw "keytool was not found. Install Android Studio or a Java JDK (for example: winget install EclipseAdoptium.Temurin.21.JDK), then run this again."
}

$keytool = Find-Keytool
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$jks = Join-Path $OutDir 'smallmart-upload.jks'
if (Test-Path $jks) { throw "$jks already exists. Use the key you have; never make a second one for the same app." }

Write-Host "`nChoose a password for the signing key (at least 8 characters). Write it down somewhere safe." -ForegroundColor Yellow
do {
  $p1 = Read-Host 'Password' -AsSecureString
  $p2 = Read-Host 'Same password again' -AsSecureString
  $plain1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
  $plain2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
  $ok = ($plain1 -eq $plain2) -and $plain1.Length -ge 8 -and $plain1 -notmatch '"'
  if (-not $ok) { Write-Host 'The passwords differ, are shorter than 8 characters, or contain a double quote. Try again.' -ForegroundColor Red }
} until ($ok)

$name = Read-Host 'Your name or business name (shown inside the certificate)'
if (-not $name) { $name = 'Small Mart' }
$dname = "CN=$($name -replace '[,=+]', ' '), O=Small Mart, L=Jaipur, ST=Rajasthan, C=IN"

# PKCS12 keystores use one password for the store and the key.
& $keytool -genkeypair -v -keystore $jks -storetype PKCS12 -alias $Alias -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $plain1 -keypass $plain1 -dname $dname
if ($LASTEXITCODE -ne 0) { throw 'keytool failed.' }

Write-Host "`nKey created: $jks" -ForegroundColor Green
Write-Host 'Fingerprints (Firebase and Google sign-in ask for these later; they are not secret):'
& $keytool -list -v -keystore $jks -alias $Alias -storepass $plain1 | Select-String 'SHA1:|SHA256:'

$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($jks))
$secrets = [ordered]@{
  ANDROID_KEYSTORE_BASE64   = $base64
  ANDROID_KEYSTORE_PASSWORD = $plain1
  ANDROID_KEY_ALIAS         = $Alias
  ANDROID_KEY_PASSWORD      = $plain1
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh -and (& gh auth status 2>$null; $LASTEXITCODE -eq 0)) {
  foreach ($s in $secrets.GetEnumerator()) {
    $s.Value | & gh secret set $s.Key --repo $Repo
    if ($LASTEXITCODE -ne 0) { throw "Could not save $($s.Key)." }
    Write-Host "Saved secret $($s.Key)" -ForegroundColor Green
  }
} else {
  $txt = Join-Path $OutDir 'keystore-base64.txt'
  Set-Content -Path $txt -Value $base64 -NoNewline
  Write-Host "`nThe GitHub CLI is not set up, so add these 4 secrets by hand:" -ForegroundColor Yellow
  Write-Host "  https://github.com/$Repo/settings/secrets/actions  ->  New repository secret"
  Write-Host "  ANDROID_KEYSTORE_BASE64   = the whole contents of $txt"
  Write-Host "  ANDROID_KEYSTORE_PASSWORD = the password you just chose"
  Write-Host "  ANDROID_KEY_ALIAS         = $Alias"
  Write-Host "  ANDROID_KEY_PASSWORD      = the same password"
  Write-Host "Delete $txt once the secret is saved." -ForegroundColor Yellow
}

Write-Host "`nNow back up $jks and the password (for example to Google Drive and a USB stick)." -ForegroundColor Yellow
Write-Host 'Then run the Release workflow; it will build a signed APK and a Play Store .aab.'
