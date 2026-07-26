import asyncio
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from services.downloader import download_minecraft_server, accept_eula, is_java_installed
from services.server_manager import server_manager

router = APIRouter()


@router.websocket("/ws/install/{server_id}")
async def install_websocket(websocket: WebSocket, server_id: str):
    server = server_manager.get_server(server_id)
    if not server:
        await websocket.close(code=4004, reason="Server not found")
        return

    await websocket.accept()

    try:
        if not await is_java_installed():
            await websocket.send_text("ERROR: Java Runtime not found. Please install Java 17+.")
            await websocket.close(code=1011, reason="Java not installed")
            return

        async def progress(line: str):
            try:
                await websocket.send_text(line)
            except WebSocketDisconnect:
                pass

        await websocket.send_text("Downloading Minecraft server...")
        ok = await download_minecraft_server(server.install_dir, on_progress=progress)

        if ok:
            await accept_eula(server.install_dir)
            await server_manager.mark_installed(server_id)
            await websocket.send_text("__COMPLETE__: Installation successful")
        else:
            await websocket.send_text("ERROR: Installation failed")
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/ws/update/{server_id}")
async def update_websocket(websocket: WebSocket, server_id: str):
    server = server_manager.get_server(server_id)
    if not server or not server.installed:
        await websocket.close(code=4004, reason="Server not found or not installed")
        return

    await websocket.accept()

    try:
        async def progress(line: str):
            try:
                await websocket.send_text(line)
            except WebSocketDisconnect:
                pass

        await websocket.send_text("Updating Minecraft server...")
        ok = await download_minecraft_server(server.install_dir, on_progress=progress)

        if ok:
            await websocket.send_text("__COMPLETE__: Update successful")
        else:
            await websocket.send_text("ERROR: Update failed")
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
