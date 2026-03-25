export type DispatchAttemptOutcome =
  | {
      result: 'accepted';
      smtpCode: string;
      enhancedCode: string | null;
      response: string;
      postfixQueueId: string | null;
      relayIdentity: string | null;
      rawPayload: Record<string, unknown>;
    }
  | {
      result: 'failed_transient';
      smtpCode: string | null;
      enhancedCode: string | null;
      reason: string;
      rawPayload: Record<string, unknown>;
    }
  | {
      result: 'failed_permanent';
      smtpCode: string | null;
      enhancedCode: string | null;
      reason: string;
      rawPayload: Record<string, unknown>;
    };

export type DispatchAttemptRequest = {
  sendId: string;
  recipientEmail: string;
  subject: string;
  html: string;
  text: string | null;
  eml: string | null;
  smtpNode: {
    id: string;
    host: string;
    port: number;
    username: string | null;
    passwordSecretRef: string | null;
  };
};

export type DispatchTransport = {
  dispatch(request: DispatchAttemptRequest): Promise<DispatchAttemptOutcome>;
};
