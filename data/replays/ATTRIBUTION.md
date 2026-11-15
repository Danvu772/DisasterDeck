# Historical real-tweet replay

Source: Gabriel Preda, **Turkey Earthquake Tweets**, Kaggle dataset `gpreda/turkey-earthquake-tweets`, version 24, last updated 26 February 2023.

- Dataset: https://www.kaggle.com/datasets/gpreda/turkey-earthquake-tweets
- Versioned public download: https://www.kaggle.com/api/v1/datasets/download/gpreda/turkey-earthquake-tweets?datasetVersionNumber=24
- Collector metadata: https://www.kaggle.com/api/v1/datasets/view/gpreda/turkey-earthquake-tweets
- GitHub project linking this archive: https://github.com/miraytopal/Turkey-Earthquake-Tweets-Sentiment-Analysis-NLP

The archive declares **CC0: Public Domain**. Its metadata describes daily collection using Tweepy and the Twitter API. The source/version and original CSV hash are retained in `real-tweets-source.json`. `archive-metadata.json` preserves the collector's description, license declaration and update date. Individual posts retain their original tweet IDs and X links; current live availability is not asserted.

Transformation: selected 43 unique-ID records explicitly mentioning Antakya, dated 7–10 February 2023, from 28,844 archive rows. Preserved original-language text and historical publication times. Removed author profile columns; redacted phone numbers, handles, external links and email addresses. Explicit private-address patterns are excluded by the preparation script. This is contact redaction, not complete person-name anonymization. No translation, incident coordinates, casualty counts, help labels or missing post text were generated.

The four-second spacing is a synthetic playback schedule. It does not replace each post's historical `observedAt`. Retweets and news are not independent eyewitness reports or evidence of a current rescue need. The data is a historical social archive, not verified disaster operations.

The separately cited original research source, https://github.com/avaapm/deprem, publishes 1,000 tweet IDs and labels in `dataset.tsv`, **without tweet text**. Its Hugging Face mirror has the same limitation. That ID list has not been substituted for full posts or reconstructed using invented text. It is not the source of this 43-post replay.
