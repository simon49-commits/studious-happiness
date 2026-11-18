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
