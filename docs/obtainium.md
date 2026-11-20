# Set up YipDen in Obtainium

YipDen testing build **902** (`0.9.0`) is now available on KJS Apps. It uses the
existing `com.yipden.app` package and signing certificate. Keep your installed app
and its data; make a YipDen backup before updating.

## Add or change the YipDen entry

Open Obtainium and add an app with the source below. If Obtainium already tracks
YipDen, edit that entry instead, keeping one entry for `com.yipden.app`.

| Setting                        | Value                                                         |
| ------------------------------ | ------------------------------------------------------------- |
| Source URL                     | `https://kjs.kjnet.us/yipden/builds/`                         |
| Source / Override Source       | HTML                                                          |
| App ID, if requested           | `com.yipden.app`                                              |
| App name, if needed            | YipDen                                                        |
| Version Extraction             | `yipden-b([0-9]+)\.apk`                                       |
| Match Group                    | `1`                                                           |
| Version Extract Whole Page     | Off                                                           |
| Use Version Code as OS Version | On                                                            |
| Track Only                     | Off                                                           |
| User-Agent request header      | Keep Obtainium's default browser header                       |
| Authorization request header   | The existing private KJS Builds header, entered on your phone |

Use the regular expression exactly as shown, with a single backslash before the
dot and without Markdown backticks. It extracts **902** from `yipden-b902.apk`.
Use the channel page above, not its history page or a direct APK URL.

Builds uses the same dedicated authentication as your working Chat/Yip Realms
Builds sources. Reuse that private Authorization header in YipDen's additional
Request Headers. Retain the default User-Agent header too. Browser login alone
does not authenticate Obtainium's source and APK requests.

If you need to recreate the header, run this yourself in a private local terminal:

```sh
python3 -c 'import base64,getpass; print("Authorization: Basic "+base64.b64encode(("apk-builds:"+getpass.getpass("Builds password: ")).encode()).decode())'
```

Copy the resulting entire line into Obtainium's additional Request Headers.
The result is password-equivalent: keep it on your device and out of source,
URLs and chat. No GitHub token is required.

## Install build 902 and confirm the baseline

1. Save the entry and refresh it. Latest should be **902**, not `0.9.0`.
   Installed should reflect the real Android versionCode; older numbered debug
   APKs used **900** despite About showing a smaller filename counter.
2. Tap Update. If Android requests permission to install from Obtainium, allow it
   and complete the installation over the existing YipDen app. Do not uninstall.
3. Open YipDen and check About: version `0.9.0`, debug build **902**. Confirm your
   followed people, settings, folders, Library and existing data are accessible.
4. Refresh Obtainium again. Confirm **Installed 902 / Latest 902** and report
   those values plus whether your followed people and settings survived.

If an install reports a certificate mismatch, stop and report the error. Do not
uninstall or clear data. If the app is installed but Obtainium shows a semantic
version or an unexpected Installed value, check the version settings above and
refresh; never manually change Installed to simulate a successful update.

Once this baseline is confirmed, we can build and separately approve a genuinely
newer APK (at least **903**) and verify the real Obtainium update with the same data
checks. That test is still pending; publishing 902 alone does not establish it.

## Releases and the old download host

Stay on Builds for testing. `https://kjs.kjnet.us/yipden/releases/` is public HTTPS
but contains no APK. It must have **no Authorization header** when eventually used.
This debug build cannot be promoted to Releases; compatible non-debuggable signing
and explicit stable approval remain separate work.

The old download host is still running. Historical download recovery was closed at
the owner's request. Retiring the host still requires the confirmed newer phone
update and a separate final inventory of remaining users/apps and URLs.

For publication records, artifact checksums and operator commands, see
[App updates](app-updates.md). Setting references:
[Obtainium HTML sources](https://wiki.obtainium.imranr.dev/sources/#html) and
[version-code detection](https://wiki.obtainium.imranr.dev/app_tracking/#version-detection).
