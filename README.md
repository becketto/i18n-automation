# Automate i18n translation in React apps using AI for translations (No new packages required)

Automate i18n translation in React applications using plain English keys, easily translate with AI. No translation api setup required.

### Works with React, Remix, Next.js, or any JSON-based i18n setup.

This workflow eliminates traditional translation key overhead by:
- Using English strings as translation keys
- Automatically detecting missing translations
- Batch-translating with AI
- Auto-cleaning unused locale entries

Designed for modern React apps using JSON-based i18n.

## The problem:

The "traditional" way of handling react translations is inefficient and adds permanent complexity.

### The "traditional" way:
- Use abstract key structure like `tr("route.section.name")`
- Manually update the translation in each locale file

## The solution:

Use plain English for keys and update translations with a script.

## How to use:
- Write normal English, wrap in `tr("...")`
- Run `node updateTranslations.js` → it collects missing strings into `toTranslate.json`
- Paste into AI → get translations
- Run `node mergeTranslations.js` to merge translations → done

## Features

- English strings as translation keys
- Automatic missing-key detection
- AI batch translation workflow
- JSON locale file merging
- Automatic removal of unused keys
- Works with any React app using an i18n `tr()` helper


**For more information, see my blog post about this: [becketto.com/blog/programmaticTranslation](https://becketto.com/blog/programmaticTranslation)**

The blog post covers:
- Why English keys work better than the abstract keys
- Implementation details
- Auto-cleaning locale files
- Handling edge cases


React Codebase
   ↓
updateTranslations.js
   ↓
toTranslate.json
   ↓
AI Translation
   ↓
mergeTranslations.js
   ↓
Locale JSON Files