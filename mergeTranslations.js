#!/usr/bin/env node
/**
 * mergeTranslations script - Merges translated content from toTranslate.json back into locale files
 *
 * Usage:
 *   npm run merge-translations
 *
 * This script:
 * 1. Reads app/translations/toTranslate.json
 * 2. Merges the translations into the respective locale files
 * 3. Cleans up toTranslate.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const translationsDir = path.join(projectRoot, "app", "translations");
const toTranslatePath = path.join(translationsDir, "toTranslate.json");

/**
 * Load translation file
 */
function loadTranslationFile(locale) {
    const filePath = path.join(translationsDir, `${locale}.json`);

    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    } catch (error) {
        throw new Error(`Could not load ${locale}.json: ${error}`);
    }
}

/**
 * Save translation file with proper formatting
 */
function saveTranslationFile(locale, translations) {
    const filePath = path.join(translationsDir, `${locale}.json`);

    // Write with consistent formatting (2 spaces, sorted keys)
    const sortedTranslations = {};
    const sortedKeys = Object.keys(translations).sort();

    for (const key of sortedKeys) {
        sortedTranslations[key] = translations[key];
    }

    fs.writeFileSync(
        filePath,
        JSON.stringify(sortedTranslations, null, 2) + "\n"
    );
}

/**
 * Main script logic
 */
function main() {
    console.log("🔄 Merging translations...\n");

    // Check if toTranslate.json exists
    if (!fs.existsSync(toTranslatePath)) {
        console.log("❌ No toTranslate.json found. Run updateTranslations first.");
        process.exit(1);
    }

    // Load toTranslate.json
    let toTranslateData;
    try {
        const content = fs.readFileSync(toTranslatePath, "utf-8");
        toTranslateData = JSON.parse(content);
    } catch (error) {
        console.error("❌ Error reading toTranslate.json:", error);
        process.exit(1);
    }

    console.log(
        `📄 Found translations for locales: ${Object.keys(toTranslateData).join(", ")}`
    );

    // Validate format and check for untranslated content
    let hasEmptyTranslations = false;
    const allEmptyTranslations = [];

    for (const [locale, translations] of Object.entries(toTranslateData)) {
        if (typeof translations !== "object" || translations === null) {
            console.error(
                `❌ Invalid format in toTranslate.json for locale '${locale}'`
            );
            process.exit(1);
        }

        // Check for empty translations
        const emptyTranslations = Object.entries(translations).filter(
            ([key, value]) => !value || value.trim() === ""
        );
        if (emptyTranslations.length > 0) {
            hasEmptyTranslations = true;
            allEmptyTranslations.push(
                ...emptyTranslations.map(([key]) => `${locale}: "${key}"`)
            );
        }
    }

    // Exit if there are untranslated items
    if (hasEmptyTranslations) {
        console.error(`❌ toTranslate.json hasn't been fully translated yet!`);
        console.error(`\n🚨 The following translations are still empty:`);
        for (const item of allEmptyTranslations) {
            console.error(`   - ${item}`);
        }
        console.error(
            `\n💡 Please translate all empty strings before running merge.`
        );
        process.exit(1);
    }

    // Merge translations into locale files
    let totalMerged = 0;

    for (const [locale, newTranslations] of Object.entries(toTranslateData)) {
        try {
            const currentTranslations = loadTranslationFile(locale);

            // Merge new translations (only overwrite if new value is not empty)
            let mergedCount = 0;
            for (const [key, value] of Object.entries(newTranslations)) {
                if (value && value.trim() !== "") {
                    currentTranslations[key] = value;
                    mergedCount++;
                }
            }

            saveTranslationFile(locale, currentTranslations);
            console.log(`✅ ${locale}.json: merged ${mergedCount} translations`);
            totalMerged += mergedCount;
        } catch (error) {
            console.error(`❌ Error merging translations for '${locale}':`, error);
        }
    }

    if (totalMerged > 0) {
        // Delete toTranslate.json (since all translations were applied successfully)
        fs.unlinkSync(toTranslatePath);

        console.log(`\n🎉 Successfully merged ${totalMerged} translations`);
        console.log(`🗑️  Deleted toTranslate.json (all translations applied)`);
    } else {
        console.log(
            `\n⚠️  No translations were merged (this shouldn't happen if validation passed)`
        );
    }
}

// Run the script
main();
