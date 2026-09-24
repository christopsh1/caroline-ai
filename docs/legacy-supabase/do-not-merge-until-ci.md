# Branch validation gate

Do not merge this archive tooling branch solely to execute an archive.

The branch is intentionally isolated from production runtime code. The draft pull request exists to run and review validation only. Archive execution should occur from the reviewed branch or Codespaces checkout with runtime-only secrets; merging does not grant archive authority and is not required for the archive operation.
