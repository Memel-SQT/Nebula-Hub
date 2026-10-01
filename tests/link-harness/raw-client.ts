import fs from 'node:fs';
import net from 'node:net';
import { proof, PROTOCOL, randomNonce, sha256Hex } from '@nebula/link';

/**
 * A hand-written client that speaks the wire protocol directly: used to send what the SDK would
 * never send (garbage, wrong proofs, floods) and to check what the Hub answers.
 */
export interface RawClient {
  socket: net.Socket;
  messages: Array<Record<string, unknown>>;
  closed: boolean;
  send(value: unknown): void;
  sendText(text: string): void;
  waitFor(predicate: (message: Record<string, unknown>) => boolean, timeoutMs?: number): Promise<Record<string, unknown>>;
  waitClosed(timeoutMs?: number): Promise<void>;
}

export function rawConnect(pipe: string): Promise<RawClient> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(pipe);
    const client: RawClient = {
      socket,
      messages: [],
      closed: false,
      send: (value) => socket.write(`${JSON.stringify(value)}\n`),
      sendText: (text) => socket.write(text),
      async waitFor(predicate, timeoutMs = 2000) {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const found = client.messages.find(predicate);
          if (found) return found;
          if (Date.now() > deadline) throw new Error(`no matching message in ${JSON.stringify(client.messages)}`);
          await new Promise((wait) => setTimeout(wait, 10));
        }
      },
      async waitClosed(timeoutMs = 2000) {
        const deadline = Date.now() + timeoutMs;
        while (!client.closed) {
          if (Date.now() > deadline) throw new Error('still open');
          await new Promise((wait) => setTimeout(wait, 10));
        }
      },
    };
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          client.messages.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // Not for us to judge.
        }
        newline = buffer.indexOf('\n');
      }
    });
    socket.on('close', () => {
      client.closed = true;
    });
    socket.on('error', () => undefined);
    socket.once('connect', () => resolve(client));
    socket.once('error', reject);
  });
}

/** Full handshake by hand; `manifestFile` is what the client claims as its manifest. */
export async function rawAuth(client: RawClient, token: string, appId: string, manifestFile: string, clientProofToken = token): Promise<Record<string, unknown>> {
  const clientNonce = randomNonce();
  client.send({ jsonrpc: '2.0', id: 'hello', method: 'link.hello', params: { protocol: PROTOCOL, appId, appVersion: '1.0.0', manifestHash: sha256Hex(fs.readFileSync(manifestFile)), clientNonce } });
  const hello = await client.waitFor((message) => message.id === 'hello');
  const { serverNonce } = hello.result as { serverNonce: string };
  client.send({ jsonrpc: '2.0', id: 'auth', method: 'link.auth', params: { clientProof: proof(clientProofToken, 'client', serverNonce, clientNonce, appId) } });
  return client.waitFor((message) => message.id === 'auth');
}
