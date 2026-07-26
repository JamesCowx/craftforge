const API = {
    async get(path) { const r = await fetch(path); if (!r.ok) throw new Error(await r.text()); return r.json(); },
    async post(path, body) {
        const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(await r.text()); return r.json().catch(() => ({}));
    },
    async put(path, body) {
        const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(await r.text()); return r.json().catch(() => ({}));
    },
    async del(path) { const r = await fetch(path, { method: 'DELETE' }); if (!r.ok) throw new Error(await r.text()); return r.json().catch(() => ({})); }
};

let state = {
    servers: [], activeServerId: null, consoleWs: null, installWs: null,
    currentSettings: {}, uptimeInterval: null, networkInterval: null, systemInterval: null, loaded: false
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const ICONS = { 'Server': '⚙', 'Gameplay': '🎮', 'World': '🌍', 'Whitelist': '📋', 'Admin': '🔧', 'Resources': '📦', 'Other': '⋯' };

const SETTING_INFO = {
    'motd': { desc: 'Message shown in the Minecraft server list' },
    'server-port': { desc: 'Port the server listens on (default: 25565)' },
    'max-players': { desc: 'Maximum number of players that can join at once' },
    'online-mode': { desc: 'Requires players to authenticate with Mojang (must be true unless pirated)' },
    'max-memory-gb': { desc: 'RAM allocated to the server in gigabytes' },
    'difficulty': { desc: 'Controls damage, hunger, and mob behavior' },
    'gamemode': { desc: 'Default game mode for new players' },
    'hardcore': { desc: 'Permadeath — players are banned on death' },
    'pvp': { desc: 'Allow players to deal damage to each other' },
    'allow-flight': { desc: 'Allow vanilla flight if the player has modded fly ability' },
    'spawn-protection': { desc: 'Radius in blocks around spawn protected from edits' },
    'player-idle-timeout': { desc: 'Kick idle players after this many minutes (0 = disabled)' },
    'max-world-size': { desc: 'Maximum world border radius in blocks' },
    'view-distance': { desc: 'How many chunks the server sends to clients' },
    'simulation-distance': { desc: 'How many chunks are ticked by the server' },
    'entity-broadcast-range-percentage': { desc: 'Controls entity visibility range relative to view-distance' },
    'max-tick-time': { desc: 'Max milliseconds per tick before warning (0 = disabled)' },
    'rate-limit': { desc: 'Max packets per second from a client (0 = unlimited)' },
    'spawn-animals': { desc: 'Whether animals spawn naturally' },
    'spawn-monsters': { desc: 'Whether monsters spawn naturally' },
    'spawn-npcs': { desc: 'Whether villagers spawn naturally' },
    'generate-structures': { desc: 'Whether structures like villages and temples generate' },
    'allow-nether': { desc: 'Allow players to travel to the Nether' },
    'whitelist': { desc: 'Only allow whitelisted players to join' },
    'enforce-whitelist': { desc: 'Kick non-whitelisted players on reload' },
    'op-permission-level': { desc: 'Permission level for OPs (1-4, higher = more access)' },
    'function-permission-level': { desc: 'Permission level for functions (1-4)' },
    'enable-command-block': { desc: 'Allow command blocks to execute commands' },
    'enable-rcon': { desc: 'Allow remote console access via RCON protocol' },
    'rcon.port': { desc: 'Port for RCON connections' },
    'rcon.password': { desc: 'Password for RCON authentication' },
    'enable-query': { desc: 'Allow server query protocol for server list pings' },
    'query.port': { desc: 'Port for server query protocol' },
    'enable-jmx-monitoring': { desc: 'Enable JMX monitoring beans for performance tools' },
    'resource-pack': { desc: 'URL to a resource pack that players are forced to use' },
    'resource-pack-sha1': { desc: 'SHA-1 hash of the resource pack file for verification' },
    'require-resource-pack': { desc: 'Kick players who decline the resource pack' },
    'enforce-secure-profile': { desc: 'Requires players with secure profiles to join' },
    'prevent-proxy-connections': { desc: 'Blocks connections from proxy software' },
    'text-filtering-config': { desc: 'Config URL for text filtering service' },
    'enable-status': { desc: 'Show server in the Minecraft server list' },
    'broadcast-rcon-to-ops': { desc: 'Broadcast RCON commands to online OPs' },
    'broadcast-console-to-ops': { desc: 'Broadcast console commands to online OPs' },
    'max-chained-neighbor-updates': { desc: 'Limits cascading block updates per tick' },
    'sync-chunk-writes': { desc: 'Synchronizes chunk writes to disk after saves' },
    'initial-disabled-packs': { desc: 'Data packs disabled on first world load' },
    'initial-enabled-packs': { desc: 'Data packs enabled on first world load' },
};

function fmtMem(mb) {
    if (!mb || mb <= 0) return '—';
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return mb.toFixed(0) + ' MB';
}

function toast(msg, type = 'info') {
    const c = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'alert');
    const iconMap = { success: '✓', error: '✗', info: 'ℹ' };
    el.innerHTML = `<span style="font-size:14px;flex-shrink:0;opacity:0.8">${iconMap[type] || 'ℹ'}</span><span style="flex:1;min-width:0">${msg}</span><span style="cursor:pointer;opacity:0.5;flex-shrink:0;font-size:14px;line-height:1" class="toast-close">&times;</span>`;
    el.querySelector('.toast-close').onclick = e => { e.stopPropagation(); dismissToast(el); };
    el.onclick = e => { if (e.target === el) dismissToast(el); };
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-visible'));
    el._timeout = setTimeout(() => dismissToast(el), 5000);
}

