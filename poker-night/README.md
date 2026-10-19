# Run PokerSplit

Requires Node.js 22 or newer. From the repository root, run `npm ci` first.

```powershell
npm.cmd run dev
```

Open http://127.0.0.1:5173. Run the tests with `npm.cmd test`.

Every new game asks for the host's name and adds the creation date automatically.
After entering balanced final amounts, choose **סיום ושמירה** to archive the game.
Open **היסטוריית משחקים** to view players, buy-ins, rebuy counts, final amounts,
profits/losses, and transfers. Completed games are read-only; a new game keeps the history.

Active games and history are synchronized through `/api/games`. Any browser can
open the history and continue an active game. Each saved revision is checked on
the server, so a stale browser cannot overwrite another player's newer changes.
Completed games are immutable. Conflicting edits can be saved as a separate game.
The site is one shared group; anyone with the URL can view games and edit active games.

The browser keeps a local backup and a persistent upload queue. Old local history
is imported on opening the updated site at its original address. Games saved at
an old, expired tunnel address cannot be read from a different address. Demo games
are excluded. The visible sync indicator distinguishes a server acknowledgement
from changes waiting on this device; retrying does not create duplicate games.

## Permanent hosting on Vercel

1. Import this repository, using its root directory, with `vercel.json` as committed.
2. Connect a persistent PostgreSQL database (for example Neon through Vercel Storage).
3. Set the server-only `DATABASE_URL` (or `POSTGRES_URL`) in Vercel's environment settings.
4. Deploy. The API creates the `pokersplit_games` table on its first request.
5. Check `/api/games` returns HTTP 200, then save a game and open it from another device.

Always point new deployments at the **same database**. Deploying the app never
drops or recreates the table's data. Do not put the connection string in browser
code or Git. An example is provided in the repository's `.env.example`.
Deploying only `dist` to a static host does not provide shared storage.
On Vercel, a missing database returns HTTP 503; it never falls back to temporary disk.

## Local development

From the repository root, `npm run dev` loads `.env` if present. With a database
URL it uses PostgreSQL. Otherwise, development uses a persistent PGlite database
in `poker-night/data` (ignored by Git); restarting or updating code keeps its data.
`POKERSPLIT_DATA_DIR` may specify a different persistent directory. The local
tunnel shares this database across browsers, but it is not the Vercel database.

`npm test` from the repository root runs the complete suite, including real
PostgreSQL queries via PGlite, HTTP requests, independent sync clients, offline
recovery, concurrency conflicts, immutable completion, and persistence on disk.

## Supabase hosted connection

For Supabase, run `poker-night/supabase/schema.sql` once in the project's SQL Editor.
It creates the game table and the atomic save function, enables RLS, and restricts
access to the server role. Browser publishable keys cannot read or modify the table.

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as server-only environment variables
in Vercel for Production and Preview, then deploy. The existing default secret key
can be used; no database password reset is needed. Never prefix the secret variable
with `NEXT_PUBLIC_` or include it in browser scripts. `SUPABASE_SERVICE_ROLE_KEY`
is also supported for installations still using a legacy service-role JWT.

When `DATABASE_URL` or `POSTGRES_URL` is configured it takes priority; otherwise
the Supabase adapter uses the project's HTTPS Data API. All deployments must use
the same Supabase project. A deployment updates code and never clears stored games.