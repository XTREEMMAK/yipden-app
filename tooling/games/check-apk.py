"""Inspect the actual APK, including assets left behind by an earlier profile's cap sync."""
import json
import sys
import zipfile

apk, profile = sys.argv[1:]
if profile not in ("thin", "realm", "stray", "all"):
    raise ValueError("Unknown game profile")
selected = [] if profile == "thin" else ["realm", "stray"] if profile == "all" else [profile]
markers = {"realm": [b"realm-player-scaffold", b"BURST & COUNTER"], "stray": [b"stray-player-scaffold", b"coyote-lottie"]}
with zipfile.ZipFile(apk) as archive:
    bad = archive.testzip()
    if bad:
        raise ValueError(f"Corrupt APK entry: {bad}")
    reports = [name for name in archive.namelist() if name.startswith("assets/public/") and name.endswith("/game-build.json")]
    if not reports:
        raise ValueError("No game audit packaged in the APK")
    if any(json.loads(archive.read(name))["surface"] == "lab" for name in reports):
        config = json.loads(archive.read("assets/capacitor.config.json"))
        if config.get("android", {}).get("webContentsDebuggingEnabled") is False:
            raise ValueError("Lab APK disables WebView inspection instead of using the SDK debug-build default")
    for name in reports:
        report = json.loads(archive.read(name))
        if report["profile"] != profile:
            raise ValueError("APK contains a different web profile")
        for chunk in report["chunks"]:
            if any(game not in selected for game in chunk["games"]):
                raise ValueError("Excluded game chunk is packaged")
    for name in archive.namelist():
        if not name.startswith("assets/public/"):
            continue
        if "/references/" in name:
            game = name.rsplit("/", 1)[-1].removesuffix(".html")
            if game not in selected:
                raise ValueError(f"Excluded reference is packaged: {name}")
        if name.endswith((".js", ".css", ".html")):
            data = archive.read(name)
            for game, signatures in markers.items():
                if game not in selected and any(signature in data for signature in signatures):
                    raise ValueError(f"Stale {game} asset is packaged: {name}")
print(f"{profile} APK: packaged graph, assets and ZIP integrity verified.")