function dismissToast(el) {
    clearTimeout(el._timeout);
    if (el.classList.contains('toast-exit')) return;
    el.classList.remove('toast-visible');
    el.classList.add('toast-exit');
    el.addEventListener('animationend', () => el.remove(), { once: true });
}

function E(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

async function loadServers() {
    try { state.servers = await API.get('/api/servers'); state.loaded = true; }
    catch (e) { console.warn('[CraftForge] loadServers failed', e); }
    renderServerList();
    if (state.activeServerId) {
        const s = state.servers.find(x => x.id === state.activeServerId);
        if (s) renderServerView(s);
        else { state.activeServerId = null; showEmptyState(); }
    }
}

function renderServerList() {
    const list = $('#server-list');
    const filter = ($('#sidebar-search')?.value || '').toLowerCase();
    let shown = filter
        ? state.servers.filter(s => s.name.toLowerCase().includes(filter) || s.id.toLowerCase().includes(filter) || String(s.port).includes(filter))
        : state.servers;
    if (!shown.length) {
        list.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--text-muted);font-size:11px;line-height:1.7;">${
            filter ? `No servers match "<span style="color:var(--text-secondary)">${E(filter)}</span>"` :
            state.loaded ? 'No servers yet<br><span style="font-size:10px">Press <b style="color:var(--accent)">N</b> or click below to create one</span>' :
            '<span class="skeleton" style="display:inline-block;width:140px;height:12px;border-radius:4px;"></span>'
        }</div>`;
        return;
    }
    list.innerHTML = shown.map((s, i) => `
        <li class="${s.id === state.activeServerId ? 'active' : ''}" data-id="${s.id}" tabindex="0" role="button" aria-label="Select ${E(s.name)}" style="animation-delay:${i * 0.03}s">
            <div class="server-list-info">
                <div class="server-list-icon" style="${s.status === 'running' ? 'background:var(--green-soft);color:var(--green)' : s.installed ? '' : 'opacity:0.4'}">&#9632;</div>
                <div>
                    <div class="server-list-name">${E(s.name)}${!s.installed ? ' <span class="badge-muted">not installed</span>' : ''}</div>
                    <div class="server-list-port">:${s.port} ${s.uptime_seconds > 0 ? '· ' + fmtUptime(s.uptime_seconds) : '· offline'}</div>
                </div>
            </div>
            <span class="server-list-status ${s.status}">${s.status}</span>
        </li>
    `).join('');
}

function selectServer(id) {
    state.activeServerId = id;
    const s = state.servers.find(x => x.id === id);
    if (s) {
        renderServerList();
        renderServerView(s);
        connectConsole(id);
        checkJavaStatus();
        startUptimeTick(s);
    }
}

function showEmptyState() {
    $('#empty-state').style.display = 'flex';
    $('#server-view').style.display = 'none';
    if (state.consoleWs) { state.consoleWs.close(); state.consoleWs = null; }
    if (state.uptimeInterval) { clearInterval(state.uptimeInterval); state.uptimeInterval = null; }
}

const CATS = {
    'Server': ['motd','server-port','max-players','online-mode','enable-status','enforce-secure-profile','prevent-proxy-connections','text-filtering-config','max-memory-gb'],
    'Gameplay': ['gamemode','difficulty','hardcore','pvp','allow-flight','spawn-protection','player-idle-timeout','max-world-size','generate-structures','allow-nether','initial-disabled-packs','initial-enabled-packs'],
    'World': ['spawn-animals','spawn-monsters','spawn-npcs','view-distance','simulation-distance','entity-broadcast-range-percentage','max-tick-time','rate-limit','max-chained-neighbor-updates','sync-chunk-writes'],
    'Whitelist': ['whitelist','enforce-whitelist','op-permission-level','function-permission-level'],
    'Admin': ['enable-command-block','enable-rcon','rcon.port','rcon.password','broadcast-rcon-to-ops','broadcast-console-to-ops','enable-query','query.port','enable-jmx-monitoring'],
    'Resources': ['resource-pack','resource-pack-sha1','require-resource-pack'],
};

function getCat(k) { for (const [c, ks] of Object.entries(CATS)) if (ks.includes(k)) return c; return 'Other'; }

function startUptimeTick(s) {
    if (state.uptimeInterval) clearInterval(state.uptimeInterval);
    if (s.status !== 'running') return;
    state.uptimeInterval = setInterval(() => {
        const sv = state.servers.find(x => x.id === state.activeServerId);
        if (!sv || sv.status !== 'running') { clearInterval(state.uptimeInterval); return; }
        animVal('ov-uptime', fmtUptime(sv.uptime_seconds));
        animVal('ov-players', `${sv.player_count || 0} / ${sv.settings?.['max-players'] || 20}`);
        if (sv.memory_mb > 0) animVal('ov-memory', fmtMem(sv.memory_mb));
        const peak = $('#ov-peak');
        if (sv.max_players_seen > 0) { peak.textContent = `Peak: ${sv.max_players_seen}`; peak.removeAttribute('aria-hidden'); }
        else { peak.textContent = ''; peak.setAttribute('aria-hidden', 'true'); }
    }, 1000);
}

function animVal(id, newVal) {
    const el = document.getElementById(id);
    if (!el || el.textContent === newVal) return;
    el.textContent = newVal;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = 'numberPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
}

function fmtUptime(s) {
    if (!s || s <= 0) return '—';
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m ${sec}s`;
    return m ? `${m}m ${sec}s` : `${sec}s`;
}

