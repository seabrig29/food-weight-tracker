# Food & Weight Tracker

A static, privacy-first dashboard ready for GitHub Pages. Your records live in the browser's local storage; use **Export data** for a portable backup.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server.

## Publish with GitHub Pages

1. Create a GitHub repository and upload these files.
2. In **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
3. Open the Pages URL GitHub gives you.

## Conversational food logging

Write a meal in everyday language, such as `For breakfast I had oatmeal and a banana. For lunch I had chicken salad.` The app identifies the meal and individual foods, searches the public Open Food Facts database, and adds calorie estimates to today’s log. Review estimates for branded products and portions. Web search needs an internet connection, while charts, zooming, exporting, and backups work locally.

## Imported history

The dashboard begins with all 168 food entries plus 17 daily calorie totals and available weigh-ins extracted from `tracking food.xlsx` (September 11–27, 2026). Nutrient narrative in the source was not consistently machine-readable, so the app includes the structured vitamin/mineral snapshots it could identify and lets you add the rest as %DV entries.
