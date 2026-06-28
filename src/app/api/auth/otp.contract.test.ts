import test from 'node:test';
import assert from 'node:assert/strict';

import { handleResetPasswordPost } from './reset-password/route';
import { handleSendOtpPost } from './send-otp/route';
import { handleSignupVerifyPost } from './signup-verify/route';
import { handleVerifyOtpPost } from './verify-otp/route';

type QueryAction = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

interface QueryFilter {
  field: string;
  value: unknown;
}

interface QueryOrder {
  column: string;
  options: unknown;
}

interface QueryOperation {
  table: string;
  action: QueryAction;
  payload?: unknown;
  options?: unknown;
  columns?: string;
  filters: QueryFilter[];
  orders: QueryOrder[];
  limitCount?: number;
}

interface AuthUser {
  id: string;
  email: string;
}

interface OtpRecord {
  id: string;
  otp_code: string;
  expires_at: string;
  attempts: number;
}

function otpRecord(overrides: Partial<OtpRecord> = {}): OtpRecord {
  return {
    id: 'otp-123',
    otp_code: '123456',
    expires_at: '2999-01-01T00:00:00.000Z',
    attempts: 0,
    ...overrides,
  };
}

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function jsonPayload(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

class FakeOtpQuery {
  constructor(
    private readonly client: FakeOtpAdminClient,
    private readonly operation: QueryOperation,
  ) {}

  eq(field: string, value: unknown) {
    this.operation.filters.push({ field, value });
    return this;
  }

  order(column: string, options: unknown) {
    this.operation.orders.push({ column, options });
    return this;
  }

  limit(count: number) {
    this.operation.limitCount = count;
    return this;
  }

  select(columns = '*') {
    this.operation.columns = columns;
    return this;
  }

  async single<T = unknown>(): Promise<{ data: T | null; error: { message: string } | null }> {
    return this.client.resolveSingle<T>(this.operation);
  }

  then<TResult1 = { data: null; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.client.resolveMutation(this.operation).then(onfulfilled, onrejected);
  }
}

class FakeOtpAdminClient {
  readonly operations: QueryOperation[] = [];
  readonly createUserCalls: Array<Record<string, unknown>> = [];
  readonly generateLinkCalls: Array<Record<string, unknown>> = [];
  readonly updateUserByIdCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];
  listUsersCalls = 0;

  constructor(
    private readonly options: {
      users?: AuthUser[];
      otpRecord?: OtpRecord | null;
      createdUser?: AuthUser;
      insertError?: { message: string } | null;
      updateUserError?: { message: string } | null;
    } = {},
  ) {}

  auth = {
    admin: {
      listUsers: async () => {
        this.listUsersCalls += 1;
        return {
          data: {
            users: this.options.users ?? [],
          },
        };
      },
      createUser: async (payload: Record<string, unknown>) => {
        this.createUserCalls.push(payload);
        return {
          data: {
            user: this.options.createdUser ?? {
              id: 'created-user-1',
              email: String(payload.email),
            },
          },
          error: null,
        };
      },
      generateLink: async (payload: Record<string, unknown>) => {
        this.generateLinkCalls.push(payload);
        return {
          data: {
            properties: {
              hashed_token: 'hashed-token-1',
            },
          },
          error: null,
        };
      },
      updateUserById: async (id: string, payload: Record<string, unknown>) => {
        this.updateUserByIdCalls.push({ id, payload });
        return {
          error: this.options.updateUserError ?? null,
        };
      },
    },
  };

  from(table: string) {
    return {
      select: (columns = '*') => this.createOperation(table, 'select', undefined, columns),
      insert: (payload: unknown) => this.createOperation(table, 'insert', payload),
      update: (payload: unknown) => this.createOperation(table, 'update', payload),
      upsert: (payload: unknown, options?: unknown) => this.createOperation(table, 'upsert', payload, undefined, options),
      delete: () => this.createOperation(table, 'delete'),
    };
  }

  createOperation(
    table: string,
    action: QueryAction,
    payload?: unknown,
    columns?: string,
    options?: unknown,
  ) {
    const operation: QueryOperation = {
      table,
      action,
      payload,
      options,
      columns,
      filters: [],
      orders: [],
    };
    this.operations.push(operation);
    return new FakeOtpQuery(this, operation);
  }

  async resolveSingle<T>(
    operation: QueryOperation,
  ): Promise<{ data: T | null; error: { message: string } | null }> {
    if (operation.table === 'otp_requests' && operation.action === 'select') {
      if (this.options.otpRecord === null) {
        return {
          data: null,
          error: { message: 'not found' },
        };
      }

      if (this.options.otpRecord === undefined) {
        throw new Error('Unexpected otp_requests select without an otpRecord fixture');
      }

      return {
        data: this.options.otpRecord as T,
        error: null,
      };
    }

    if (operation.table === 'profiles' && operation.action === 'upsert') {
      const payload = isRecord(operation.payload) ? operation.payload : {};
      return {
        data: { user_id: payload.user_id } as T,
        error: null,
      };
    }

    throw new Error(`Unexpected single operation: ${operation.table}.${operation.action}`);
  }

  async resolveMutation(
    operation: QueryOperation,
  ): Promise<{ data: null; error: { message: string } | null }> {
    if (operation.table === 'otp_requests' && operation.action === 'insert') {
      return {
        data: null,
        error: this.options.insertError ?? null,
      };
    }

    return {
      data: null,
      error: null,
    };
  }
}

