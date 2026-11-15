# Feed real historical tweets through the pipeline

## What was in the repository

`data/tweets_replay.json` contains five synthetic Antakya exercise reports. `agents/fixtures/tweets_sample.json` is also synthetic. Those were the original worker defaults. **The worker now defaults to the real archive below.** The deterministic rehearsal file is retained for explicit `replay:synthetic` runs and CP1/scenario tests. Restart any already-running X worker to pick up the new default.

The planned [Tweets Under the Rubble GitHub dataset](https://github.com/avaapm/deprem) and [Hugging Face mirror](https://huggingface.co/datasets/ctoraman/deprem-tweet-dataset) provide 1,000 annotated tweet IDs, not full tweet text. Inspecting their actual TSV confirms the columns `label`, `entities`, `tweet_id`. Individual original posts may no longer be public; an ID-only file cannot be fed directly into a language extractor.

A [GitHub analysis project](https://github.com/miraytopal/Turkey-Earthquake-Tweets-Sentiment-Analysis-NLP) links to Gabriel Preda's [real earthquake archive](https://www.kaggle.com/datasets/gpreda/turkey-earthquake-tweets). We retrieved its public version 24 and prepared **43 real archived posts mentioning Antakya, dated 7–10 February 2023**. The app-ready file and provenance are committed under `data/replays/`; no Kaggle or X account is needed to use them.

Another GitHub repository exposes a 1,001-row CSV, but its dates start on 20 February and extend into March. It was not used for the earlier NASA pilot window.

## Preview without writes or model charges

From the repository root after `npm ci`:

```sh
npm run replay:real -- --dry-run --mock --limit 5
```

This loads the real text, uses the existing rule-based mock extractor, and prints any proposed events. It makes no database writes or model calls. **The mock extractor recognizes Turkish patterns; this mainly English sample is skipped by those rules.** A full 43-row mock run was verified to skip all 43 without errors or charges. That is a transport/data check, not evidence of successful AI extraction or rescue-case creation.

For actual language extraction, use the configured model key. News, commentary and unrelated messages should be skipped rather than forced into cases.

## Send to the running pipeline

In `.env.local`, supply the existing `ANTHROPIC_API_KEY` and extraction-model configuration, then configure a real destination. The HTTP option uses the team's normal event endpoint and authentication:

```dotenv
DESK_BACKEND=http
DESK_API_URL=http://127.0.0.1:3672
DESK_ID=antakya-2023
AGENT_KEY=<the team's private worker key, at least 24 characters>
```

Use the actual application port. The direct MongoDB option is `DESK_BACKEND=lib` with the team's `MONGODB_URI` and `MONGODB_DB`. Never commit these values.

```sh
npm run replay:real -- --limit 5
```

The command preflights board access before spending on extraction and refuses a fixture-only destination. It preserves original historical publication dates in event `observedAt` and uses stable desk-scoped tweet keys on repeat runs. `ts` is queue receipt time. Publication timestamps are also checked against the original string Snowflake IDs, avoiding JavaScript integer-precision loss.

Keep the team's single shared Brain running so accepted events become records/tasks. Do not start a second shared Brain without coordinating with its operator. The replay uses the current Antakya desk and can mix with existing synthetic cases; coordinate a reset or use the team's agreed separate replay environment. This delivery has not posted the archive into the shared database or made paid model calls.

Open `/agent` or the desk/board and inspect the resulting event feed. `/compare` remains the five-post synthetic presentation. A skipped real post correctly produces no rescue case. Posts without verified coordinates may remain unplaced; we do not assign the Antakya city centre as their incident position.

For the original scripted rehearsal:

```sh
npm run replay:synthetic -- --mock
```

## Limits and reproducibility

The 43 records are real archived posts, including news/commentary/retweets, not 43 verified help calls. They span several languages and are mainly English. Current X availability, the claims in the posts and precise incident locations are unverified. Retweets do not establish independent corroboration. Texts have contact redactions and are not verbatim raw exports.

Four-second playback spacing is intentionally artificial; historical observation dates remain unchanged. NASA observations have their own dates. Shared users, shelters and logistics remain synthetic exercise data.

To rebuild the reviewed subset with Python's standard library only:

```sh
python scripts/prepare-real-tweets.py --download
npm run check:replay
```

The preparation pins version 24 and verifies the original CSV hash. Raw CSV/user-profile metadata stays under ignored `.next/cache/real-tweets-source`. `--input path/to/turkey_earthquake_tweets.csv` supports an already-downloaded copy of that exact reviewed version. The committed output needs no Python, X API token or extra download. Source links, record numbers, text hashes, redaction flags and output hash are provided. See [attribution](../data/replays/ATTRIBUTION.md).
