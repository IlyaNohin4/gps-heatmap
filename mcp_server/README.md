# gps-heatmap MCP server

Exposes POI and track management to any MCP-compatible AI client (Claude
Desktop, Claude Code, Cursor, Windsurf, Cline, ...) via the Model Context
Protocol. Runs entirely in Docker — nothing to install on the host.

It's a thin wrapper: every tool calls the existing FastAPI backend over HTTP,
so all validation and business logic stays in one place.

## Tools

- **POI**: `list_poi`, `get_poi_categories`, `create_poi`, `update_poi`, `delete_poi`
- **Tracks**: `list_tracks`, `get_track`, `upload_track`, `rename_track`, `delete_track`
- **Export**: `export_track` (optionally embeds your own POIs within a radius of the
  route as waypoints — useful for OsmAnd)

## Setup

1. Get a JWT for your account (valid 30 days):
   ```bash
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "you@example.com", "password": "..."}'
   ```
2. Copy the env file and fill in the token:
   ```bash
   cp mcp_server/.env.example mcp_server/.env
   # edit mcp_server/.env, paste the access_token
   ```
3. Build the image:
   ```bash
   docker compose --profile mcp build mcp_server
   ```

## File exchange

`upload_track` and `export_track` work with files under `/data` inside the
container, which is `mcp_server/data/` on the host. Place files to upload
there first; exported files will show up there too.

## Connecting a client

The server speaks standard MCP over stdio, so it isn't tied to any one
vendor — any MCP-compatible client works, as long as it can spawn a
command and talk JSON-RPC over its stdin/stdout. In every case the
command is the same:

```json
{
  "command": "docker",
  "args": [
    "compose", "-f", "/absolute/path/to/gps-heatmap/docker-compose.yml",
    "--profile", "mcp", "run", "--rm", "-T", "mcp_server"
  ]
}
```

**Claude Desktop** — add under `mcpServers` in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "gps-heatmap": { "command": "docker", "args": [ "..." ] }
  }
}
```

**Claude Code** — same shape via `claude mcp add`, or add directly to its
MCP config file.

**Cursor** — `.cursor/mcp.json`, under `mcpServers`, same shape as above.

**Windsurf** — its MCP config file (Windsurf Settings → MCP Servers), same shape.

**Cline** (VS Code extension) — its MCP servers settings panel, same shape.

The backend (and its Postgres/Redis) must already be running
(`docker compose up -d`) — the MCP server only talks to it, it doesn't start it.

> **Not manually verified:** only the raw protocol was tested directly
> (JSON-RPC over stdio via a Python script) — `initialize`, `tools/list`,
> and a `create_poi`/`list_poi`/`delete_poi`/`get_track`/`export_track`
> round-trip all worked against the real backend. None of the client
> integrations above (Claude Desktop, Claude Code, Cursor, Windsurf,
> Cline) have actually been opened and clicked through — the config
> shapes are correct per each tool's documented format, but untested
> end-to-end. Try one and report back if something's off.

## Notes

- Personal-tool scope: one JWT, one user. Token expires after 30 days —
  regenerate via `/api/auth/login` and update `.env` when it does.
- `poi_radius_m` on `export_track` embeds real POIs near the route, not
  synthetic distance markers — see the main `POLISH.md` for background.
