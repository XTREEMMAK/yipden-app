import concurrent.futures
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from android_version import claim, reserve
from android_artifacts import backup_output, restore_missing
import shutil


class VersionReservations(unittest.TestCase):
    def test_real_floor_and_failed_builds(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            self.assertEqual(reserve(state, 900)[0], 901)
            self.assertEqual(reserve(state, 900)[0], 902)
            self.assertEqual(reserve(state, 1500)[0], 1501)
            self.assertEqual(reserve(state, 900)[0], 1502)

    def test_reservation_cannot_be_reused(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            code, token = reserve(state, 900, pending=True)
            self.assertEqual(claim(token, state), code)
            with self.assertRaises(FileNotFoundError):
                claim(token, state)
            with self.assertRaises(ValueError):
                claim("../high-water", state)

    def test_concurrent_processes_get_unique_codes(self):
        with tempfile.TemporaryDirectory() as folder:
            def run(_):
                return int(subprocess.check_output([
                    sys.executable, "-c",
                    "from pathlib import Path; from android_version import reserve; "
                    "import sys; print(reserve(Path(sys.argv[1]),900)[0])", folder
                ], cwd=Path(__file__).parent, text=True))
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                codes = list(pool.map(run, range(24)))
            self.assertEqual(sorted(codes), list(range(901, 925)))

    def test_output_cleanup_preserves_history_and_other_apps(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "gradle-output"
            backup = Path(folder) / "backup"
            (output / "games").mkdir(parents=True)
            (output / "j2chat").mkdir()
            (output / "games/old.apk").write_bytes(b"game history")
            (output / "j2chat/old.apk").write_bytes(b"chat history")
            (output / "yipden-debug-072.apk").write_bytes(b"reader history")
            (output / "app-debug.apk").write_bytes(b"old output")
            backup_output(output, backup)
            shutil.rmtree(output)  # Simulate AGP's output-directory cleanup.
            output.mkdir()
            (output / "app-debug.apk").write_bytes(b"new output")
            restore_missing(backup, output)
            self.assertEqual((output / "games/old.apk").read_bytes(), b"game history")
            self.assertEqual((output / "j2chat/old.apk").read_bytes(), b"chat history")
            self.assertEqual((output / "yipden-debug-072.apk").read_bytes(), b"reader history")
            self.assertEqual((output / "app-debug.apk").read_bytes(), b"new output")
            self.assertEqual((backup / "app-debug.apk").read_bytes(), b"old output")

    def test_corrupt_counter_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            (state / "high-water").write_text("broken")
            with self.assertRaises(ValueError):
                reserve(state, 900)


if __name__ == "__main__":
    unittest.main()