function renderServerView(s) {
    $('#empty-state').style.display = 'none';
    $('#server-view').style.display = 'flex';
    $('#server-name').textContent = s.name;
    $('#server-subtitle').textContent = `Port ${s.port} · ID ${s.id}${s.installed ? ' · v' + E(s.version) : ' · not installed'}`;
    $('#server-status').textContent = s.status;
    $('#server-status').className = `status-badge status-${s.status}`;
    $('#btn-start').disabled = s.status !== 'stopped' || !s.installed;
    $('#btn-stop').disabled = s.status !== 'running';
    $('#btn-restart').disabled = s.status !== 'running';
    const colors = { running: 'var(--success)', stopped: 'var(--danger)', starting: 'var(--warning)', stopping: 'var(--warning)' };
    const ovStatus = $('#ov-status');
    ovStatus.textContent = s.status.charAt(0).toUpperCase() + s.status.slice(1);
    ovStatus.style.color = colors[s.status] || 'var(--text-primary)';
    $('#ov-uptime').textContent = s.status === 'running' ? fmtUptime(s.uptime_seconds) : '—';
    $('#ov-players').textContent = `${s.player_count || 0} / ${s.settings?.['max-players'] || 20}`;
    const peak = $('#ov-peak');
    if (s.max_players_seen > 0) { peak.textContent = `Peak: ${s.max_players_seen}`; peak.removeAttribute('aria-hidden'); }
    else { peak.textContent = ''; peak.setAttribute('aria-hidden', 'true'); }
    const mem = s.memory_mb || 0;
    const memEl = $('#ov-memory');
    memEl.textContent = mem > 0 ? fmtMem(mem) : '—';
    memEl.style.color = mem > 0 ? 'var(--accent)' : 'var(--text-muted)';
    $('#info-id').textContent = s.id;
    $('#info-port').textContent = s.port;
    $('#info-maxplayers').textContent = s.settings?.['max-players'] || 20;
    $('#info-path').textContent = s.install_dir;
    const btnDelete = $('#btn-delete');
    btnDelete.disabled = s.status === 'running';
    btnDelete.title = s.status === 'running' ? 'Stop the server first' : 'Delete this server';
}

async function showRenameModal() {
    const s = state.servers.find(x => x.id === state.activeServerId);
    if (!s) return;
    showModal('Rename Server',
        `<div class="modal-body-field"><label for="modal-rename-input">Server Name</label><input type="text" id="modal-rename-input" value="${E(s.name)}" autofocus /></div>`,
        async () => {
            const name = document.getElementById('modal-rename-input').value.trim();
            if (!name) return toast('Name cannot be empty', 'error');
            await API.put(`/api/servers/${state.activeServerId}/rename`, { name });
            await loadServers();
            toast(`Renamed to "${name}"`, 'success');
        }, 'Rename');
}

