"""Persistent Android version reservations, shared by clones/worktrees on this host."""
import contextlib
import fcntl
import json
import os
from pathlib import Path
import sys
import uuid

ANDROID = Path(__file__).resolve().parents[1] / "android"
STATE = Path.home() / ".local/state/yipden/android"
MAX_CODE = 2_100_000_000


@contextlib.contextmanager
def locked(state=STATE, name="version.lock"):
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / name).open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def atomic_write(path, text):
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w") as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def reserve(state=STATE, floor=None, pending=False):
    if floor is None:
        floor = int((ANDROID / "version-floor.txt").read_text().strip())
    with locked(state):
        counter = state / "high-water"
        previous = int(counter.read_text()) if counter.exists() else floor
        code = max(previous, floor) + 1
        if not 900 < code <= MAX_CODE:
            raise ValueError("Android versionCode exhausted or invalid floor")
        atomic_write(counter, f"{code}\n")
        token = uuid.uuid4().hex if pending else None
        if token:
            atomic_write(state / token, f"{code}\n")
        return code, token


def claim(token, state=STATE):
    if len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        raise ValueError("Invalid build reservation")
    with locked(state):
        reservation = state / token
        code = int(reservation.read_text())
        if not 900 < code <= int((state / "high-water").read_text()):
            raise ValueError("Invalid reserved versionCode")
        reservation.unlink()  # A reservation is consumed once; failed builds burn their code.
        return code


if __name__ == "__main__":
    token = os.environ.get("YIPDEN_VERSION_RESERVATION")
    try:
        print(claim(token) if token else reserve()[0])
    except (OSError, ValueError) as error:
        sys.exit(f"Cannot reserve Android versionCode: {error}")
