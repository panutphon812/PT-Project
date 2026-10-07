# Project working rules

- Before changing application files, inspect Git status and verify the current commit is backed up on origin/main at https://github.com/panutphon812/PT-Project.git.
- If there are existing changes, review them for secrets and private data, commit the intended project files as a descriptive pre-change checkpoint, and push successfully before editing. Do not blindly stage every file.
- If the working tree is clean, push any unpushed commits and record the current commit as the checkpoint; an empty commit is unnecessary.
- If the push fails, preserve local work and resolve the backup issue before starting changes. Do not claim a GitHub backup succeeded until verified.
- After completing requested changes and appropriate checks, commit and push the finished work, then report the commit and verification result.
- Never force-push, reset history, or discard user changes without explicit authorization.
- Keep data/, SQLite databases, backups, secrets, documents/, presentation/, and temporary rendering outputs out of GitHub. Git history restores project files, not live sales or inventory data.
- Preserve the existing database. Never reset or overwrite it with seed data. Use isolated databases for tests.
- Before any database schema or data migration, create and verify a consistent local SQLite backup including committed WAL data, using the SQLite backup API or a stopped-server backup. Do not copy only the main database while writes are active.
- Word and presentation work remains paused unless the user explicitly requests it.