async function loadSettings() {
    const pane = document.getElementById('tab-settings');
    if (!pane?.classList.contains('active')) return;
    const container = $('#settings-container');
    if (container) container.innerHTML = '<div style="text-align:center;padding:50px 20px;color:var(--text-muted);font-size:13px;"><div class="skeleton" style="width:200px;height:14px;margin:0 auto 16px;border-radius:4px;"></div><div class="skeleton" style="width:280px;height:12px;margin:0 auto 10px;border-radius:4px;"></div><div class="skeleton" style="width:240px;height:12px;margin:0 auto;border-radius:4px;"></div></div>';
    try {
        state.currentSettings = await API.get(`/api/servers/${state.activeServerId}/settings`);
        renderSettings(state.currentSettings, $('#settings-search')?.value || '');
    } catch (e) {
        toast('Failed to load settings', 'error');
        if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--danger);font-size:13px;">⚠ Failed to load settings<br><span style="font-size:11px;color:var(--text-muted);margin-top:8px;display:block">Check that the server configuration is valid</span></div>';
    }
}

let settingsSearchDebounce;

function renderSettings(settings, filter = '') {
    const container = $('#settings-container');
    let entries = Object.entries(settings);
    if (filter) { const q = filter.toLowerCase(); entries = entries.filter(([k]) => k.toLowerCase().includes(q)); }
    const grouped = {}; entries.forEach(([k, v]) => { const c = getCat(k); (grouped[c] ??= []).push([k, v]); });
    const order = Object.keys(CATS);
    let total = entries.length, html = '';
    for (const cat of order) {
        if (!grouped[cat]?.length) continue;
        html += `<div class="settings-category"><div class="settings-category-title">${ICONS[cat] || ''} ${cat} <span class="settings-count">${grouped[cat].length}</span></div><div class="settings-grid">`;
        grouped[cat].forEach(([k, v]) => { html += renderField(k, v, filter); });
        html += `</div></div>`;
    }
    if (grouped['Other']?.length) {
        html += `<div class="settings-category"><div class="settings-category-title">${ICONS['Other']} Other <span class="settings-count">${grouped['Other'].length}</span></div><div class="settings-grid">`;
        grouped['Other'].forEach(([k, v]) => { html += renderField(k, v, filter); });
        html += `</div></div>`;
    }
    const resultCount = filter ? `<div style="text-align:center;font-size:10px;color:var(--text-muted);padding:4px 0 8px">${total} setting${total !== 1 ? 's' : ''} match${total === 1 ? 'es' : ''} filter</div>` : '';
    container.innerHTML = (html ? resultCount + html : '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">No settings match this filter</div>');
}

const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'];

