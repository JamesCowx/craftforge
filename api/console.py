import asyncio
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from services.server_manager import server_manager

router = APIRouter()


@router.websocket("/ws/console/{server_id}")
async def console_websocket(websocket: WebSocket, server_id: str):
    server = server_manager.get_server(server_id)
    if not server:
        await websocket.close(code=4004, reason="Server not found")
        return

    await websocket.accept()

    try:
        for line in server.log_lines[-200:]:
            await websocket.send_text(line)
    except Exception:
        await websocket.close()
        return

    queue = asyncio.Queue(maxsize=500)

    async def log_handler(sid: str, line: str):
        if sid == server_id:
            try:
                queue.put_nowait(line)
            except asyncio.QueueFull:
                pass

    def safe_send(queue, ws):
        async def _run():
            while True:
                try:
                    line = await asyncio.wait_for(queue.get(), timeout=30)
                    try:
                        await ws.send_text(line)
                    except Exception:
                        return
                except asyncio.TimeoutError:
                    try:
                        await ws.send_text("__PING__")
                    except Exception:
                        return
        return _run

    server.log_callback = log_handler
    sender = asyncio.create_task(safe_send(queue, websocket)())

    try:
        await sender
    except WebSocketDisconnect:
        sender.cancel()
    finally:
        sender.cancel()
        if server.log_callback == log_handler:
            server.log_callback = None
