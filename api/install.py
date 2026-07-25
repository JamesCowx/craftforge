from fastapi import APIRouter, HTTPException

from services.downloader import (
    download_minecraft_server,
    is_java_installed,
)
from services.server_manager import server_manager

router = APIRouter(prefix="/api/install", tags=["install"])


@router.get("/java/status")
async def java_status():
    installed = await is_java_installed()
    return {"installed": installed}


@router.post("/server/{server_id}")
async def install_server(server_id: str):
    server = server_manager.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    if not await is_java_installed():
        raise HTTPException(status_code=400, detail="Java not installed")

    ok = await download_minecraft_server(server.install_dir)
    if ok:
        from services.downloader import accept_eula
        await accept_eula(server.install_dir)
        server_manager.mark_installed(server_id)
    return {"ok": ok}
