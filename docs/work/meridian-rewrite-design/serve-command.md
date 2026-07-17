# `meridian artifact serve` — artifact serving via tailscale

Thin wrapper. Path-based routing on a single port, 2h TTL, lazy gc.

## Usage

```
meridian artifact serve [dir]              # serve dir, 2h TTL
meridian artifact serve [dir] --slug foo   # explicit path slug
meridian artifact serve [dir] --funnel     # public URL (not just tailnet)
meridian artifact list                     # show active serves with age + TTL remaining
meridian artifact stop [slug]              # stop one
meridian artifact gc                       # manually kill anything past TTL
```

## URL shape

All artifacts share one dedicated tailscale port (default 8400, configurable),
routed by path. Doesn't claim 443 — that's for real services.

```
https://pop-os.tail852a76.ts.net:8400/voluma-design/
https://pop-os.tail852a76.ts.net:8400/api-docs/
https://pop-os.tail852a76.ts.net:8400/sprint-review/
```

Slug derived from (in order): `--slug` flag, work-item id, directory name.

## GC behavior

Every `meridian artifact serve` call does a quick sweep first:
1. Read `serves.json`
2. For each entry where `created + ttl < now`: remove tailscale path, kill pid, remove entry
3. Then proceed with the new serve

`meridian artifact gc` does the same sweep standalone.

## Mechanics

1. Sweep expired serves (lazy gc)
2. Derive slug from work-item or dir name
3. Pick random LOCAL port (internal only, not exposed)
4. Start static HTTP server on `localhost:<local-port>`
5. `tailscale serve --bg --https=8400 --set-path /<slug> http://127.0.0.1:<local-port>`
6. Register in `~/.meridian/serves.json`
7. Print URL: `https://<machine>.ts.net:8400/<slug>/`

## State file (`~/.meridian/serves.json`)

```json
[
  {
    "slug": "voluma-design",
    "local_port": 52341,
    "dir": "/home/user/.meridian/.../site",
    "work_id": "meridian-rewrite-design",
    "created": "2026-07-10T14:30:00Z",
    "ttl_seconds": 7200,
    "funnel": false,
    "pid": 12345
  }
]
```

## Design decisions

- **Path-based, single port**: one URL root, readable slugs, no port to remember
- **2h default TTL**: long enough to share during a session, short enough to not accumulate
- **Random local port**: internal only — tailscale handles the external routing by path
- **Lazy gc on serve**: expired entries cleaned up as side effect — no cron, no daemon
- **`meridian artifact gc`**: manual escape hatch for cleanup without serving
- **`tailscale serve reset`**: always the nuclear option — re-serving is one command
