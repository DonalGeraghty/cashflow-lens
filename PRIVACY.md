# Cashflow Lens: Privacy Policy

_Last updated: 23 September 2026_

Cashflow Lens is a personal finance dashboard written for and used by its author. It runs
entirely in your web browser on your own computer (`http://localhost`). There is no server,
database, account system, analytics or advertising.

## What data the app accesses

- **CSV files you choose to load.** They are read by your browser and never uploaded.
- **Google Sheets (optional).** If you click *Connect*, Google asks you to grant **read-only**
  access to your spreadsheets (`https://www.googleapis.com/auth/spreadsheets.readonly`).
  The app then reads **only the spreadsheet and tab you choose**. It cannot create, change or
  delete anything in your Google account.

## Where the data goes

- Spreadsheet data travels **directly from Google's servers to your browser**. It is not sent to
  the author or to anyone else.
- The Google access token is kept **in the browser's memory only**. It is never written to
  disk and it expires after about an hour.
- Your transactions, categorisation rules, saved layouts and the ID of the connected sheet are
  stored in your **browser's local storage** on your computer, so they survive a page refresh.
  You can delete them at any time with **Data & rules → Reset everything**.

## Sharing

No data is sold, shared, or transferred to any third party. The app contains no tracking or
analytics code. Its Content-Security-Policy only allows network requests to the app itself,
Google sign-in (`accounts.google.com`) and the Google Sheets API (`sheets.googleapis.com`).

## Google API Services User Data Policy

Cashflow Lens's use of information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

## Revoking access

Click **Disconnect** in the app, or remove "Cashflow Lens" at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Contact

Donal Geraghty: donal.james.geraghty@gmail.com
