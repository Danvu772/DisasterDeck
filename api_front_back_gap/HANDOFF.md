# Handoff to Role 1: start here

Role 3 has written the API side of the gap list. Nothing Role 1 owns is merged. Every change to a Role 1 file is on a branch and waits for your approval, under the rule in [README.md](README.md).

## Review order

1. **P-002, contract v2.2.** Branch `p-002-contract`, proposal [P-002](https://github.com/DarshalShetty/HackTheNest26/blob/p-002-contract/api_front_back_gap/proposals/P-002-contract-v22.md). Optional fields only. Everything else depends on it, so read it first. The frontend parts are already done on the branch.
2. **P-001, read routes.** Branch `p-001-read-routes`, proposal [P-001](https://github.com/DarshalShetty/HackTheNest26/blob/p-001-read-routes/api_front_back_gap/proposals/P-001-read-routes.md). Board, inbox, people, feed, health, and the `api:check` guard. Independent of P-002, so it can merge in any order.
3. **P-003, keeper and dispatcher.** Branch `p-003-keeper`, stacked on P-002, proposal [P-003](https://github.com/DarshalShetty/HackTheNest26/blob/p-003-keeper/api_front_back_gap/proposals/P-003-keeper.md). Merge after P-002. The rules have 11 tests and need no database. The worker has not been run against the shared cluster.

## The four calls to check first

These are the places where the decisions are most likely to be wrong. [DECISIONS.md](DECISIONS.md) has the reasons.

- **D2 and P-001:** a citizen (`public` role) counts as "signed in", so the board is readable by citizens.
- **D3:** the feed and the site posts are masked. The raw text in the `events` collection is not. The regex matches Turkish number formats only.
- **D7 and P-003:** "arrived" moves a site to `team_on_site`. A reopened replacement task does not reopen the site.
- **P-003:** low-risk tasks go straight to the nearest person, with no coordinator.

## How to approve

Set `status: approved`, `approved_by: role-1` and `approved_sha` to the newest code commit you read. Then commit the proposal file on its branch. Any new code commit after that voids the approval. The check for each branch is:

```bash
git checkout <branch>
node api_front_back_gap/check.mjs --as role-3 --base main      # for P-001 and P-002
node api_front_back_gap/check.mjs --as role-3 --base p-002-contract   # for P-003
```

It should pass once you have approved every Role 1 file that the branch touches.

## Not done

- The sweeper.
- A run of the keeper against a real database. It needs a local MongoDB first.
- `npm run api:check` on the shared cluster. It is blocked on purpose (P-001).
- Role 4 syncs the repo copy of the Role 1 doc (M-02).
