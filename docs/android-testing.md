# Android: toolchain and testing

YipDen is an Android app built with Capacitor, developed on a headless Linux machine. This
document covers what is installed, how the day to day loop works, and how to get a build onto
a real phone from a machine with no screen.

## The short version

**Two loops, and you will spend most of your time in the first one.**

1. **Browser loop.** `pnpm dev` in `apps/reader`, viewed at 390x844 in a browser's device
   mode. Every screen, every animation, every gesture and every piece of styling is web
   technology and behaves the same in the WebView. This is where almost all the work happens.
2. **Device loop.** Build an APK, install it on a real phone, and check the things only the
   device can tell you: native HTTP and CORS, the Media Session on the lock screen, the
   Android back button, safe area insets, the status bar, and whether the motion actually
   holds 60fps on real hardware.

There is deliberately **no emulator**. This machine is a KVM guest without `/dev/kvm`, so an
emulator would run in software rendering, which is the worst possible surface for judging a
product whose motion is part of the specification. A real phone is both faster to use and more
honest.

## What is installed, and where

Everything lives under your home directory. Nothing was installed system wide and no `sudo`
was used.

| Tool                     | Version   | Path                                 |
| ------------------------ | --------- | ------------------------------------ |
| Temurin JDK              | 21.0.12.1 | `~/.local/opt/jdk-21.0.12.1+1`       |
| Android SDK command line | 19.0      | `~/Android/sdk/cmdline-tools/latest` |
| Android SDK Platform     | 36        | `~/Android/sdk/platforms/android-36` |
| Android SDK Build Tools  | 36.1.0    | `~/Android/sdk/build-tools/36.1.0`   |
| Platform Tools (adb)     | 37.0.1    | `~/Android/sdk/platform-tools`       |

Capacitor 8 wants Node 22 or newer and JDK 17 or newer; 21 is the long term support release the
Android Gradle Plugin is happiest on. The SDK levels match what Capacitor 8 generates:
`compileSdk` and `targetSdk` 36, `minSdk` 26 for the Android 8 floor this app targets.

### Environment

Add this to your shell profile, or source it before an Android build:

```bash
export JAVA_HOME="$HOME/.local/opt/jdk-21.0.12.1+1"
export ANDROID_HOME="$HOME/Android/sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Check it took:

```bash
java -version      # openjdk version "21.0.12.1"
adb --version      # Android Debug Bridge version 1.0.41
sdkmanager --list_installed
```

### Keeping the SDK current

```bash
sdkmanager --update
sdkmanager --list | grep "platforms;android-"
```

Raising `compileSdk` is a deliberate change, not routine maintenance. It goes in
`apps/reader/android/variables.gradle` and in this table.

## The browser loop

```bash
cd apps/reader
pnpm dev
```

Open the dev server, switch the browser to device mode, and set the viewport to **390x844**.
That is the size the reference prototype at `docs/reference/yipden-prototype.html` is drawn
for, and comparing your build against it at that exact size, in both themes, is part of
finishing a screen.

Live feeds will hit CORS in a plain browser, which is expected and is what the dev only proxy
is for. See [architecture.md](architecture.md) for why the web build has two lanes.

## The device loop

### One time, on the phone

1. Settings, About phone, tap **Build number** seven times to unlock Developer options.
2. Settings, System, Developer options, turn on **Wireless debugging**.
3. Get the phone onto a network that can reach this machine. This machine sits on a private
   LAN (`192.168.10.0/24`); when the phone is not physically on that LAN, a VPN back into it
   works exactly the same as being on the Wi-Fi, as long as the VPN routes phone-to-host
   traffic rather than only phone-to-gateway. Confirm it actually does before pairing:

   ```bash
   ping -c 2 <phone-vpn-ip>      # from this machine, once the phone's VPN is up
   ```

   If that does not answer, the VPN is client-isolated (routes to the gateway, not to other
   hosts on the LAN) and wireless debugging will not reach the phone no matter how the pairing
   step is run. Fall back to [manual APK transfer](#if-the-phone-is-not-on-this-machines-network)
   instead of chasing pairing errors.

### One time, on this machine

Pair with the phone. Wireless debugging shows a **Pair device with pairing code** screen with
its own port, which is not the same port the connection itself uses.

```bash
adb pair <phone-ip>:<pairing-port>     # enter the six digit code it shows
adb connect <phone-ip>:<debug-port>    # the port on the main Wireless debugging screen
adb devices                            # your phone should be listed as "device"
```

Use the phone's VPN-assigned IP for `<phone-ip>` when it is reaching this machine that way,
the same as any other IP it might have. The pairing survives reboots; the connection does
not, so `adb connect` is the command you will repeat, and again whenever the phone's IP
changes (which a VPN reconnect will do).

### Every build

```bash
cd apps/reader
pnpm build                 # SvelteKit static build
pnpm cap:sync              # copy the build into the Android project
pnpm android:install       # assemble the debug APK and install it on the connected phone
```

The APK lands at `apps/reader/android/app/build/outputs/apk/debug/app-debug.apk`.

Watch the app's own logs:

```bash
adb logcat --pid=$(adb shell pidof com.yipden.app)
```

### Live reload: install once, iterate without rebuilding

Rebuilding and reinstalling for every change is slow, and almost none of the app is
Android-specific: a screen, a style or a bug fix is a web change first. Live reload points the
installed app's WebView directly at `pnpm dev`'s own dev server instead of the bundled files,
so the moment Vite rebuilds something, the device shows it, the same as a browser tab open to
the same URL. No further `cap sync`, no further install, for as long as the app stays open.

```bash
cd apps/reader
pnpm dev --host 0.0.0.0                               # leave this running; --host matters, see below
CAP_LIVE_RELOAD_URL=http://<this-machine-ip>:5173 \
  pnpm android:live                                   # builds once, installs, done
