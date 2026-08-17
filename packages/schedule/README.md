# schedule/ — Session-local reminders

English | [中文](README.zh.md)

The Schedule family owns reminders whose durable state lives in the original Session log. A process-local owner waits only while that Session has a live root Agent; cold Sessions resume overdue work when they become live again and never imply an external notification channel.

| Package | Role | ctx key |
|---|---|---|
| `schedule/` | Versioned Schedule events and fold, model-facing create/list/delete tools, human-facing mutation Remote, Session projection, and a live root-Agent timer owner | `schedules` |

The public `ctx.schedules` service owns human pause, resume, and delete mutations. Tools, Remote mutations, and runtime append to the Session stream; the independent `schedules` projection serves current retained reminders to the browser, while due work enters the same conversation through the Agent's ordinary follow-up queue. Schedule owns no separate mutable database.

See [Session-local Schedule](../../docs/subsystems/schedule.md) for the durable record, transition, view, and delivery contracts.
