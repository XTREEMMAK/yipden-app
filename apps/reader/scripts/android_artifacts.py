"""Preserve files served by the legacy host before Gradle cleans its output tree."""
from pathlib import Path
import shutil


def backup_output(output, destination):
    output, destination = Path(output), Path(destination)
    if output.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(output, destination, symlinks=True)


def restore_missing(backup, output):
    backup, output = Path(backup), Path(output)
    if not backup.exists():
        return
    output.mkdir(parents=True, exist_ok=True)
    for item in backup.iterdir():
        target = output / item.name
        if item.is_symlink():
            if not target.exists() and not target.is_symlink():
                target.symlink_to(item.readlink())
        elif item.is_dir():
            restore_missing(item, target)
        elif not target.exists():
            shutil.copy2(item, target)
