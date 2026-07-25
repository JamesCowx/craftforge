# CraftForge

A web-based GUI for creating, configuring, and hosting Minecraft dedicated servers. Built with FastAPI and vanilla JavaScript.

Inspired by the same architecture used for [PalForge](https://github.com/yourusername/palforge).

![Screenshot](screenshot.png)

> **Note:** Screenshot placeholder — add a screenshot of the UI here.

---

## Features

- **Server Management** — Create, rename, delete Minecraft server instances through a clean web interface
- **One-Click Install** — Downloads the latest vanilla server JAR directly from Mojang's manifest API
- **Live Console** — Real-time WebSocket console with auto-scroll and command input
- **Configuration Editor** — Full `server.properties` editing with categorized settings, search, and preset profiles
- **Preset Profiles** — Survival, Creative, Hardcore, and Peaceful presets
- **Process Lifecycle** — Start, stop, restart server processes with uptime tracking
- **Player Tracking** — Live player count, peak player tracking
- **Connection Info** — Local and public IP addresses with port forwarding hints
- **System Monitoring** — CPU, RAM, disk usage displayed in the sidebar
- **Auto-Refresh** — Server status and system info refresh automatically
- **REST API** — Full REST API for all operations
- **Docker Support** — Ready-to-use Dockerfile and docker-compose.yml

---

## Quick Start

### Prerequisites

- Python 3.11+
- Java 17+ (for running Minecraft servers; checked during install)

### Installation

```bash
# Clone the repo
git clone https://github.com/JamesCowx/craftforge.git
cd craftforge

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env

# Run the application
python main.py
```

Open **http://localhost:8080** in your browser.

### Production

```bash
python run.py
```

---

## Docker

```bash
docker compose up -d
```

This builds an image with Python 3.11 + Java 17, and exposes port 8080 (web UI) and 25565 (Minecraft).

---

## Usage

### Creating a Server

1. Click **+ New Server** in the sidebar (or press `N`)
2. Enter a name, port (default `25565`), and max players
3. The server appears in the sidebar

### Installing Minecraft

1. Select a server from the sidebar
2. Go to the **Install & Updates** tab
3. Ensure Java is detected (green dot)
4. Click **Install / Update Minecraft Server**
5. The JAR downloads from Mojang's servers and the EULA is auto-accepted

### Starting & Stopping

Use the **Start**, **Stop**, and **Restart** buttons in the server header. The server runs as a subprocess with its output streamed to the web console.

### Editing Settings

The **Settings** tab exposes all `server.properties` options:

- Options are categorized (Server, Gameplay, World, etc.)
- Use the search bar to filter
- Apply presets (Survival, Creative, Hardcore, Peaceful)
- Toggle switches for booleans, number inputs for integers, dropdowns for gamemode/difficulty
- Click **Save Changes** to persist to `server.properties`

### Console

The **Console** tab provides a live terminal for your Minecraft server. Type commands like `/help`, `/list`, `/say Hello!`, `/gamemode creative`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List all servers |
| POST | `/api/servers` | Create a server |
| GET | `/api/servers/{id}` | Get server details |
| DELETE | `/api/servers/{id}` | Delete a server |
| PUT | `/api/servers/{id}/rename` | Rename a server |
| POST | `/api/servers/{id}/start` | Start server |
| POST | `/api/servers/{id}/stop` | Stop server |
| POST | `/api/servers/{id}/restart` | Restart server |
| GET | `/api/servers/{id}/settings` | Get server.properties |
| PUT | `/api/servers/{id}/settings` | Update server.properties |
| GET | `/api/servers/{id}/logs` | Get log lines |
| POST | `/api/servers/{id}/command` | Send console command |
| GET | `/api/servers/defaults/settings` | Get default settings |
| GET | `/api/servers/defaults/presets` | Get preset profiles |
| GET | `/api/install/java/status` | Check Java installation |
| POST | `/api/install/server/{id}` | Install server (REST) |
| WS | `/ws/console/{id}` | Console WebSocket |
| WS | `/ws/install/{id}` | Install progress WebSocket |
| GET | `/api/system` | System info (CPU, RAM, disk) |
| GET | `/api/system/network` | Local and public IP |
| GET | `/health` | Health check |

---

## Project Structure

```
craftforge/
├── main.py                  # FastAPI application entry point
├── run.py                   # Production uvicorn runner
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
├── .gitignore
├── Dockerfile               # Python + Java 17 image
├── docker-compose.yml
├── api/
│   ├── __init__.py
│   ├── servers.py           # Server CRUD + lifecycle endpoints
│   ├── install.py           # Java check + REST install endpoint
│   ├── console.py           # Live console WebSocket
│   ├── install_ws.py        # Install/update progress WebSocket
│   └── system.py            # System + network info endpoints
├── services/
│   ├── __init__.py
│   ├── server_manager.py    # Server process management
│   ├── config_manager.py    # server.properties read/write + presets
│   ├── downloader.py        # Mojang API client for server.jar
│   └── system.py            # CPU/RAM/disk/network utilities
└── static/
    ├── index.html           # Single-page application
    ├── craftforge-icon.svg  # App icon
    ├── css/
    │   └── style.css        # Dark theme stylesheet
    └── js/
        └── app.js           # Client-side application logic
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8080` | Server port |
| `SERVER_DATA_DIR` | `servers/` | Directory for server instances |
| `CORS_ORIGINS` | `*` | CORS allowed origins |
| `LOG_LEVEL` | `info` | Logging level |
| `JAVA_HOME` | *(auto)* | Java installation path |

---

## License

[MIT](LICENSE)
