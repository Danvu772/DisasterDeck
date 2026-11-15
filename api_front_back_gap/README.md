# api_front_back_gap

This is where Role 1 (backend) and Role 3 (frontend) agree on the API. It holds the current API, the gaps between the two sides, and the process for approving each other's changes.

## Read in this order

1. [`API.md`](API.md): what the API does today, measured against the running server.
2. [`GAPS.md`](GAPS.md): what the frontend waits on, what the API lacks, who fixes each gap, and the decisions still open.
3. [`proposals/`](proposals/): changes waiting for review, and the ones already merged.

## Who owns what

[`owners.json`](owners.json) holds the folder table from Team contracts §2 as data, so the check can read it. When two prefixes match a path, the longer one wins. This system covers Role 1 and Role 3. A change to a Role 2 or Role 4 path is flagged, and those roles approve it in chat, not here.

## The approval rule

1. A change to a file owned by the other role needs an approved proposal from that owner. Role 3 changing `lib/` needs Role 1 to approve it. Role 1 changing `components/` needs Role 3 to approve it.
2. Nobody approves their own proposal. The reviewer is always the other role.
3. Approval binds to a commit. The reviewer writes `approved_sha`, the newest code commit they read. A code commit added after approval voids the approval, so the reviewer reads again. Commits that touch only `proposals/` do not count, so the approval commit never voids its own approval.
4. A proposal names the gaps it closes. When the code merges, the proposal's status becomes `merged` and the gap changes to closed in GAPS.md, in the same commit.
5. A change inside your own folders needs no approval. If it closes a gap, update GAPS.md.

The check cannot prove who pressed approve. `approved_by` is a claim. `git log -p` on the proposal file shows who wrote the line, and that is the audit trail.

## Flow

1. Copy [`proposals/TEMPLATE.md`](proposals/TEMPLATE.md) to `proposals/P-NNN-short-slug.md`, using the next free number. Set `status: proposed`.
2. Commit the change on a branch, push it, and tell the other role the proposal id.
3. The reviewer reads the diff and the proposal. They set `status: approved`, `approved_by` and `approved_sha`, and commit that. Or they set `status: changes-requested` and write the reason under "Reviewer notes".
4. The author merges to `main`, sets `status: merged`, and updates GAPS.md.

Only the author edits the sections above "Reviewer notes". Only the reviewer edits the approval fields and "Reviewer notes".

## Check

```bash
node api_front_back_gap/check.mjs                       # validates every proposal and gap id
node api_front_back_gap/check.mjs --as role-3           # checks your branch against owners.json
node api_front_back_gap/check.mjs --as role-1 --base origin/main
```

Run the `--as` form before each push. It compares your commits against `--base` (default `origin/main`). It fails when a file you changed belongs to the other role and no approval covers it at the current commit. It reads commits, so commit before you run it.

The check has no dependencies and needs only Node and git.

## Rules for the folder

Gap ids never change. A new gap takes the next number in its series (G, M, S or D) at the bottom of the register. A proposal refers to gaps by id, so renumbering breaks it.

The API docs (`API.md`) describe the API as it is. Update it in the same commit as the route it describes.
