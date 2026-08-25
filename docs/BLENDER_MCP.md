# Blender MCP

This project uses Blender Labs' official Blender MCP v1.0.0 with Blender 5.1 or newer.
Codex starts the stdio MCP process automatically from this project's `.codex/config.toml`.
That process connects only to the Blender add-on at `127.0.0.1:9876`.

Installed on this workstation:

- Blender: `/Applications/Blender.app` (validated with 5.1.1)
- Official source: release `v1.0.0`, commit `03004fd0216bfe5e0a3d9ac9b47d5efadc3d78c4`
- MCP executable: `~/.local/bin/blender-mcp`
- Isolated uv tool: `~/.local/share/uv/tools/blender-mcp`
- Blender add-on: `~/Library/Application Support/Blender/5.1/extensions/user_default/mcp`

The official v1.0.0 package's unconstrained `mcp>=1.2.0` dependency currently resolves
to an incompatible 2.x release. This installation therefore pins the isolated tool to
the compatible MCP 1.x line (validated with 1.29.1); system Python is unchanged.

## Start or reconnect

1. Open Blender 5.1+ without an important unsaved production scene.
2. In **Blender > Settings > Add-ons > MCP**, confirm the add-on is enabled.
3. Confirm **Host** is `localhost`, **Port** is `9876`, and **Auto Start** is enabled.
4. If the panel says the server is stopped, select **Start MCP Bridge Server**.
5. Start a new Codex task from this repository. In Codex, use `/mcp` or run
   `codex mcp list` in this directory to confirm `blender` is available.

Blender executes MCP-provided Python inside the active Blender process. Save or back up
important `.blend` files before allowing edits, review tool approvals, and keep the bridge
on localhost. The project config deliberately prompts before Blender MCP tool calls.

## Troubleshooting

- **Blender MCP is not running:** Open the MCP add-on settings and select **Start MCP
  Bridge Server**. Blender must remain open.
- **Codex cannot see `blender`:** Trust this repository if Codex asks, then restart the
  Codex task so it reloads `.codex/config.toml`.
- **Port 9876 is occupied:** Run `lsof -nP -iTCP:9876 -sTCP:LISTEN` and stop the stale
  local process. Keep both Blender and `.codex/config.toml` on the same localhost port.
- **The extension is disabled:** In Blender's Add-ons settings, search for `MCP`, enable
  the Blender Lab add-on, and save preferences.
- **After restarting Blender:** Auto Start normally reopens the bridge after one second.
  If it does not, use **Start MCP Bridge Server**, then restart the Codex task.

No Sketchfab, Poly Haven, cloud generation, or external 3D service is enabled by this setup.

## Rebuild the visual GLB

The renderer loads `public/models/aion-h1s.glb`. Names, axes, and materials must match
[`VISUAL_MODEL_CONTRACT.md`](VISUAL_MODEL_CONTRACT.md). With Blender open and the MCP
bridge listening:

```bash
python3 tools/blender/mcp_exec.py tools/blender/build_aion_visual.py
```

That script clears the current Blender scene, authors the 13 rigid-link AION nodes, writes
`assets/blender/aion-h1s.blend`, exports the GLB with `export_yup=False`, and updates
`src/assets/aion-h1s.manifest.json`. It refuses to run when Blender has unsaved changes or
an unrelated file open. Use a clean default startup scene or open the saved AION `.blend`.
