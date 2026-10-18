# Trivia Study

Turn your class PDFs into a daily study quiz: **https://taziz05.github.io/trivia-study/**

- Make a class for each subject and add your lecture slides, notes or readings (PDF).
- Every day you get one question per class. Finish them all to keep your streak.
- Missed questions come back in **Review** after 1, 3, 7 and 16 days.
- **Practice** gives unlimited questions from a class or a single PDF.
- Finished with a class? **Classes → Manage → Delete** removes it.

It's free, has no accounts, and runs entirely in your browser. Your classes, questions and scores are saved in your browser's storage. To move to another device, use **Settings → Download backup**, then **Load backup** on the other device.

## Free vs. AI questions

**Free questions** (default) are generated in your browser from the PDF's text: fill-in-the-blank and definition matching. Nothing is uploaded. They work best on text-heavy notes and readings, and poorly on image-heavy slides or scanned pages.

**AI questions** (optional) are proper multiple-choice questions with explanations, and they can read slides, images and scans. You bring your own API key; the PDF goes straight from your browser to the provider you pick.

### Get a free Gemini key (recommended)

1. Go to [Google AI Studio → API keys](https://aistudio.google.com/apikey) and sign in with any Google account.
2. Click **Create API key** (let it create a project if it asks).
3. Copy the key. It starts with `AIza`.
4. In Trivia Study, open **Settings (⚙︎) → Gemini (free)**, paste the key, click **Save key**, then **Test**.

It's free with daily limits, which is plenty for studying. On the free tier Google may use what you send to improve its products, so don't upload anything private.

### Or use an Anthropic (Claude) key

1. Go to the [Claude Developer Platform](https://platform.claude.com/) and sign up or log in.
2. Under **Billing**, add a small amount of credit. This isn't free, but a PDF costs a few cents with Haiku.
3. Open **API keys → Create key** and copy it. It starts with `sk-ant-`.
4. In Trivia Study, open **Settings (⚙︎) → Anthropic**, paste the key, click **Save key**, then **Test**.

Your key is stored only in your browser and sent only to Google or Anthropic. Don't save it on a shared computer.

Then, when adding PDFs to a class, choose **AI questions**.

## Credits

Coded with [Claude](https://claude.ai) (Opus 5.5) by Anthropic.

PDF reading by [pdf.js](https://mozilla.github.io/pdf.js/) (Apache 2.0) and [pdf-lib](https://pdf-lib.js.org/) (MIT), bundled in `lib/`.
