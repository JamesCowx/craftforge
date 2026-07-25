import asyncio
import json
import os
import platform
import re
import signal
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from services.config_manager import DEFAULT_MINECRAFT_SETTINGS, get_default_settings, read_config, write_config

SERVERS_DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "servers.json")
_save_lock = asyncio.Lock()


@dataclass
class ServerInstance:
    id: str
    name: str
    status: str = "stopped"
    port: int = 25565
    settings: Dict[str, Any] = field(default_factory=get_default_settings)
    installed: bool = False
    created_at: float = field(default_factory=time.time)
    uptime_start: Optional[float] = None
    player_count: int = 0
    max_players_seen: int = 0
    process: Any = None
    log_lines: List[str] = field(default_factory=list)
    log_callback: Optional[Callable] = None
    version: str = "latest"

    @property
    def install_dir(self) -> str:
        base = os.environ.get("SERVER_DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "servers"))
        return os.path.abspath(os.path.join(base, self.id))

    @property
    def config_path(self) -> str:
        return os.path.join(self.install_dir, "server.properties")

    @property
    def jar_path(self) -> str:
        return os.path.join(self.install_dir, "server.jar")

    @property
    def java_path(self) -> str:
        java_home = os.environ.get("JAVA_HOME", "")
        if java_home:
            return os.path.join(java_home, "bin", "java.exe" if platform.system() == "Windows" else "java")
        return "java"

    @property
    def uptime_seconds(self) -> float:
        if self.status == "running" and self.uptime_start:
            return time.time() - self.uptime_start
        return 0.0

    @property
    def memory_mb(self) -> float:
        if not self.process or self.status != "running":
            return 0.0
        try:
            import psutil
            proc = psutil.Process(self.process.pid)
            return proc.memory_info().rss / (1024 * 1024)
        except Exception:
            return 0.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "port": self.port,
            "settings": self.settings,
            "installed": self.installed,
            "install_dir": self.install_dir,
            "created_at": self.created_at,
            "uptime_seconds": self.uptime_seconds,
            "player_count": self.player_count,
            "max_players_seen": self.max_players_seen,
            "memory_mb": round(self.memory_mb, 1),
            "version": self.version,
        }


