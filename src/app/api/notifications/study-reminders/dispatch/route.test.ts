import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { handleStudyReminderDispatch } from './route';

type ReminderPreferenceRow = {
  user_id: string;
  study_reminder_times: unknown;
  study_reminder_timezone: string | null;
  study_reminder_last_sent_key: string | null;
};

class FakeStudyReminderAdmin {
  readonly updatedRows: Array<{ userId: string; values: Record<string, unknown> }> = [];

  constructor(private readonly rows: ReminderPreferenceRow[]) {}

  from(table: string) {
    assert.equal(table, 'user_preferences');

    return {
      select: (columns: string) => {
        assert.match(
          columns,
          /user_id, study_reminder_times, study_reminder_timezone, study_reminder_last_sent_key/,
        );

        return {
          eq: async (field: string, value: boolean) => {
            assert.equal(field, 'study_reminder_enabled');
            assert.equal(value, true);
            return {
              data: this.rows,
              error: null,
            };
          },
        };
      },
      update: (values: Record<string, unknown>) => ({
        eq: async (field: string, userId: string) => {
          assert.equal(field, 'user_id');
          this.updatedRows.push({ userId, values });
          return { error: null };
        },
      }),
    };
  }
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/notifications/study-reminders/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('study reminder dispatch does not persist last_sent_key when delivery fails', async () => {
  const admin = new FakeStudyReminderAdmin([
    {
      user_id: 'user-1',
      study_reminder_times: [{ id: 'morning', time: '08:00', enabled: true }],
      study_reminder_timezone: 'Asia/Tokyo',
      study_reminder_last_sent_key: null,
    },
  ]);

  const response = await handleStudyReminderDispatch(
    request({ now: '2026-06-01T23:00:00.000Z' }),
    {
      authorize: () => ({ ok: true, source: 'INTERNAL_WORKER_TOKEN' }),
      getAdmin: () => admin as never,
      sendNotifications: async () => ({ sent: 0, removed: 0, failed: 1 }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    matched: 1,
    dispatched: 1,
    sent: 0,
    removed: 0,
    failed: 1,
  });
  assert.deepEqual(admin.updatedRows, []);
});

test('study reminder dispatch persists last_sent_key after a successful delivery', async () => {
  const admin = new FakeStudyReminderAdmin([
    {
      user_id: 'user-1',
      study_reminder_times: [{ id: 'morning', time: '08:00', enabled: true }],
      study_reminder_timezone: 'Asia/Tokyo',
      study_reminder_last_sent_key: null,
    },
  ]);

  const response = await handleStudyReminderDispatch(
    request({ now: '2026-06-01T23:00:00.000Z' }),
    {
      authorize: () => ({ ok: true, source: 'INTERNAL_WORKER_TOKEN' }),
      getAdmin: () => admin as never,
      sendNotifications: async () => ({ sent: 1, removed: 0, failed: 0 }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(admin.updatedRows.length, 1);
  assert.equal(admin.updatedRows[0]?.userId, 'user-1');
  assert.equal(
    admin.updatedRows[0]?.values.study_reminder_last_sent_key,
    'Asia/Tokyo:2026-06-02:08:00',
  );
});
