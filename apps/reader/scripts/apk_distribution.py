"""Project commands delegating to the complete existing KJS publisher/registry."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from android_build import PUBLISHER, READER, TOOLS, inspect

CONFIG = PUBLISHER.with_name("apps.json")
ROOT = READER.parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("inspect")
    check.add_argument("--file", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--file", required=True)
    prepare.add_argument("--notes", required=True)
    publish = commands.add_parser("publish")
    publish.add_argument("--bundle", required=True)
    publish.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    config = json.loads(CONFIG.read_text())
    if not {"chat", "yip-realms", "yipden"} <= config["apps"].keys():
        sys.exit("Use the complete shared registry, including Chat, Yip Realms and YipDen.")
    base = ["python3", str(PUBLISHER), "--config", str(CONFIG)]
    if args.command == "inspect":
        print(json.dumps(inspect(Path(args.file).resolve()), indent=2))
    elif args.command == "prepare":
        subprocess.run(["git", "diff", "--exit-code", "--quiet", "HEAD"], cwd=ROOT, check=True)
        metadata = inspect(Path(args.file).resolve())
        provenance = json.loads(Path(args.file).resolve().with_suffix(".json").read_text())
        if provenance.pop("dirty") or any(provenance.get(k) != v for k, v in metadata.items()):
            sys.exit("Build provenance is dirty or differs from the verified artifact; rebuild clean source.")
        commit = provenance["commit"]
        output = ROOT / f"build/apk-distribution/yipden-b{metadata['version_code']}.zip"
        subprocess.run(base + ["prepare", "--app", "yipden", "--file", str(Path(args.file).resolve()),
                              "--notes", str(Path(args.notes).resolve()), "--commit", commit,
                              "--output", str(output), "--aapt", str(TOOLS / "aapt"),
                              "--apksigner", str(TOOLS / "apksigner")], check=True)
        print(f"Private bundle: {output}\nSource: {commit}")
    else:
        if not args.execute:
            sys.exit("Publication needs approval of the exact artifact, then --execute.")
        subprocess.run(base + ["upload", "--bundle", str(Path(args.bundle).resolve()),
                              "--host", "xtreemmak@192.168.10.149", "--root", "/var/www/kjs-apps",
                              "--execute"], check=True)


if __name__ == "__main__":
    main()
