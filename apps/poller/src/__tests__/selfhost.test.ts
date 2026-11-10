import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The poller on Oracle (apps/poller/selfhost/README.md): its own Compose project on kosh-db,
// reached through atthebunga-server's gateway (sites/pir.caddy) over the pir-edge network.
// Compiled to dist/__tests__, so apps/poller is two levels up.
const poller = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(join(poller, p), 'utf8');

describe('selfhost/docker-compose.yml', () => {
  const compose = read('selfhost/docker-compose.yml');

  it('is its own Compose project, so it never mixes with kosh or the radio on the same VM', () => {
    assert.match(compose, /^name: pir$/m);
  });

  it('builds the image from the monorepo root, like the Fly deploy did', () => {
    assert.match(compose, /^ {6}context: \.\.\/\.\.\/\.\.$/m);
    assert.match(compose, /^ {6}dockerfile: apps\/poller\/Dockerfile$/m);
  });

  it('joins only the gateway network, under the name the gateway proxies to', () => {
    assert.match(compose, /^ {6}pir-edge:\n {8}aliases: \[pir-poller\]$/m);
    assert.match(compose, /^networks:\n {2}pir-edge:\n {4}external: true$/m);
  });

  it('publishes its port on localhost only (the public way in is the gateway)', () => {
    assert.match(compose, /- "127\.0\.0\.1:3003:8080"/);
    assert.doesNotMatch(compose, /- "(0\.0\.0\.0:)?\d+:8080"/);
  });

  it('restarts on its own and checks /ping, as Fly did', () => {
    assert.match(compose, /restart: unless-stopped/);
    assert.match(compose, /\/ping/);
  });

  it('keeps secrets in the gitignored .env next to it', () => {
    assert.match(compose, /env_file: \.env/);
    assert.match(read('selfhost/.gitignore'), /^\.env$/m);
  });

  it('caps memory, since the VM is shared with the database and other apps', () => {
    assert.match(compose, /mem_limit: \d+m/);
  });
});

describe('selfhost/scripts/deploy.sh', () => {
  // A fake checkout without the gitignored Tesseract model.
  function fakeCheckout(withModel: boolean): string {
    const dir = mkdtempSync(join(tmpdir(), 'pir-deploy-'));
    mkdirSync(join(dir, 'selfhost/scripts'), { recursive: true });
    writeFileSync(join(dir, 'selfhost/scripts/deploy.sh'), read('selfhost/scripts/deploy.sh'));
    if (withModel) writeFileSync(join(dir, 'eng.traineddata'), 'model');
    return dir;
  }

  function run(dir: string): { status: number; out: string } {
    try {
      const out = execFileSync('sh', [join(dir, 'selfhost/scripts/deploy.sh')], {
        env: { ...process.env, PIR_DEPLOY_DRY_RUN: '1' },
        stdio: 'pipe',
      }).toString();
      return { status: 0, out };
    } catch (e) {
      const err = e as { status: number; stderr: Buffer };
      return { status: err.status, out: err.stderr.toString() };
    }
  }

  it('refuses to build without the Tesseract model (gitignored, so it has to be copied over)', () => {
    const { status, out } = run(fakeCheckout(false));
    assert.equal(status, 1);
    assert.match(out, /eng\.traineddata/);
  });

  it('updates, builds, starts and checks health, in that order', () => {
    const { status, out } = run(fakeCheckout(true));
    assert.equal(status, 0);
    const steps = out.trim().split('\n');
    assert.deepEqual(steps.map(s => s.split(' ')[0]), ['git', 'docker', 'curl']);
    assert.match(steps[1], /docker compose up -d --build --wait/);
    assert.match(steps[2], /127\.0\.0\.1:3003\/health/);
  });
});