class ServerManager:
    def __init__(self):
        self._servers: Dict[str, ServerInstance] = {}
        self._load()

    def _load(self):
        if os.path.exists(SERVERS_DATA_FILE):
            try:
                with open(SERVERS_DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                print(f"[CraftForge] Failed to load servers.json: {e}")
                data = []
            for sdata in data:
                instance = ServerInstance(
                    id=sdata["id"],
                    name=sdata["name"],
                    port=sdata.get("port", 25565),
                    settings=sdata.get("settings", get_default_settings()),
                    installed=sdata.get("installed", False),
                    created_at=sdata.get("created_at", time.time()),
                    player_count=sdata.get("player_count", 0),
                    max_players_seen=sdata.get("max_players_seen", 0),
                    version=sdata.get("version", "latest"),
                )
                self._servers[instance.id] = instance

    async def _save(self):
        async with _save_lock:
            data = [s.to_dict() for s in self._servers.values()]
            tmp = SERVERS_DATA_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, SERVERS_DATA_FILE)

    def list_servers(self) -> List[ServerInstance]:
        return list(self._servers.values())

    def get_server(self, server_id: str) -> Optional[ServerInstance]:
        return self._servers.get(server_id)

    async def create_server(self, name: str, port: int = 25565) -> ServerInstance:
        server_id = str(uuid.uuid4())
        instance = ServerInstance(id=server_id, name=name, port=port)
        self._servers[server_id] = instance
        await self._save()
        return instance

    async def rename_server(self, server_id: str, name: str) -> bool:
        server = self._servers.get(server_id)
        if not server:
            return False
        server.name = name
        await self._save()
        return True

    async def delete_server(self, server_id: str) -> bool:
        server = self._servers.pop(server_id, None)
        if server:
            await self._save()
            return True
        return False

    async def update_settings(self, server_id: str, settings: Dict[str, Any]) -> bool:
        server = self._servers.get(server_id)
        if not server:
            return False
        server.settings = {**server.settings, **settings}
        if server.installed and os.path.exists(server.install_dir):
            write_config(server.config_path, server.settings)
        await self._save()
        return True

    def get_settings(self, server_id: str) -> Optional[Dict[str, Any]]:
        server = self._servers.get(server_id)
        if not server:
            return None
        if server.installed and os.path.exists(server.config_path):
            file_settings = {**DEFAULT_MINECRAFT_SETTINGS, **read_config(server.config_path)}
            return file_settings
        return dict(server.settings)

    async def start_server(self, server_id: str) -> bool:
        server = self._servers.get(server_id)
        if not server or not server.installed or server.status == "running":
            return False

        if not os.path.exists(server.jar_path):
            server.status = "stopped"
            server.log_lines.append("[ERROR] server.jar not found. Please install first.")
            return False

        config_path = server.config_path
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        write_config(config_path, server.settings)

        server.status = "starting"
        server.log_lines = []
        server.player_count = 0
        server.max_players_seen = 0

        mem_gb = server.settings.get("max-memory-gb", 2)
        xmx = f"{mem_gb}G"
        xms = f"{max(1, mem_gb // 2)}G"

        try:
            subprocess_kwargs = dict(
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                stdin=asyncio.subprocess.PIPE,
                cwd=server.install_dir,
            )

            server.process = await asyncio.create_subprocess_exec(
                server.java_path,
                f"-Xmx{xmx}",
                f"-Xms{xms}",
                "-jar", "server.jar",
                "--nogui",
                "--port", str(server.port),
                **subprocess_kwargs,
            )

            server.uptime_start = time.time()
            asyncio.create_task(self._read_output(server))
            server.status = "running"
            await self._save()
            return True
        except Exception as e:
            server.status = "stopped"
            server.log_lines.append(f"[ERROR] Failed to start: {e}")
            return False

    async def stop_server(self, server_id: str) -> bool:
        server = self._servers.get(server_id)
        if not server or server.status != "running" or not server.process:
            return False

        server.status = "stopping"
        try:
            await self.send_command(server_id, "stop")

            try:
                await asyncio.wait_for(server.process.wait(), timeout=30)
            except asyncio.TimeoutError:
                if platform.system() == "Windows":
                    server.process.terminate()
                else:
                    server.process.send_signal(signal.SIGTERM)
                try:
                    await asyncio.wait_for(server.process.wait(), timeout=10)
                except asyncio.TimeoutError:
                    server.process.kill()
                    await server.process.wait()
        except ProcessLookupError:
            pass

        server.process = None
        server.uptime_start = None
        server.status = "stopped"
        await self._save()
        return True

    async def restart_server(self, server_id: str) -> bool:
        await self.stop_server(server_id)
        await asyncio.sleep(3)
        return await self.start_server(server_id)

    async def send_command(self, server_id: str, command: str) -> bool:
        server = self._servers.get(server_id)
        if not server or not server.process or server.status != "running":
            return False
        try:
            cmd = (command + "\n").encode()
            server.process.stdin.write(cmd)
            await server.process.stdin.drain()
            return True
        except Exception:
            return False

    _PLAYER_JOIN_RE = re.compile(r"(joined the game|logged in|UUID of player)", re.IGNORECASE)
    _PLAYER_LEAVE_RE = re.compile(r"(left the game|disconnected|logged out)", re.IGNORECASE)
    _PLAYER_COUNT_RE = re.compile(r"There are (\d+) of a max of (\d+) players", re.IGNORECASE)

    async def _read_output(self, server: ServerInstance):
        if not server.process or not server.process.stdout:
            return
        async for line in server.process.stdout:
            text = line.decode(errors="replace").rstrip()
            server.log_lines.append(text)
            if len(server.log_lines) > 800:
                server.log_lines = server.log_lines[-800:]

            match_count = self._PLAYER_COUNT_RE.search(text)
            if match_count:
                try:
                    count = int(match_count.group(1))
                    server.player_count = count
                    if count > server.max_players_seen:
                        server.max_players_seen = count
                except ValueError:
                    pass

            if self._PLAYER_JOIN_RE.search(text) and not match_count:
                max_p = server.settings.get("max-players", 20)
                server.player_count = min(server.player_count + 1, max_p)
                if server.player_count > server.max_players_seen:
                    server.max_players_seen = server.player_count

            if self._PLAYER_LEAVE_RE.search(text):
                server.player_count = max(server.player_count - 1, 0)

            if server.log_callback:
                await server.log_callback(server.id, text)

        if server.process.returncode is not None and server.status == "running":
            server.status = "stopped"
            server.process = None
            server.uptime_start = None
            self._save()

    def get_logs(self, server_id: str) -> List[str]:
        server = self._servers.get(server_id)
        if not server:
            return []
        return list(server.log_lines)

    def mark_installed(self, server_id: str, version: str = "latest") -> None:
        server = self._servers.get(server_id)
        if server:
            server.installed = True
            server.version = version
            self._save()


server_manager = ServerManager()
