# Drop exported game-log JSON files here.

Each file is one export from the app's Game Log tab. Commit it and the
compile-game-logs workflow merges it into data/game-history.json, which is the
cumulative record simulated predictions get checked against.
