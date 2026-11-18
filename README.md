# TaxKeep (prototype)

A year-round tax organizer for Canadians: receipts that read themselves from a photo, income tracking (jobs, gig apps, benefits, investments), a document checklist, RRSP/TFSA/FHSA room, self-employed tools, PIN/fingerprint lock, tax-date reminders and a one-tap export package for your tax preparer.

## Get the Android app
Every push to `main` builds a new APK automatically. Download the latest one from **Releases → TaxKeep (latest build) → TaxKeep.apk** and tap it on your phone to install.

## Where things are
- `www/index.html` – the whole app (web code)
- `android/` – the Android wrapper (Capacitor)
- `www/ocr.js`, `www/lock.js`, `www/reminders.js` – receipt reading, app lock, reminders
- `.github/workflows/build.yml` – the automatic APK build
- `android/app/taxkeep-debug.jks` – debug signing key so updates install over older versions (testing only, not for Google Play)

TaxKeep organizes records; it does not give tax advice. The name is a placeholder.

## Tax forms (v1.2)
- **Slips**: snap or type T4, T4A, T4E, T5, T3, T2202, RRSP receipts, T4RSP, T4A(P), T4A(OAS), T5007, T4FHSA. TaxKeep reads the main boxes from a photo (`www/ocr.js` readText + `www/forms.js` parseSlip) and ticks off the checklist.
- **Worksheets**: slips, receipts and income sorted by T1 / T2125 line numbers, with receipt lists for medical, donations, child care, moving, T777 and more. Saved as a PDF (jsPDF, bundled locally) and included in the export ZIP with `Slips.csv` and slip photos.

## v1.3
- **Refund estimate** (`www/estimate.js`): federal + Manitoba tax for 2025/2026, CPP on self-employment, medical/donation/tuition credits. Other provinces show federal only.
- **GST/HST worksheet**: lines 101/103/106/109, quick method comparison, rideshare and $30,000 registration alerts, filing reminders.
- **Notice of Assessment reader**: RRSP limit, unused RRSP contributions, tuition carryforward.
- **Household**: spouse and children, whose receipt it is, which return medical and child care go on.
- **Bank/card statement import**: finds likely deductible purchases in a CSV.
- **Home office worksheet**: employee (T777 Part 4) or self-employed (T2125 Part 7).
- **Past years**: 7 years in the year picker; retention shown in More.
- **Missing-slip reminders** in February and March.

## v1.4 – features by user type
Setup (and More → About you) asks what applies: job with a T4, gig/delivery apps, own business, spouse, children, student, work from home, retired/benefits. TaxKeep only shows matching tools:
- **Gig**: earnings CSV import, app connections, rideshare GST/HST alerts, mileage, set-aside, T2125, GST/HST.
- **Own business**: business receipts, T2125, GST/HST, mileage, set-aside, home office (T2125 Part 7).
- **Spouse / children**: household card, "whose receipt", medical and child care on the right return; childcare category only with children.
- **Student**: tuition category. **Work from home**: employee home office (T777).
Checklist answers and these settings stay in sync. Older data is sorted into types automatically.

## v1.5 – simpler navigation
- Home: one "Next step" card, one + Add button, a short "Your year" list, top 2 alerts.
- Tabs: Home, Receipts, Income, Tax forms, More. Savings moved under More.
- More is a menu with sub-pages. Android back button goes back a level.
