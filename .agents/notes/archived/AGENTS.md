# AGENTS.md — Archived Agent Notes

Archived Agent Note triplets under the kind directories are frozen historical snapshots, not current authority. Never edit, reformat, translate, repair, delete, or move a sealed artifact; use an active Agent Note or current documentation for new decisions and facts.

The archival change may only relocate a complete English/Chinese/sidecar triplet, insert the identical `Archived: YYYY-MM-DD` line immediately below both `Status: implemented` lines with no extra blank line, re-record the sidecar with `git hash-object`, and repair or delete inbound links. Do not inspect, verify, or repair links out of archived notes. The exact eight-line header is in [`dsh-archive-agent-notes`](../../skills/dsh-archive-agent-notes/SKILL.md).

Run the [`dsh-archive-agent-notes`](../../skills/dsh-archive-agent-notes/SKILL.md) workflow and append new artifact hashes with `pnpm run verify-archived-agent-notes --write`. The normal verifier rejects changed or missing sealed artifacts, incomplete triplets, unknown kind folders, and invalid archive metadata.
