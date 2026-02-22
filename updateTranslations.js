#!/usr/bin/env node
/**
 * updateTranslations script - Extracts tr() calls and syncs translation files
 *
 * Usage:
 *   npm run update-translations
 *
 * This script:
 * 1. Scans all app files recursively for tr("...") calls
 * 2. Compares with existing en.json (canonical file)
 * 3. Removes orphaned keys from all translation files
 * 4. Adds new keys to all translation files (empty for non-en, identity for en)
 * 5. Generates app/translations/toTranslate.json for AI translation
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const appDir = path.join(projectRoot, "app");
const translationsDir = path.join(appDir, "translations");

// Supported locales (add new ones here)
const SUPPORTED_LOCALES = [
    "en", // English
    "de", // German
    "fr", // French
    "es", // Spanish
    "sv", // Swedish
    "pt-br", // Portuguese (Brazil)
    "it", // Italian
    "nl", // Dutch
    "ja", // Japanese
    "ko", // Korean
    "zh-cn", // Chinese (Simplified)
    "zh-tw", // Chinese (Traditional)
    "tr", // Turkish
    "th", // Thai
    "pl", // Polish
    "ar", // Arabic
    "da", // Danish
    "fi", // Finnish
    "id", // Indonesian
    "ms", // Malay
];
const CANONICAL_LOCALE = "en";

/**
 * Extract tr() calls from a file with a simple parser.
 * Only matches string literals for the first argument.
 * Skips keys with newlines or template expressions.
 */
function extractTrCallsFromFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const keys = [];
    const trCallRegex = /\btr\s*\(/g;

    let match;
    while ((match = trCallRegex.exec(content)) !== null) {
        let index = match.index + match[0].length;

        // Skip whitespace
        while (index < content.length && /\s/.test(content[index])) {
            index += 1;
        }

        const quote = content[index];
        if (!quote || (quote !== '"' && quote !== "'" && quote !== "`")) {
            continue;
        }

        index += 1;
        let value = "";
        let hasNewline = false;
        let hasTemplateExpression = false;
        let escaped = false;

        while (index < content.length) {
            const char = content[index];

            if (escaped) {
                value += char;
                escaped = false;
                index += 1;
                continue;
            }

            if (char === "\\") {
                escaped = true;
                index += 1;
                continue;
            }

            if (quote === "`" && char === "$" && content[index + 1] === "{") {
                hasTemplateExpression = true;
            }

            if (char === quote) {
                break;
            }

            if (char === "\n") {
                hasNewline = true;
            }

            value += char;
            index += 1;
        }

        if (index >= content.length) {
            continue;
        }

        if (!value || hasNewline || hasTemplateExpression) {
            continue;
        }

        if (!keys.includes(value)) {
            keys.push(value);
        }
    }

    return keys;
}

/**
 * Recursively find all .ts, .tsx, .js, .jsx files in app/
 */
function findSourceFiles(dir) {
    const files = [];

    function scanDirectory(currentDir) {
        const entries = fs.readdirSync(currentDir);

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // Skip node_modules, build, etc.
                if (!["node_modules", "build", ".git"].includes(entry)) {
                    scanDirectory(fullPath);
                }
            } else if (stat.isFile()) {
                // Only include source files
                if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
                    files.push(fullPath);
                }
            }
        }
    }

    scanDirectory(dir);
    return files;
}

/**
 * Extract all unique tr() keys from the app
 */
function extractAllTrKeys() {
    const sourceFiles = findSourceFiles(appDir);
    const allKeys = [];

    console.log(`Scanning ${sourceFiles.length} source files...`);

    for (const filePath of sourceFiles) {
        const keys = extractTrCallsFromFile(filePath);
        if (keys.length > 0) {
            console.log(
                `  ${path.relative(projectRoot, filePath)}: ${keys.join(", ")}`
            );
            for (const key of keys) {
                if (!allKeys.includes(key)) {
                    allKeys.push(key);
                }
            }
        }
    }

    return allKeys.sort(); // Keep consistent ordering
}

/**
 * Load existing translation file or return empty object
 */
function loadTranslationFile(locale) {
    const filePath = path.join(translationsDir, `${locale}.json`);

    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(content);
    } catch (error) {
        console.warn(`Warning: Could not load ${locale}.json, creating new file`);
        return {};
    }
}

/**
 * Save translation file with proper formatting
 */
function saveTranslationFile(locale, translations) {
    const filePath = path.join(translationsDir, `${locale}.json`);

    // Ensure directory exists
    fs.mkdirSync(translationsDir, { recursive: true });

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
    console.log("🔍 Extracting translation keys...\n");

    // Step 1: Extract all tr() keys from source code
    const extractedKeys = extractAllTrKeys();
    console.log(`\n✅ Found ${extractedKeys.length} unique tr() keys`);

    // Step 2: Load canonical file (en.json)
    const canonicalTranslations = loadTranslationFile(CANONICAL_LOCALE);
    const existingKeys = Object.keys(canonicalTranslations);

    // Step 3: Calculate diffs
    const removedKeys = existingKeys.filter(
        (key) => !extractedKeys.includes(key)
    );
    const newKeys = extractedKeys.filter((key) => !existingKeys.includes(key));

    console.log(`\n📊 Changes:`);
    console.log(`  - Removed: ${removedKeys.length} keys`);
    console.log(`  - New: ${newKeys.length} keys`);

    if (removedKeys.length > 0) {
        console.log(`\n🗑️  Removed keys: ${removedKeys.join(", ")}`);
    }

    if (newKeys.length > 0) {
        console.log(`\n➕ New keys: ${newKeys.join(", ")}`);
    }

    // Step 4: Update all translation files
    console.log(`\n🔄 Updating translation files...`);

    const toTranslate = {};

    for (const locale of SUPPORTED_LOCALES) {
        const currentTranslations = loadTranslationFile(locale);
        const updatedTranslations = {};

        // Keep existing translations for keys that still exist
        for (const key of extractedKeys) {
            if (existingKeys.includes(key)) {
                // Keep existing translation, but check if it's missing/empty for non-canonical locales
                const existingValue = currentTranslations[key];
                if (locale === CANONICAL_LOCALE) {
                    updatedTranslations[key] = existingValue || key; // Identity mapping for canonical
                } else {
                    updatedTranslations[key] = existingValue || "";
                    // If translation is missing or empty, add to toTranslate
                    if (!existingValue || existingValue.trim() === "") {
                        if (!toTranslate[locale]) {
                            toTranslate[locale] = {};
                        }
                        toTranslate[locale][key] = "";
                    }
                }
            } else {
                // New key
                if (locale === CANONICAL_LOCALE) {
                    // For canonical locale, use identity mapping
                    updatedTranslations[key] = key;
                } else {
                    // For other locales, leave empty (to be translated)
                    updatedTranslations[key] = "";

                    // Add to toTranslate
                    if (!toTranslate[locale]) {
                        toTranslate[locale] = {};
                    }
                    toTranslate[locale][key] = "";
                }
            }
        }

        saveTranslationFile(locale, updatedTranslations);
    }

    // Step 5: Generate toTranslate.json if there are new keys
    if (Object.keys(toTranslate).length > 0) {
        const toTranslatePath = path.join(translationsDir, "toTranslate.json");
        fs.writeFileSync(
            toTranslatePath,
            JSON.stringify(toTranslate, null, 2) + "\n"
        );
    } else {
        console.log(`\n All translation files are up to date!`);
    }
}

// Run the script
main();
