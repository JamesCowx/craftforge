"""
Build a standalone CraftForge executable using PyInstaller.

Usage:
    python build_exe.py

Output: dist/craftforge.exe  (or craftforge on Linux/macOS)

The resulting binary bundles Python + all dependencies.
Java must still be installed separately for running Minecraft servers.
"""
import os
import sys
import subprocess
import shutil
from pathlib import Path


def main():
    root = Path(__file__).parent.resolve()
    dist_dir = root / "dist"
    build_dir = root / "build"

    # Ensure PyInstaller is installed
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "pyinstaller"]
        )

    # Clean previous builds
    for d in [dist_dir, build_dir]:
        if d.exists():
            shutil.rmtree(d)

    # Build command
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=craftforge",
        "--onefile",
        "--add-data", f"static{os.pathsep}static",
        "--add-data", f".env.example{os.pathsep}.",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=websockets",
        "--hidden-import=aiofiles",
        "--hidden-import=dotenv",
        "--hidden-import=multipart",
        "--collect-submodules=uvicorn",
        str(root / "main.py"),
    ]

    print("Building CraftForge executable...")
    subprocess.check_call(cmd, cwd=root)

    # Clean up build artifacts
    spec_file = root / "craftforge.spec"
    if spec_file.exists():
        spec_file.unlink()
    if build_dir.exists():
        shutil.rmtree(build_dir)

    # Locate the executable
    if sys.platform == "win32":
        exe = dist_dir / "craftforge.exe"
    else:
        exe = dist_dir / "craftforge"

    if exe.exists():
        print(f"\nBuild complete: {exe}")
        print(f"\nTo run: {exe}")
        print("\nOptions (via environment variables or .env file):")
        print("  HOST=0.0.0.0         - Bind address")
        print("  PORT=8080            - Web UI port")
        print("  SERVER_DATA_DIR=servers/ - Data directory")
        print("  LOG_LEVEL=info       - Logging level")
    else:
        print("Build failed: executable not found")
        sys.exit(1)


if __name__ == "__main__":
    main()