class FakeServerClient {
  readonly verifyOtpCalls: Array<Record<string, unknown>> = [];
  readonly signInWithPasswordCalls: Array<Record<string, unknown>> = [];

  constructor(
    private readonly options: {
      sessionUser?: AuthUser;
      verifyOtpError?: { message: string } | null;
      signInError?: { message: string } | null;
    } = {},
  ) {}

  auth = {
    verifyOtp: async (payload: Record<string, unknown>) => {
      this.verifyOtpCalls.push(payload);
      const user = this.options.sessionUser ?? {
        id: 'session-user-1',
        email: 'user@example.com',
      };

      return {
        data: {
          session: this.options.verifyOtpError ? null : { access_token: 'session-token' },
          user,
        },
        error: this.options.verifyOtpError ?? null,
      };
    },
    signInWithPassword: async (payload: Record<string, unknown>) => {
      this.signInWithPasswordCalls.push(payload);
      return {
        error: this.options.signInError ?? null,
      };
    },
  };
}

function findOperation(
  client: FakeOtpAdminClient,
  predicate: (operation: QueryOperation) => boolean,
): QueryOperation {
  const operation = client.operations.find(predicate);
  assert.ok(operation, 'missing expected Supabase operation');
  return operation;
}

function findOtpUpdate(client: FakeOtpAdminClient, payload: Record<string, unknown>) {
  return findOperation(client, (operation) =>
    operation.table === 'otp_requests' &&
    operation.action === 'update' &&
    isRecord(operation.payload) &&
    Object.entries(payload).every(([key, value]) => (operation.payload as Record<string, unknown>)[key] === value)
  );
}

function findOtpDelete(client: FakeOtpAdminClient, field: string, value: unknown) {
  return findOperation(client, (operation) =>
    operation.table === 'otp_requests' &&
    operation.action === 'delete' &&
    operation.filters.some((filter) => filter.field === field && filter.value === value)
  );
}

