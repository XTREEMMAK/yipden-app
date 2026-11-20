"""Serialize web/native builds and retain an APK named from its verified manifest."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from android_version import ANDROID, STATE, locked, reserve
from android_artifacts import backup_output, restore_missing

READER = ANDROID.parent
PUBLISHER = READER.parents[2] / "j2chat-app/tools/apk-distribution/publish_apk.py"
SDK = Path(os.environ.get("ANDROID_HOME", str(Path.home() / "Android/sdk")))
TOOLS = SDK / "build-tools/36.1.0"


def inspect(apk):
    return json.loads(subprocess.check_output([
        "python3", str(PUBLISHER), "inspect", "--file", str(apk),
        "--aapt", str(TOOLS / "aapt"), "--apksigner", str(TOOLS / "apksigner")
    ], text=True))


def source_state():
    return {
        "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=READER, text=True).strip(),
        "dirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=READER, text=True))
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--live", action="store_true")
    mode.add_argument("--install", action="store_true")
    args = parser.parse_args()
    live = args.live
    if not live and os.environ.get("CAP_LIVE_RELOAD_URL"):
        sys.exit("Unset CAP_LIVE_RELOAD_URL before building a downloadable APK.")
    with locked(name="pipeline.lock"):
        build_source = source_state()
        code, token = reserve(pending=True)
        output = ANDROID / "app/build/outputs/apk/debug"
        backup = READER.parents[1] / f"build/android-output-backups/before-{code}"
        # AGP cleans the whole output directory, including other apps served from it.
        # Finish the backup before running either Capacitor or Gradle.
        backup_output(output, backup)
        env = dict(os.environ, YIPDEN_DEBUG_BUILD=str(code))
        if not live:
            env.update(VITE_YIPDEN_DEBUG="1", VITE_YIPDEN_DIRECTORY_SEED="1")
        print(f"Reserved Android versionCode {code}; failed builds never reuse it.", flush=True)
        try:
            subprocess.run(["pnpm", "exec", "cap", "sync", "android"] if live else
                           ["pnpm", "cap:sync"], cwd=READER, env=env, check=True)
            env["YIPDEN_VERSION_RESERVATION"] = token
            subprocess.run(["./gradlew", "installDebug" if live else "assembleDebug"],
                           cwd=ANDROID, env=env, check=True)
            apk = ANDROID / "app/build/outputs/apk/debug/app-debug.apk"
            metadata = inspect(apk)
            if metadata["version_code"] != code or metadata["package"] != "com.yipden.app":
                sys.exit("APK metadata differs from this build reservation; do not distribute it.")
            registered = json.loads(PUBLISHER.with_name("apps.json").read_text())["apps"]["yipden"]
            if metadata["signers"] != registered["signers"]:
                sys.exit("APK certificate differs from the approved existing identity; do not install it.")
            target = READER.parents[1] / f"build/android-apks/yipden-b{metadata['version_code']}.apk"
            target.parent.mkdir(parents=True, exist_ok=True)
            # Never overwrite an artifact associated with a code, or prune historical APKs.
            with target.open("xb") as stream, apk.open("rb") as source:
                shutil.copyfileobj(source, stream)
            if inspect(target) != metadata:
                sys.exit("APK changed while copying; do not distribute it.")
            if source_state() != build_source:
                sys.exit("Source changed during the build; rebuild before preparation.")
            with target.with_suffix(".json").open("x") as stream:
                json.dump(dict(metadata, **build_source), stream, indent=2)
                stream.write("\n")
            print(json.dumps(dict(metadata, **build_source, file=str(target)), indent=2))
            if args.install:
                subprocess.run(["adb", "install", "-r", str(target)], check=True)
        finally:
            restore_missing(backup, output)
            (STATE / token).unlink(missing_ok=True)


if __name__ == "__main__":
    main()
