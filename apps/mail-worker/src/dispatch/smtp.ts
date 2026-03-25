import { SEND_CORRELATION_HEADER } from '@supermailer/contracts';

import type {
  DispatchAttemptRequest,
  DispatchAttemptOutcome,
  DispatchTransport,
} from './types';

const parseQueueId = (response: string): string | null => {
  const queuedAs = response.match(/queued as\s+([A-Za-z0-9]+)/i);

  if (queuedAs?.[1]) {
    return queuedAs[1];
  }

  const postfixId = response.match(/\b([A-F0-9]{7,})\b/);
  return postfixId?.[1] ?? null;
};

const parseSmtpErrorCodes = (
  error: unknown,
): { smtpCode: string | null; enhancedCode: string | null; reason: string } => {
  const payload = error as {
    code?: string;
    responseCode?: number;
    response?: string;
    message?: string;
  };
  const response = typeof payload.response === 'string' ? payload.response : '';
  const message =
    typeof payload.message === 'string'
      ? payload.message
      : 'SMTP dispatch failed';
  const responseCode = Number.isFinite(payload.responseCode)
    ? String(payload.responseCode)
    : null;
  const codeFromResponse = response.match(/\b([245][0-9]{2})\b/)?.[1] ?? null;
  const enhancedCode =
    response.match(/\b([245]\.[0-9]+\.[0-9]+)\b/)?.[1] ?? null;

  return {
    smtpCode: responseCode ?? codeFromResponse,
    enhancedCode,
    reason: response || message,
  };
};

const classifyFailure = (
  smtpCode: string | null,
  enhancedCode: string | null,
  reason: string,
): DispatchAttemptOutcome => {
  const codeValue = smtpCode ? Number.parseInt(smtpCode, 10) : NaN;
  const text = `${enhancedCode ?? ''} ${reason}`.toLowerCase();
  const transient =
    (!Number.isNaN(codeValue) && codeValue >= 400 && codeValue < 500) ||
    /^4\./.test(enhancedCode ?? '') ||
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('econnreset') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('temporary');

  if (transient) {
    return {
      result: 'failed_transient',
      smtpCode,
      enhancedCode,
      reason,
      rawPayload: {
        smtpCode,
        enhancedCode,
        reason,
      },
    };
  }

  return {
    result: 'failed_permanent',
    smtpCode,
    enhancedCode,
    reason,
    rawPayload: {
      smtpCode,
      enhancedCode,
      reason,
    },
  };
};

const composeMessage = (request: DispatchAttemptRequest): string => {
  const lines = [
    `From: supermailer@${request.smtpNode.host}`,
    `To: ${request.recipientEmail}`,
    `Subject: ${request.subject}`,
    `${SEND_CORRELATION_HEADER}: ${request.sendId}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    request.html,
  ];

  if (request.text) {
    lines.push('', request.text);
  }

  return `${lines.join('\r\n')}\r\n`;
};

const sendSmtpCommand = (
  host: string,
  port: number,
  command: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    import('node:net')
      .then(({ createConnection }) => {
        const socket = createConnection({ host, port });
        let transcript = '';
        let done = false;

        const finish = (error?: Error) => {
          if (done) {
            return;
          }

          done = true;
          socket.destroy();

          if (error) {
            reject(error);
            return;
          }

          resolve(transcript);
        };

        socket.setTimeout(15_000);

        socket.on('timeout', () => {
          const timeout = new Error('SMTP socket timeout');
          (timeout as Error & { code?: string }).code = 'ETIMEDOUT';
          finish(timeout);
        });

        socket.on('error', (error) => finish(error));

        socket.on('data', (chunk: Buffer) => {
          transcript += chunk.toString('utf8');
          if (transcript.includes('\n220 ')) {
            socket.write(`${command}\r\n`);
          }

          if (
            transcript.includes('\n250 ') ||
            transcript.includes('\n421 ') ||
            transcript.includes('\n550 ') ||
            transcript.includes('\n554 ')
          ) {
            finish();
          }
        });
      })
      .catch((error) => reject(error));
  });

export const createSmtpDispatchTransport = (): DispatchTransport => ({
  dispatch: async (request) => {
    const message = request.eml ?? composeMessage(request);
    const smtpEnvelope = [
      `EHLO supermailer.local`,
      `MAIL FROM:<supermailer@${request.smtpNode.host}>`,
      `RCPT TO:<${request.recipientEmail}>`,
      'DATA',
      message,
      '.',
      'QUIT',
    ].join('\r\n');

    try {
      const response = await sendSmtpCommand(
        request.smtpNode.host,
        request.smtpNode.port,
        smtpEnvelope,
      );
      const smtpCode = response.match(/\b([0-9]{3})\b/)?.[1] ?? '250';
      const enhancedCode =
        response.match(/\b([0-9]\.[0-9]+\.[0-9]+)\b/)?.[1] ?? null;

      if (!smtpCode.startsWith('2')) {
        return classifyFailure(smtpCode, enhancedCode, response.trim());
      }

      return {
        result: 'accepted',
        smtpCode,
        enhancedCode,
        response: response.trim(),
        postfixQueueId: parseQueueId(response),
        relayIdentity: `${request.smtpNode.host}:${request.smtpNode.port}`,
        rawPayload: {
          smtpCode,
          enhancedCode,
          response: response.trim(),
        },
      };
    } catch (error) {
      const { smtpCode, enhancedCode, reason } = parseSmtpErrorCodes(error);
      return classifyFailure(smtpCode, enhancedCode, reason);
    }
  },
});
