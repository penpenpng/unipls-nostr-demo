import { finalizeEvent, generateSecretKey, type Event } from 'nostr-tools/pure';
import { Unipls, UniplsTimeoutError } from 'unipls';
import {
  BrowserLifecycleDropDetector,
  BrowserLifecycleSource,
  DropReasons,
  type UniplsDropDetector,
} from 'unipls/drop-detectors';
import { ExponentialBackoffReconnector } from 'unipls/reconnectors';

export type ClientName = 'A' | 'B';
type Purpose = 'heartbeat' | 'lifecycle probe';
type Input = ['EVENT', Event];
type Output = unknown[];
export interface LogEntry {
  client: ClientName;
  type: 'send' | 'receive' | 'open' | 'drop' | 'error';
  text: string;
}

const INTERVAL = 10_000;
const TIMEOUT = 5_000;

export function createDemo(
  log: (entry: LogEntry) => void,
  status: (client: ClientName, phase: string) => void,
) {
  function createClient(name: ClientName) {
    // A new anonymous key for each client and page load; never saved or exported.
    const secretKey = generateSecretKey();
    let sequence = 0;
    const pending = new Map<string, { purpose: Purpose; sequence: number }>();
    const emit = (type: LogEntry['type'], text: string) => log({ client: name, type, text });
    function createProbe(purpose: Purpose) {
      const number = ++sequence;
      const event = finalizeEvent({
        kind: 20000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify({ app: 'unipls-nostr-demo', client: name, purpose, sequence: number, nonce: crypto.randomUUID() }),
      }, secretKey);
      return {
        query: ['EVENT', event] as Input,
        // A rejection also proves a round trip. Log acceptance separately.
        selector: (message: Output) => message[0] === 'OK' && message[1] === event.id,
      };
    }

    // Log only after the browser's send() succeeds, including detector traffic.
    class LoggedWebSocket extends WebSocket {
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        super.send(data);
        if (typeof data !== 'string') return;
        const [, event] = JSON.parse(data) as Input;
        const info = JSON.parse(event.content) as { purpose: Purpose; sequence: number };
        pending.set(event.id, info);
        emit('send', `${info.purpose} 送信 #${info.sequence} · ${event.id.slice(0, 12)}`);
      }
    }

    // Fixed cadence: response latency does not extend the ten-second interval.
    const heartbeat: UniplsDropDetector<Input, Output> = {
      name: 'heartbeat',
      setup(ctx) {
        const timer = setInterval(() => {
          ctx.run(async (signal) => {
            try {
              await ctx.request({ ...createProbe('heartbeat'), timeout: TIMEOUT, signal });
            } catch (error) {
              if (signal.aborted) return;
              if (error instanceof UniplsTimeoutError) {
                ctx.drop({ reason: DropReasons.HEARTBEAT_RESPONSE_TIMEOUT });
              } else {
                throw error;
              }
            }
          });
        }, INTERVAL);
        ctx.defer(() => clearInterval(timer));
        ctx.signal.addEventListener('abort', () => clearInterval(timer), { once: true });
      },
    };
    const detectors = [heartbeat];
    if (name === 'A') {
      detectors.push(new BrowserLifecycleDropDetector<Input, Output>({
        name: 'browser-lifecycle',
        source: new BrowserLifecycleSource(),
        createProbe: () => createProbe('lifecycle probe'),
        timeout: TIMEOUT,
      }));
    }
    const client = new Unipls<Input, Output>({
      url: 'wss://yabu.me',
      WebSocket: LoggedWebSocket,
      serializer: JSON.stringify,
      deserializer: (data) => JSON.parse(String(data)) as Output,
      dropDetectors: detectors,
      // Keep recovery identical to isolate the dropdetector comparison.
      reconnector: new ExponentialBackoffReconnector({ initialDelay: 1_000, maxDelay: 10_000 }),
    });
    client.on('open', ({ connection }) => emit('open', `接続成功 · connection ${connection}`));
    client.on('message', ({ message }) => {
      if (message[0] === 'OK' && typeof message[1] === 'string') {
        const info = pending.get(message[1]);
        if (!info) return;
        pending.delete(message[1]);
        emit('receive', `${info.purpose} 応答受信 #${info.sequence} · ${message[2] === true ? 'accepted' : 'rejected'}${message[3] ? ` · ${message[3]}` : ''}`);
      } else if (message[0] === 'NOTICE' || message[0] === 'AUTH') {
        emit('error', `relay ${message[0]} · ${message[1]}`);
      }
    });
    client.on('dropped', ({ drop }) => {
      pending.clear();
      emit('drop', `切断検出 · ${JSON.stringify(drop.source)}`);
    });
    client.on('failed', ({ error }) => emit('error', `接続失敗 · ${String(error)}`));
    client.on('lifecycle', ({ current }) => status(name, current.phase));
    return client;
  }

  const clients = [createClient('A'), createClient('B')];
  return {
    async start() {
      await Promise.all(clients.map(async (client, index) => {
        try { await client.open(); }
        catch (error) { log({ client: index === 0 ? 'A' : 'B', type: 'error', text: `接続終了 · ${String(error)}` }); }
      }));
    },
    drop() { clients.forEach((client) => client.drop()); },
    async close() { await Promise.all(clients.map((client) => client.close())); },
  };
}
