import { createConnection } from 'node:net';

export type SmtpNodeProbeResult = {
  ok: boolean;
  host: string;
  port: number;
  transcript: string;
  error: string | null;
};

export const probeSmtpNode = async (input: {
  host: string;
  port: number;
  timeoutMs?: number;
}): Promise<SmtpNodeProbeResult> =>
  new Promise((resolve) => {
    const socket = createConnection({ host: input.host, port: input.port });
    let transcript = '';
    let done = false;
    let ehloSent = false;

    const finish = (result: SmtpNodeProbeResult) => {
      if (done) {
        return;
      }

      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(input.timeoutMs ?? 5_000);

    socket.on('timeout', () => {
      finish({
        ok: false,
        host: input.host,
        port: input.port,
        transcript,
        error: 'SMTP probe timed out',
      });
    });

    socket.on('error', (error) => {
      finish({
        ok: false,
        host: input.host,
        port: input.port,
        transcript,
        error: error.message,
      });
    });

    socket.on('data', (chunk: Buffer) => {
      transcript += chunk.toString('utf8');

      if (!ehloSent && /(?:^|\n)220[ -]/.test(transcript)) {
        ehloSent = true;
        socket.write('EHLO supermailer.local\r\nQUIT\r\n');
        return;
      }

      if (ehloSent && /(?:^|\n)250[ -]/.test(transcript)) {
        finish({
          ok: true,
          host: input.host,
          port: input.port,
          transcript,
          error: null,
        });
        return;
      }

      if (ehloSent && /(?:^|\n)[45][0-9]{2}[ -]/.test(transcript)) {
        finish({
          ok: false,
          host: input.host,
          port: input.port,
          transcript,
          error: transcript.trim() || 'SMTP probe failed',
        });
      }
    });
  });
