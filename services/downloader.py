import asyncio
import json
import os
import platform
import urllib.request

VERSION_MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest.json"
MINECRAFT_APP_ID = "minecraft"  # used as identifier, not steam


def _get_java_path() -> str:
    java_home = os.environ.get("JAVA_HOME", "")
    if java_home:
        return os.path.join(java_home, "bin", "java.exe" if platform.system() == "Windows" else "java")
    return "java"


async def is_java_installed() -> bool:
    try:
        process = await asyncio.create_subprocess_exec(
            _get_java_path(), "-version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()
        return process.returncode == 0 and "version" in stderr.decode(errors="replace").lower()
    except (FileNotFoundError, OSError):
        return False


async def is_server_installed(install_dir: str) -> bool:
    return os.path.exists(os.path.join(install_dir, "server.jar"))


async def get_latest_version_info() -> dict:
    req = urllib.request.Request(VERSION_MANIFEST_URL, headers={"User-Agent": "CraftForge/1.0"})
    with urllib.request.urlopen(req) as resp:
        manifest = json.loads(resp.read().decode())
    latest_release = manifest["latest"]["release"]
    for version_entry in manifest["versions"]:
        if version_entry["id"] == latest_release and version_entry["type"] == "release":
            req = urllib.request.Request(version_entry["url"], headers={"User-Agent": "CraftForge/1.0"})
            with urllib.request.urlopen(req) as resp2:
                version_data = json.loads(resp2.read().decode())
            server_download = version_data.get("downloads", {}).get("server", {})
            return {
                "id": latest_release,
                "url": server_download.get("url", ""),
                "sha1": server_download.get("sha1", ""),
                "size": server_download.get("size", 0),
            }
    return {"id": "unknown", "url": "", "sha1": "", "size": 0}


async def download_minecraft_server(install_dir: str, on_progress=None) -> bool:
    os.makedirs(install_dir, exist_ok=True)
    jar_path = os.path.join(install_dir, "server.jar")

    version_info = await get_latest_version_info()
    if not version_info["url"]:
        if on_progress:
            await on_progress("ERROR: Could not resolve download URL from Mojang manifest")
        return False

    url = version_info["url"]
    version_id = version_info["id"]

    if on_progress:
        await on_progress(f"Downloading Minecraft server v{version_id}...")
        await on_progress(f"URL: {url}")

    req = urllib.request.Request(url, headers={"User-Agent": "CraftForge/1.0"})
    try:
        with urllib.request.urlopen(req) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 8192
            with open(jar_path, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total and on_progress:
                        pct = int(downloaded * 100 / total)
                        mb_dl = downloaded / (1024 * 1024)
                        mb_total = total / (1024 * 1024)
                        await on_progress(f"Downloaded {mb_dl:.1f}/{mb_total:.1f} MB ({pct}%)")
    except Exception as e:
        if on_progress:
            await on_progress(f"ERROR: Download failed - {e}")
        return False

    if not os.path.exists(jar_path) or os.path.getsize(jar_path) == 0:
        if on_progress:
            await on_progress("ERROR: Downloaded file is empty or missing")
        return False

    if on_progress:
        await on_progress(f"Download complete ({os.path.getsize(jar_path) / (1024*1024):.1f} MB)")

    return True


async def accept_eula(install_dir: str) -> None:
    eula_path = os.path.join(install_dir, "eula.txt")
    with open(eula_path, "w", encoding="utf-8") as f:
        f.write("#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\n")
        f.write("eula=true\n")