```

**`--host` is not optional here.** Plain `pnpm dev` binds Vite's dev server to `localhost`
only, which answers `curl` or a browser running on this same machine perfectly well, and
answers nothing at all from anywhere else, phone included. `--host 0.0.0.0` binds every
network interface this machine has instead, which is what makes `<this-machine-ip>:5173`
reachable from outside it in the first place. Without it, the app opens to a blank "page not
available" WebView with nothing obviously wrong in Capacitor's own logs, since as far as
Capacitor is concerned it asked for a URL like any other; the connection just never lands.

Open the app on the phone; it is now showing whatever `pnpm dev` is serving, live. Use the
phone's own reachable address for this machine, the same one wireless debugging already
proved works (the VPN IP, when the phone is reaching it that way), and the port `pnpm dev`
actually printed, since it moves to the next free one if `5173` is already taken.

Two things this changes on purpose, only for a debug build, and are exactly why
`CAP_LIVE_RELOAD_URL` is never set for `android:apk` or `android:install`:

- The WebView's origin becomes the plain `http://` dev server instead of `https://localhost`,
  which needs `android/app/src/debug/res/xml/network_security_config.xml`, a debug-only
  override of the release-hardened one in `src/main` that refuses cleartext traffic outright
  (see DECISIONS.md). A release build has no such override and stays refused.
- Every native-only check (the back button, lock screen controls, the foreground service) is
  unaffected: those live in the native shell live reload never touches. Only the web layer
  is served live.

Going back to a normal build needs nothing more than running `pnpm android:install` again
without the environment variable set; `capacitor.config.ts` only adds `server.url` when it
sees one.

### If the phone is not on this machine's network

The pairing route needs a route between the two. When there is not one, build here and move
the file:

```bash
cd apps/reader && pnpm android:apk
# then copy apps/reader/android/app/build/outputs/apk/debug/app-debug.apk
# to the phone by whatever path you already use, and open it there
```

Android will ask permission to install from that source the first time. This is a debug build
signed with the local debug key, which is fine for testing and is not something to publish.

### Debugging the WebView from a desktop

The app's WebView is inspectable from Chrome DevTools on a machine with a screen, at
`chrome://inspect/#devices`, with the phone connected to **that** machine over USB or wireless
debugging. This is the only part of the loop that wants a desktop, and it is optional: the
browser loop covers the same ground for everything that is not native.

A second machine with a screen, e.g. one running Android Studio, only needs USB debugging
turned on and Chrome installed; Android Studio itself is not required for this. It is useful
for exactly two things this headless machine cannot do: `chrome://inspect` with a mouse, and
Android Studio's own Logcat view if `adb logcat` in a terminal gets noisy. The APK still gets
built here and copied over, or installed straight from this machine onto the same phone once
it is also paired here; the two are independent, and neither machine needs to see the other,
only the phone.

If a physical phone stops being available at some point, that second machine's own hardware
accelerated emulator (assuming it has the virtualization this KVM guest lacks) is a reasonable
stand-in for anything that is not motion-sensitive; still confirm any 60fps judgment on real
hardware before trusting it. Live reload (above) works the same way against an emulator as it
does against a real phone, since it only needs the emulator to reach this machine's dev server,
which a typical emulator's own networking already allows without any VPN involved at all.

## What to check on the device, specifically

The browser cannot answer these, so they are the reason the device loop exists:

- **Feeds actually load.** In the browser they are blocked by CORS; on the device Capacitor's
  native HTTP client makes the request, so this is the first real test of `packages/feeds`.
- **Lock screen controls.** Media Session metadata, artwork, and the play, pause and seek
  handlers, with the screen off.
- **Background playback stops.** This is expected in v0.9 and is documented, not a bug. See
  DECISIONS.md.
- **The hardware and gesture back button** behaves like the in-app back.
- **Safe areas.** Status bar, navigation bar and any display cutout, on a real screen.
- **Motion at 60fps.** Feeds' card stack and Discover's hero are the two places where a
  mid-range phone will tell you the truth.
- **Offline.** Turn on airplane mode and confirm Discover still renders from cache.

## Troubleshooting

**`adb devices` shows nothing after `adb connect`.** Wireless debugging's port changes when the
phone reconnects to the network. Reread it on the phone and connect again.

**Gradle cannot find a JDK.** `JAVA_HOME` is not exported in that shell. The Gradle wrapper
does not read your profile if you are running it from a script that clears the environment.

**`SDK location not found`.** `apps/reader/android/local.properties` is generated and
gitignored. Create it with `sdk.dir=/home/<you>/Android/sdk`, or export `ANDROID_HOME` before
building and let Capacitor write it.

**The build succeeds but the app shows a blank screen.** `pnpm build` was not rerun before
`cap sync`, so the Android project is holding an older copy of the web build.
