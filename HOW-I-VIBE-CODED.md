# How I Vibe-Coded Trivia Study

*By Towfiq Aziz · last updated November 26, 2026*

## What it is

Trivia Study turns your class PDFs into a daily study quiz. I built it with Claude without writing the code myself. It's still a prototype, but I wanted to share it because I think the idea could really help students. Instead of cramming the night before an exam, you answer one question from every class each day, and the ones you miss keep coming back until they stick.

Try it at [taziz05.github.io/trivia-study](https://taziz05.github.io/trivia-study/).

- **Classes:** make a class for each subject and add your lecture slides, notes or readings as PDFs. When you're done with a class, delete it.
- **Today:** one question per class every day. Finish them all to keep your streak.
- **Review:** missed questions come back 1, 3, 7 and 16 days later (spaced repetition).
- **Practice:** unlimited questions from a whole class or a single PDF.

## Where the idea came from

I first built [Study Daily](https://github.com/TAziz05/study-daily), a daily quiz for my own classes. It worked, but every question had to be written ahead of time from my notes, so it only worked for me. Trivia Study is the version anyone can use: you bring the PDFs and it makes the questions.

I gave Claude a few rules:

- **Anyone can use it.** Upload PDFs, sort them into classes, and delete a class when you're done reviewing it.
- **It has to be free.** No accounts and no server. Your classes, questions and scores stay in your own browser.

## How it makes questions

There are two ways to get questions.

**Free questions** (the default) are made right in your browser, and nothing gets uploaded:

1. It reads the text out of the PDF and rebuilds each line, so slide bullet points stay separate.
2. It cleans out things that aren't real content: headers and footers that repeat on every page, page numbers, and the references at the end.
3. It finds the key terms, meaning the words and phrases that come up the most.
4. It turns them into fill-in-the-blank and definition questions. The wrong answers are other terms from the same PDF, picked to look similar to the right one so you can't just guess.

These work best on text-heavy notes and readings, and not so well on slides that are mostly pictures.

**AI questions** (optional) are real multiple-choice questions with explanations, and they can read slides, images and scanned pages too. You bring your own API key:

- **Gemini:** free with daily limits. This is the recommended option.
- **Anthropic (Claude):** costs a few cents per PDF with Claude Haiku. Claude Sonnet writes the best questions.

Your key is saved only in your browser, and your PDF goes straight from your browser to Google or Anthropic, never through a server of mine.

## How I worked with Claude

- **I described the product, Claude built it.** The first working version, with classes, daily questions, review, practice and both question modes, was built in one day on October 18, 2026, followed by a logo and a link preview image.
- **Privacy first.** Because everything stays in the browser, there's a **Download backup** button to move to another device instead of an account.
- **Honest about the free mode.** The setup screen says the free questions work right away, and points to a free Gemini key for better ones.

## Why it's a prototype

It was built in a day, and the free questions are only as good as the PDF's text. Image-heavy slides and scanned pages need an AI key to get good questions. I'd like to keep improving the free generator so it works well for everyone without a key.

## The tech

It's a static site, so it's free to host.

- **Website:** plain HTML, CSS and JavaScript, hosted on GitHub Pages from the TAziz05/trivia-study repo.
- **PDF reading:** [pdf.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/), bundled in `lib/`.
- **Storage:** your browser's local storage. If it fills up, the app asks you to delete a finished class or remove some PDFs.

---

Coded with [Claude](https://claude.ai) (Opus 5.5) by Anthropic. The chat where it started is linked in the [ai_use](ai_use) file.
