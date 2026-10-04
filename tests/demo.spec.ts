import { expect, test, type Page } from '@playwright/test';
import { verifyEvent } from 'nostr-tools/pure';

async function mockRelay(page: Page, respond = true) {
  const sent: { client: string; purpose: string; sequence: number; id: string }[] = [];
  await page.routeWebSocket('wss://yabu.me/', (socket) => {
    socket.onMessage((data) => {
      const [type, event] = JSON.parse(String(data));
      expect(type).toBe('EVENT');
      expect(event.kind).toBe(20000);
      expect(verifyEvent(event)).toBe(true);
      sent.push({ ...JSON.parse(event.content), id: event.id });
      if (respond) socket.send(JSON.stringify(['OK', event.id, true, '']));
    });
  });
  return sent;
}

async function open(page: Page) {
  await page.clock.install();
  await page.goto('./');
  await expect(page.locator('.log-open')).toHaveCount(2);
}

test('both clients send signed ephemeral heartbeats every five seconds and log replies', async ({ page }) => {
  const sent = await mockRelay(page);
  await open(page);
  await page.clock.runFor(4_900);
  expect(sent).toHaveLength(0);
  await page.clock.runFor(100);
  await expect.poll(() => sent.length).toBe(2);
  await expect(page.locator('.log-receive')).toHaveCount(2);
  await page.clock.runFor(5_000);
  await expect.poll(() => sent.length).toBe(4);
  expect(sent.filter((event) => event.client === 'A')).toHaveLength(2);
  expect(sent.filter((event) => event.client === 'B')).toHaveLength(2);
  expect(new Set(sent.map((event) => event.id)).size).toBe(4);
  await expect(page.locator('.log-send')).toHaveCount(4);
});

test('only A probes on browser lifecycle recovery; both drop and reconnect', async ({ page }) => {
  const sent = await mockRelay(page);
  await open(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.clock.runFor(100);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ client: 'A', purpose: 'lifecycle probe' });
  await expect(page.locator('.log-receive')).toHaveCount(1);
  await page.getByRole('button', { name: 'drop A + B' }).click();
  await expect(page.locator('.log-drop')).toHaveCount(2);
  await page.clock.runFor(1_100);
  await expect(page.locator('.log-open')).toHaveCount(4);
  await page.clock.runFor(5_000);
  await expect.poll(() => sent.filter((event) => event.purpose === 'heartbeat').length).toBe(2);
});

test('missing lifecycle probe reply drops A, while B remains connected until heartbeat timeout', async ({ page }) => {
  await mockRelay(page, false);
  await open(page);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.clock.runFor(100);
  await expect(page.locator('.log-send')).toHaveCount(1);
  await page.clock.runFor(5_000);
  await expect(page.locator('.log-drop')).toHaveCount(1);
  await expect(page.locator('.log-drop')).toHaveAttribute('data-client', 'A');
  await expect(page.locator('.log-drop')).toContainText('browser-lifecycle/probe-timeout');
  await expect(page.locator('#status-b')).toHaveText('接続成功');
  await page.clock.runFor(5_000);
  await expect(page.locator('.log-drop[data-client="B"]')).toHaveCount(1);
  await expect(page.locator('.log-drop[data-client="B"]')).toContainText('heartbeat/response-timeout');
});
