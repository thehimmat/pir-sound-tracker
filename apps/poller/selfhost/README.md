# Poller on Oracle

The poller's home after Fly.io: one container on the Oracle VM `kosh-db` (Ashburn, Ampere A1,
`141.148.39.45`), next to gurmukhi-kosh's stack and the radio, which share Always Free's whole A1
allowance. Fly cost about $5 a month for this machine alone.

- **Code and settings on the server:** `/opt/pir` (main). Secrets in
  `/opt/pir/apps/poller/selfhost/.env` (mode 600, gitignored): `IMAGE_URL`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, the same set Fly had.
- **Way in:** `https://pir.141-148-39-45.sslip.io` (`/ping`, `/health`, `/ws`) through
  gurmukhi-kosh's gateway (`selfhost/sites/pir.caddy`), which reaches the poller over the `pir-edge`
  Docker network and nothing else. Let's Encrypt; not behind Cloudflare.
- **Image:** built on the VM from this repo (arm64), with `apps/poller/eng.traineddata`, which is
  gitignored and copied over once.
- **Database:** still Supabase (`pir-sound-tracker` project); only the poller moved.

| File | What it does |
|---|---|
| `docker-compose.yml` | The poller (port 8080, published on localhost as 3003), project name `pir` |
| `scripts/deploy.sh` | Pull main, rebuild, start, check `/health` |

`src/__tests__/selfhost.test.ts` covers both.

## Setup (once)

From the Mac, in a checkout that has `apps/poller/eng.traineddata`:

```sh
ssh ubuntu@141.148.39.45 'sudo install -d -o ubuntu -g ubuntu /opt/pir && git clone -q https://github.com/thehimmat/pir-sound-tracker /opt/pir'
scp apps/poller/eng.traineddata ubuntu@141.148.39.45:/opt/pir/apps/poller/
# Secrets: the same values as Fly's (fly ssh console -a pir-sound-tracker-poller -C env)
ssh ubuntu@141.148.39.45 '(umask 077 && cat > /opt/pir/apps/poller/selfhost/.env)' < poller.env
ssh ubuntu@141.148.39.45 'sh /opt/pir/apps/poller/selfhost/scripts/deploy.sh'
```

The gateway needs gurmukhi-kosh's `pir.caddy` and `pir-edge` network deployed first; until then
the public name answers 502.

## Deploy

```sh
ssh ubuntu@141.148.39.45 'sh /opt/pir/apps/poller/selfhost/scripts/deploy.sh'
```

## Day to day

```sh
ssh ubuntu@141.148.39.45 'cd /opt/pir/apps/poller/selfhost && docker compose logs --tail 100 poller'
ssh ubuntu@141.148.39.45 'docker stats --no-stream'
curl -s https://pir.141-148-39-45.sslip.io/health
```

## Rollback to Fly

Start the stopped machine (Fly dashboard → pir-sound-tracker-poller → Machines → Start), and set the
Vercel variable `VITE_WS_URL` to `wss://pir-sound-tracker-poller.fly.dev/ws`, then redeploy the web
app. Stop this one first (`docker compose stop` here), or both will write every reading twice.