test('signup send-otp returns 409 for an existing email without creating an OTP', async () => {
  const adminClient = new FakeOtpAdminClient({
    users: [{ id: 'existing-user-1', email: 'existing@example.com' }],
  });

  const response = await handleSendOtpPost(
    jsonRequest('/api/auth/send-otp', { email: 'Existing@Example.COM' }),
    {
      getAdminClient: () => adminClient as never,
      generateOtpCode: () => {
        throw new Error('OTP generation should not run for existing signup emails');
      },
      sendOtpEmail: async () => {
        throw new Error('Email should not be sent for existing signup emails');
      },
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await jsonPayload(response), {
    error: 'このメールアドレスは既に登録されています',
    existing_user: true,
  });
  assert.equal(adminClient.listUsersCalls, 1);
  assert.deepEqual(adminClient.operations, []);
});

test('reset-password send-otp conceals missing emails with 200 and no OTP side effects', async () => {
  const adminClient = new FakeOtpAdminClient({ users: [] });

  const response = await handleResetPasswordPost(
    jsonRequest('/api/auth/reset-password', {
      action: 'send-otp',
      email: 'missing@example.com',
    }),
    {
      getAdminClient: () => adminClient as never,
      generateOtpCode: () => {
        throw new Error('OTP generation should not run for missing reset emails');
      },
      sendOtpEmail: async () => {
        throw new Error('Email should not be sent for missing reset emails');
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await jsonPayload(response), {
    success: true,
    message: '登録されているメールアドレスの場合、認証コードを送信しました',
  });
  assert.equal(adminClient.listUsersCalls, 1);
  assert.deepEqual(adminClient.operations, []);
});

test('invalid verify-otp code increments attempts by id and returns 400', async () => {
  const adminClient = new FakeOtpAdminClient({
    otpRecord: otpRecord({
      id: 'otp-invalid',
      attempts: 2,
    }),
  });

  const response = await handleVerifyOtpPost(
    jsonRequest('/api/auth/verify-otp', {
      email: 'User@Example.COM',
      code: '000000',
    }),
    {
      getAdminClient: () => adminClient as never,
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    error: '認証コードが正しくありません。残り2回',
  });

  const update = findOtpUpdate(adminClient, { attempts: 3 });
  assert.deepEqual(update.filters, [{ field: 'id', value: 'otp-invalid' }]);
  assert.equal(adminClient.listUsersCalls, 0);
});

test('expired signup-verify OTP is deleted by id and returns 400', async () => {
  const adminClient = new FakeOtpAdminClient({
    otpRecord: otpRecord({
      id: 'otp-expired',
      expires_at: '2000-01-01T00:00:00.000Z',
    }),
  });

  const response = await handleSignupVerifyPost(
    jsonRequest('/api/auth/signup-verify', {
      email: 'user@example.com',
      code: '123456',
      password: 'password123',
    }),
    {
      getAdminClient: () => adminClient as never,
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    error: '認証コードの有効期限が切れました。再度コードを送信してください。',
  });

  const deletion = findOtpDelete(adminClient, 'id', 'otp-expired');
  assert.deepEqual(deletion.filters, [{ field: 'id', value: 'otp-expired' }]);
  assert.equal(adminClient.listUsersCalls, 0);
});

test('max-attempt reset-password OTP is deleted by id and returns 400', async () => {
  const adminClient = new FakeOtpAdminClient({
    otpRecord: otpRecord({
      id: 'otp-max-attempts',
      attempts: 5,
    }),
  });

  const response = await handleResetPasswordPost(
    jsonRequest('/api/auth/reset-password', {
      action: 'verify-otp',
      email: 'user@example.com',
      code: '123456',
    }),
    {
      getAdminClient: () => adminClient as never,
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await jsonPayload(response), {
    error: '試行回数の上限に達しました。再度コードを送信してください。',
  });

  const deletion = findOtpDelete(adminClient, 'id', 'otp-max-attempts');
  assert.deepEqual(deletion.filters, [{ field: 'id', value: 'otp-max-attempts' }]);
  assert.equal(adminClient.listUsersCalls, 0);
});

test('reset-password verify-otp marks a valid OTP verified by id without auth/session side effects', async () => {
  const adminClient = new FakeOtpAdminClient({
    otpRecord: otpRecord({ id: 'otp-reset-valid' }),
  });

  const response = await handleResetPasswordPost(
    jsonRequest('/api/auth/reset-password', {
      action: 'verify-otp',
      email: 'User@Example.COM',
      code: '123456',
    }),
    {
      getAdminClient: () => adminClient as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await jsonPayload(response), {
    success: true,
    message: '認証コードを確認しました',
  });

  const update = findOtpUpdate(adminClient, { verified: true });
  assert.deepEqual(update.filters, [{ field: 'id', value: 'otp-reset-valid' }]);
  assert.equal(adminClient.listUsersCalls, 0);
  assert.deepEqual(adminClient.createUserCalls, []);
  assert.deepEqual(adminClient.generateLinkCalls, []);
});

test('verify-otp valid flow can create a confirmed user, set a magic-link session, and clean OTPs by email', async () => {
  const adminClient = new FakeOtpAdminClient({
    users: [],
    otpRecord: otpRecord({ id: 'otp-login-valid' }),
    createdUser: { id: 'created-user-1', email: 'new@example.com' },
  });
  const serverClient = new FakeServerClient({
    sessionUser: { id: 'session-user-1', email: 'new@example.com' },
  });

  const response = await handleVerifyOtpPost(
    jsonRequest('/api/auth/verify-otp', {
      email: 'New@Example.COM',
      code: '123456',
    }),
    {
      getAdminClient: () => adminClient as never,
      getServerClient: async () => serverClient as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await jsonPayload(response), {
    success: true,
    user: {
      id: 'session-user-1',
      email: 'new@example.com',
    },
  });

  const verifiedUpdate = findOtpUpdate(adminClient, { verified: true });
  assert.deepEqual(verifiedUpdate.filters, [{ field: 'id', value: 'otp-login-valid' }]);
  assert.equal(adminClient.createUserCalls.length, 1);
  assert.equal(adminClient.createUserCalls[0].email, 'new@example.com');
  assert.equal(adminClient.createUserCalls[0].email_confirm, true);
  assert.equal(typeof adminClient.createUserCalls[0].password, 'string');
  assert.deepEqual(adminClient.generateLinkCalls, [
    { type: 'magiclink', email: 'new@example.com' },
  ]);
  assert.deepEqual(serverClient.verifyOtpCalls, [
    { token_hash: 'hashed-token-1', type: 'magiclink' },
  ]);

  const cleanup = findOtpDelete(adminClient, 'email', 'new@example.com');
  assert.deepEqual(cleanup.filters, [{ field: 'email', value: 'new@example.com' }]);
});

test('signup-verify valid OTP still returns 409 for an existing email after verified update and cleanup', async () => {
  const adminClient = new FakeOtpAdminClient({
    users: [{ id: 'existing-user-1', email: 'user@example.com' }],
    otpRecord: otpRecord({ id: 'otp-signup-valid' }),
  });

  const response = await handleSignupVerifyPost(
    jsonRequest('/api/auth/signup-verify', {
      email: 'User@Example.COM',
      code: '123456',
      password: 'password123',
    }),
    {
      getAdminClient: () => adminClient as never,
    },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await jsonPayload(response), {
    error: 'このメールアドレスは既に登録されています。ログインしてください。',
  });

  const verifiedUpdate = findOtpUpdate(adminClient, { verified: true });
  assert.deepEqual(verifiedUpdate.filters, [{ field: 'id', value: 'otp-signup-valid' }]);
  const cleanup = findOtpDelete(adminClient, 'email', 'user@example.com');
  assert.deepEqual(cleanup.filters, [{ field: 'email', value: 'user@example.com' }]);
  assert.deepEqual(adminClient.createUserCalls, []);
  assert.deepEqual(adminClient.generateLinkCalls, []);
});

test('signup-verify valid OTP saves onboarding profile and imports default official wordbook', async () => {
  const adminClient = new FakeOtpAdminClient({
    users: [],
    otpRecord: otpRecord({ id: 'otp-signup-profile' }),
    createdUser: { id: 'created-user-1', email: 'new@example.com' },
  });
  const serverClient = new FakeServerClient({
    sessionUser: { id: 'created-user-1', email: 'new@example.com' },
  });
  let defaultWordbookImportCalled = false;

  const response = await handleSignupVerifyPost(
    jsonRequest('/api/auth/signup-verify', {
      email: 'New@Example.COM',
      code: '123456',
      password: 'password123',
      display_name: '山田太郎',
      user_handle: 'kenta_123',
      eiken_level: 'pre2',
    }),
    {
      getAdminClient: () => adminClient as never,
      getServerClient: async () => serverClient as never,
      importDefaultOfficialWordbook: async (client, userId, eikenLevel) => {
        defaultWordbookImportCalled = true;
        assert.equal(client, adminClient);
        assert.equal(userId, 'created-user-1');
        assert.equal(eikenLevel, 'pre2');
        return {
          officialWordbookId: 'official-pre2',
          projectId: 'project-pre2',
          wordCount: 20,
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(defaultWordbookImportCalled, true);
  assert.deepEqual(await jsonPayload(response), {
    success: true,
    user: {
      id: 'created-user-1',
      email: 'new@example.com',
    },
  });

  const profileUpsert = findOperation(adminClient, (operation) =>
    operation.table === 'profiles' &&
    operation.action === 'upsert'
  );
  assert.deepEqual(profileUpsert.options, { onConflict: 'user_id' });
  assert.equal(profileUpsert.columns, 'user_id');
  assert.deepEqual(profileUpsert.payload, {
    user_id: 'created-user-1',
    onboarding_step: 'signed_up',
    username: '山田太郎',
    display_name: '山田太郎',
    user_handle: 'kenta_123',
    eiken_level: 'pre2',
  });

  const cleanup = findOtpDelete(adminClient, 'email', 'new@example.com');
  assert.deepEqual(cleanup.filters, [{ field: 'email', value: 'new@example.com' }]);
});

test('reset-password set-password uses verified OTP grace, updates password, cleans OTPs, and signs in best-effort', async () => {
  const adminClient = new FakeOtpAdminClient({
    users: [{ id: 'existing-user-1', email: 'reset@example.com' }],
    otpRecord: otpRecord({
      id: 'otp-reset-set-password',
      expires_at: '2999-01-01T00:00:00.000Z',
    }),
  });
  const serverClient = new FakeServerClient();

  const response = await handleResetPasswordPost(
    jsonRequest('/api/auth/reset-password', {
      action: 'set-password',
      email: 'Reset@Example.COM',
      code: '123456',
      newPassword: 'new-password-123',
    }),
    {
      getAdminClient: () => adminClient as never,
      getServerClient: async () => serverClient as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await jsonPayload(response), {
    success: true,
    message: 'パスワードを更新しました',
    autoLogin: true,
  });

  const verifiedSelect = findOperation(adminClient, (operation) =>
    operation.table === 'otp_requests' &&
    operation.action === 'select' &&
    operation.filters.some((filter) => filter.field === 'verified' && filter.value === true)
  );
  assert.deepEqual(verifiedSelect.filters, [
    { field: 'email', value: 'reset@example.com' },
    { field: 'verified', value: true },
  ]);
  assert.deepEqual(adminClient.updateUserByIdCalls, [
    {
      id: 'existing-user-1',
      payload: { password: 'new-password-123' },
    },
  ]);

  const cleanup = findOtpDelete(adminClient, 'email', 'reset@example.com');
  assert.deepEqual(cleanup.filters, [{ field: 'email', value: 'reset@example.com' }]);
  assert.deepEqual(serverClient.signInWithPasswordCalls, [
    { email: 'reset@example.com', password: 'new-password-123' },
  ]);
});