function renderField(key, value, filter = '') {
    const label = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    const info = SETTING_INFO[key];
    const tip = info ? info.desc : '';
    const tipAttr = tip ? ` data-tip="${E(tip)}"` : '';
    const highlighted = filter ? label.replace(new RegExp('(' + filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark class="setting-highlight">$1</mark>') : label;
    const wrap = (inner) => `<div class="setting-field"${tipAttr}><span class="setting-field-label${tip ? ' has-tip' : ''}">${highlighted}${tip ? '<span class="tip-icon" title="' + E(tip) + '">?</span>' : ''}</span>${inner}</div>`;
    if (key === 'difficulty') {
        return wrap(`<select class="setting-field-select" data-key="${key}" data-type="select">${DIFFICULTIES.map(d => `<option value="${d}" ${value === d ? 'selected' : ''}>${d.charAt(0).toUpperCase() + d.slice(1)}</option>`).join('')}</select>`);
    }
    if (key === 'gamemode') {
        return wrap(`<select class="setting-field-select" data-key="${key}" data-type="select">${GAMEMODES.map(g => `<option value="${g}" ${value === g ? 'selected' : ''}>${g.charAt(0).toUpperCase() + g.slice(1)}</option>`).join('')}</select>`);
    }
    if (typeof value === 'boolean') {
        return wrap(`<label class="toggle-switch"><input type="checkbox" data-key="${key}" data-type="bool" ${value ? 'checked' : ''} /><span class="toggle-slider"></span></label>`);
    } else if (typeof value === 'number') {
        const step = Number.isInteger(value) ? '1' : 'any';
        const suffix = key === 'max-memory-gb' ? '<span style="font-size:9px;color:var(--text-muted);font-family:var(--font);margin-left:4px">GB</span>' : '';
        return wrap(`<div style="display:flex;align-items:center;gap:2px"><input type="number" class="setting-field-input" data-key="${key}" data-type="number" value="${value}" step="${step}" min="${key === 'max-memory-gb' ? 1 : key === 'server-port' ? 1024 : ''}" />${suffix}</div>`);
    } else {
        const isPassword = key === 'rcon.password';
        return wrap(`<input type="${isPassword ? 'password' : 'text'}" class="setting-field-input" data-key="${key}" data-type="string" value="${E(String(value || ''))}" ${isPassword ? 'placeholder="set a password"' : ''} />`);
    }
}

async function saveSettings() {
    const fields = $$('[data-key]');
    const settings = {};
    fields.forEach(f => {
        const key = f.dataset.key;
        let val;
        if (f.dataset.type === 'bool') val = f.checked;
        else if (f.dataset.type === 'select') val = f.value;
        else if (f.dataset.type === 'number') val = f.value === '' ? 0 : parseFloat(f.value);
        else val = f.value;
        settings[key] = val;
    });
    if (!Object.keys(settings).length) return;
    const btn = $('#btn-save-settings');
    btn.disabled = true; btn.textContent = 'Saving…';
    try { await API.put(`/api/servers/${state.activeServerId}/settings`, { settings }); await loadServers(); toast('Settings saved', 'success'); }
    catch (e) { toast('Failed to save settings', 'error'); }
    btn.disabled = false; btn.textContent = 'Save Changes';
}

async function resetSettings() {
    try {
        const def = await API.get('/api/servers/defaults/settings');
        state.currentSettings = def;
        renderSettings(def, $('#settings-search')?.value || '');
        toast('Reset to defaults (unsaved)', 'info');
    } catch (e) { toast('Failed to reset settings', 'error'); }
}

async function applyPreset(id) {
    if (!id) return;
    try {
        const presets = await API.get('/api/servers/defaults/presets');
        const p = presets[id]; if (!p) return;
        const def = await API.get('/api/servers/defaults/settings');
        state.currentSettings = { ...def, ...p.settings };
        renderSettings(state.currentSettings, $('#settings-search')?.value || '');
        toast(`Applied "${p.label}" preset (unsaved)`, 'info');
    } catch (e) { toast('Failed to apply preset', 'error'); }
    $('#settings-preset').value = '';
}

function connectConsole(serverId, retries = 5) {
    if (state.consoleWs) { state.consoleWs.close(); state.consoleWs = null; }
    const output = $('#console-output');
    if (!output) return;
    output.innerHTML = '';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/console/${serverId}`);
    state.consoleWs = ws;
    ws.onmessage = e => { if (e.data !== '__PING__') appendLog(e.data); };
    ws.onclose = () => {
        state.consoleWs = null;
        if (retries > 0) setTimeout(() => connectConsole(serverId, retries - 1), 2000);
    };
    ws.onerror = () => { state.consoleWs = null; };
}

function appendLog(text) {
    const output = $('#console-output');
    const filter = ($('#console-filter')?.value || '').toLowerCase();
    const span = document.createElement('span');
    span.className = 'log-line';
    const lo = text.toLowerCase();
    if (/error|fail|fatal|critical|exception|traceback/.test(lo)) span.classList.add('log-error');
    else if (/warn|warning/.test(lo)) span.classList.add('log-warn');
    else if (/success|complete|loaded|started|connected|ready|done/.test(lo)) span.classList.add('log-success');
    else if (/debug|trace|verbose/.test(lo)) span.classList.add('log-debug');
    else if (/minecraft|server|world|chunk|block|player|entity|tick/.test(lo)) span.classList.add('log-mc');
    else if (/^\[.*\]\s*$/.test(text) || text.length < 3) span.classList.add('log-dim');
    span.textContent = text;
    if (filter && !lo.includes(filter)) { span.style.display = 'none'; span.dataset.filtered = 'true'; }
    output.appendChild(span);
    output.appendChild(document.createTextNode('\n'));
    while (output.children.length > 2000) { output.removeChild(output.firstChild); }
    if ($('#console-autoscroll')?.checked) output.scrollTop = output.scrollHeight;
}

let consoleHistory = [], consoleHistoryIdx = -1;

async function sendCommand() {
    const input = $('#console-input');
    const cmd = input.value.trim();
    if (!cmd) return;
    consoleHistory.unshift(cmd);
    if (consoleHistory.length > 100) consoleHistory.pop();
    consoleHistoryIdx = -1;
    appendLog(`> ${cmd}`);
    try { await API.post(`/api/servers/${state.activeServerId}/command`, { command: cmd }); }
    catch (e) { toast('Failed to send command', 'error'); }
    input.value = ''; input.focus();
}

$('#console-input').addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (consoleHistory.length === 0) return;
        consoleHistoryIdx = e.key === 'ArrowUp'
            ? Math.min(consoleHistoryIdx + 1, consoleHistory.length)
            : Math.max(consoleHistoryIdx - 1, -1);
        const idx = consoleHistory.length - consoleHistoryIdx;
        $('#console-input').value = (idx >= 0 && idx < consoleHistory.length) ? consoleHistory[idx] : '';
    }
});

function filterConsole() {
    const filter = ($('#console-filter')?.value || '').toLowerCase();
    const lines = $$('#console-output .log-line');
    let count = 0;
    lines.forEach(el => {
        if (!filter) { el.style.display = ''; delete el.dataset.filtered; count++; }
        else {
            const match = el.textContent.toLowerCase().includes(filter);
            el.style.display = match ? '' : 'none';
            el.dataset.filtered = match ? 'false' : 'true';
            if (match) count++;
        }
    });
    const hint = $('#console-filter-hint');
    if (hint) {
        if (filter && lines.length > 0) hint.textContent = `${count} / ${lines.length} lines`;
        else hint.textContent = '';
    }
}

async function checkJavaStatus() {
    try {
        const r = await API.get('/api/install/java/status');
        const el = $('#java-status-text'), dot = $('#java-dot');
        if (el) { el.textContent = r.installed ? 'Java Installed & Ready' : 'Java Not Found'; el.style.color = r.installed ? 'var(--success)' : 'var(--danger)'; }
        if (dot) dot.className = 'install-dot ' + (r.installed ? 'ok' : 'bad');
    } catch (e) { console.warn('[CraftForge] checkJavaStatus failed', e); }
}

async function installServer() {
    const output = $('#install-output');
    const btn = $('#btn-install-server');
    output.style.display = 'block';
    output.textContent = 'Connecting…\n';
    if (state.installWs) state.installWs.close();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/install/${state.activeServerId}`);
    state.installWs = ws;
    ws.onmessage = e => {
        output.textContent += e.data + '\n';
        output.scrollTop = output.scrollHeight;
        if (e.data.startsWith('__COMPLETE__')) { ws.close(); toast('Server installed', 'success'); loadServers().then(() => { const sv = state.servers.find(x => x.id === state.activeServerId); if (sv) renderServerView(sv); }); }
        if (e.data.startsWith('ERROR')) { toast(e.data, 'error'); }
    };
    ws.onclose = () => { state.installWs = null; btn.disabled = false; btn.textContent = 'Install / Update Minecraft Server'; };
    ws.onerror = () => { state.installWs = null; btn.disabled = false; btn.textContent = 'Install / Update Minecraft Server'; };
    btn.disabled = true; btn.textContent = 'Installing…';
}

async function updateSystemInfo() {
    try {
        const i = await API.get('/api/system');
        $('#sys-cpu').textContent = `CPU ${i.cpu_percent || 0}%`;
        $('#sys-ram').textContent = `RAM ${i.memory_percent || 0}%`;
    } catch (e) { console.warn('[CraftForge] updateSystemInfo failed', e); }
}

async function updateConnectionInfo() {
    if (!state.activeServerId) return;
    try {
        const net = await API.get('/api/system/network');
        const port = state.servers.find(x => x.id === state.activeServerId)?.port || 25565;
        const lanEl = document.getElementById('conn-lan'); const wanEl = document.getElementById('conn-wan'); const portEl = document.getElementById('conn-port');
        if (lanEl) lanEl.textContent = `${net.local_ip}:${port}`;
        if (wanEl) wanEl.textContent = net.public_ip && net.public_ip !== 'Unknown' ? `${net.public_ip}:${port}` : '—';
        if (portEl) portEl.textContent = port;
    } catch (e) { console.warn('[CraftForge] updateConnectionInfo failed', e); }
}

function showModal(title, bodyHtml, onConfirm, confirmText = 'Confirm', confirmClass = 'btn-primary') {
    const overlay = $('#modal-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
    $('#modal-confirm').className = `btn ${confirmClass}`;
    $('#modal-confirm').textContent = confirmText;
    const origConfirm = onConfirm;
    $('#modal-confirm').onclick = async () => {
        $('#modal-confirm').disabled = true;
        try { await origConfirm(); } catch (e) { console.warn('[CraftForge] modal action failed', e); }
        $('#modal-confirm').disabled = false;
        hideModal();
    };
    $('#modal-cancel').onclick = hideModal;
    overlay.onclick = e => { if (e.target === overlay) hideModal(); };
    document.addEventListener('keydown', function escHandler(e) { if (e.key === 'Escape') { hideModal(); document.removeEventListener('keydown', escHandler); } });
    setTimeout(() => { const inp = overlay.querySelector('input'); if (inp) inp.focus(); }, 120);
}

function hideModal() {
    const overlay = $('#modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function showShortcutsHelp() {
    showModal('Keyboard Shortcuts',
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;font-size:12px">
            <div><kbd class="shortcut-key">N</kbd> <span style="color:var(--text-secondary)">New server</span></div>
            <div><kbd class="shortcut-key">F2</kbd> <span style="color:var(--text-secondary)">Rename server</span></div>
            <div><kbd class="shortcut-key">?</kbd> <span style="color:var(--text-secondary)">This help</span></div>
            <div><kbd class="shortcut-key">Esc</kbd> <span style="color:var(--text-secondary)">Close modal</span></div>
            <div><kbd class="shortcut-key">↑↓</kbd> <span style="color:var(--text-secondary)">Navigate console history</span></div>
            <div><kbd class="shortcut-key">Enter</kbd> <span style="color:var(--text-secondary)">Send command / Confirm</span></div>
        </div>`,
        () => {}, 'Close');
    $('#modal-confirm').className = 'btn btn-outline';
}

async function showNewServerModal() {
    showModal('Create New Server',
        `<div class="modal-body-field"><label for="modal-name">Server Name</label><input type="text" id="modal-name" placeholder="My Minecraft Server" autofocus /></div>
         <div class="modal-body-field"><label for="modal-port">Port</label><input type="number" id="modal-port" value="25565" min="1024" max="65535" /></div>
         <div class="modal-body-field"><label for="modal-players">Max Players</label><input type="number" id="modal-players" value="20" min="1" max="100" /></div>`,
        async () => {
            const name = document.getElementById('modal-name').value.trim() || 'Unnamed Server';
            const port = parseInt(document.getElementById('modal-port').value, 10);
            const players = parseInt(document.getElementById('modal-players').value, 10);
            if (isNaN(port) || port < 1024 || port > 65535) { toast('Port must be 1024-65535', 'error'); return; }
            if (isNaN(players) || players < 1) { toast('Max players must be at least 1', 'error'); return; }
            const s = await API.post('/api/servers', { name, port });
            if (!s || !s.id) { toast('Server creation failed', 'error'); return; }
            await API.put(`/api/servers/${s.id}/settings`, { settings: { 'max-players': players, motd: name, 'server-port': port } });
            await loadServers();
            selectServer(s.id);
            toast(`"${name}" created`, 'success');
        }, 'Create Server');
}

async function deleteServer() {
    const s = state.servers.find(x => x.id === state.activeServerId);
    if (!s) return;
    showModal('Delete Server',
        `<p>Permanently delete <strong style="color:var(--text-primary)">${E(s.name)}</strong>?</p><p style="margin-top:8px;color:var(--danger);font-size:11px;">This cannot be undone. Server files remain on disk.</p>`,
        async () => { await API.del(`/api/servers/${state.activeServerId}`); state.activeServerId = null; await loadServers(); showEmptyState(); toast('Server deleted', 'info'); },
        'Delete', 'btn-danger');
}

document.addEventListener('input', e => {
    if (e.target.id === 'sidebar-search') renderServerList();
    if (e.target.id === 'settings-search') {
        clearTimeout(settingsSearchDebounce);
        settingsSearchDebounce = setTimeout(() => renderSettings(state.currentSettings, e.target.value), 150);
    }
    if (e.target.id === 'console-filter') filterConsole();
});

document.addEventListener('change', e => {
    if (e.target.id === 'settings-preset') applyPreset(e.target.value);
});

document.addEventListener('click', e => {
    if (e.target.classList.contains('tab')) {
        const name = e.target.dataset.tab;
        if (e.target.classList.contains('active')) return;
        $$('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        $$('.tab-pane').forEach(p => p.classList.remove('active'));
        const pane = document.getElementById(`tab-${name}`);
        if (pane) pane.classList.add('active');
        if (name === 'settings') loadSettings();
        if (name === 'console') { connectConsole(state.activeServerId); filterConsole(); }
        if (name === 'install') checkJavaStatus();
    }
});

$('#server-list').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) selectServer(li.dataset.id); });
$('#server-list').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const li = e.target.closest('li[data-id]'); if (li) selectServer(li.dataset.id); } });

$('#btn-new-server').addEventListener('click', showNewServerModal);
$('#btn-empty-create').addEventListener('click', showNewServerModal);
$('#btn-rename').addEventListener('click', showRenameModal);

document.addEventListener('click', e => {
    if (e.target.classList.contains('conn-copy')) {
        const key = e.target.dataset.target;
        const el = document.getElementById(key);
        if (!el) return;
        navigator.clipboard.writeText(el.textContent).then(() => {
            const btn = e.target;
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.color = 'var(--success)';
            btn.style.borderColor = 'rgba(34,197,94,0.3)';
            setTimeout(() => { btn.textContent = orig; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
        });
    }
});

const withLoading = (btnId, action, label, okMsg, errMsg) => {
    const btn = $(btnId);
    btn.addEventListener('click', async () => {
        btn.disabled = true; const orig = btn.textContent;
        btn.innerHTML = '<span class="btn-working">●</span> Working…';
        try { await action(); toast(okMsg, 'success'); } catch (e) { toast(errMsg, 'error'); }
        await loadServers();
        if (state.activeServerId) {
            const s = state.servers.find(x => x.id === state.activeServerId);
            if (s) { renderServerView(s); if (s.status === 'running') { startUptimeTick(s); connectConsole(state.activeServerId); } }
        }
        btn.disabled = false; btn.textContent = label;
    });
};

withLoading('#btn-start', () => API.post(`/api/servers/${state.activeServerId}/start`), '▶ Start', 'Server starting…', 'Failed to start');
withLoading('#btn-stop', () => API.post(`/api/servers/${state.activeServerId}/stop`), '■ Stop', 'Server stopped', 'Failed to stop');
withLoading('#btn-restart', () => API.post(`/api/servers/${state.activeServerId}/restart`), '↻ Restart', 'Server restarting…', 'Failed to restart');

$('#btn-delete').addEventListener('click', deleteServer);
$('#btn-save-settings').addEventListener('click', saveSettings);
$('#btn-reset-settings').addEventListener('click', resetSettings);
$('#btn-clear-console').addEventListener('click', () => { $('#console-output').innerHTML = ''; $('#console-filter').value = ''; filterConsole(); });
$('#btn-install-server').addEventListener('click', installServer);

$('#console-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendCommand(); });

document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); showNewServerModal(); }
    if (e.key === 'F2' && state.activeServerId) { e.preventDefault(); showRenameModal(); }
    if (e.key === '?' || (e.key === '/')) { e.preventDefault(); showShortcutsHelp(); }
    if (e.key === 'Escape') {
        const overlay = $('#modal-overlay');
        if (overlay.style.display !== 'none') hideModal();
    }
});

// Show shortcuts hint in sidebar footer
document.addEventListener('DOMContentLoaded', () => {
    const footer = document.querySelector('.sidebar-footer-text');
    if (footer) footer.innerHTML = 'Press <kbd style="font-size:7px;padding:1px 4px;border-radius:3px;background:var(--border);color:var(--text-muted);font-family:var(--font-mono)">?</kbd> for shortcuts · Minecraft Server Manager';
});

setInterval(loadServers, 6000);
state.systemInterval = setInterval(() => { updateSystemInfo(); updateConnectionInfo(); }, 10000);

Promise.all([loadServers(), updateSystemInfo(), updateConnectionInfo()]).then(() => {
    if (state.servers.length > 0 && !state.activeServerId) {
        const first = state.servers.find(s => s.installed) || state.servers[0];
        selectServer(first.id);
    }
});

// Periodic button state refresh (keeps UI in sync without full reload)
setInterval(() => {
    if (state.activeServerId) {
        const sv = state.servers.find(x => x.id === state.activeServerId);
        if (sv) {
            $('#btn-start').disabled = sv.status !== 'stopped' || !sv.installed;
            $('#btn-stop').disabled = sv.status !== 'running';
            $('#btn-restart').disabled = sv.status !== 'running';
        }
    } else {
        $('#btn-start').disabled = true; $('#btn-stop').disabled = true; $('#btn-restart').disabled = true;
    }
}, 3000);

// Tooltip system for setting fields
let activeTipField = null;
document.addEventListener('mouseover', e => {
    const field = e.target.closest('.setting-field[data-tip]');
    if (field === activeTipField) return;
    if (activeTipField && activeTipField._tipEl) { activeTipField._tipEl.classList.remove('visible'); }
    activeTipField = field;
    if (!field) return;
    let tip = field._tipEl;
    if (!tip) {
        tip = document.createElement('div'); tip.className = 'setting-tooltip';
        tip.textContent = field.dataset.tip; document.body.appendChild(tip);
        field._tipEl = tip;
    }
    const rect = (field.querySelector('.setting-field-label') || field).getBoundingClientRect();
    const left = rect.right + 14;
    const fits = left + 260 < window.innerWidth;
    tip.style.top = (rect.top - 8 + rect.height / 2) + 'px';
    tip.style.left = fits ? left + 'px' : (rect.left - 270) + 'px';
    tip.classList.add('visible');
}, true);

$('#btn-send-command').addEventListener('click', sendCommand);

// Re-apply console filter on reconnect
const _origConnectConsole = connectConsole;
connectConsole = function(id, retries) {
    _origConnectConsole.call(this, id, retries);
    setTimeout(filterConsole, 500);
};
