#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const appDir = path.join(projectRoot, "app");

const dryRun = process.argv.includes("--dry-run");

if (dryRun) {
    console.log("🏃 DRY RUN MODE: No files will be modified.\n");
}

function findInsertionIndex(content) {
    // Regex explanation:
    // 1. Optional export/default
    // 2. Component defined as function: (async )? function Name
    // 3. Component defined as const: const Name = (async )? ( or function
    //    This checks for '(' or 'function' after the equals to avoid matching regular constants like ALLOWED_DOMAIN
    const componentRegex =
        /(?:export\s+)?(?:default\s+)?(?:(?:async\s+)?function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*=\s*(?:async\s*)?(?:\(|function))/g;

    let match;
    while ((match = componentRegex.exec(content)) !== null) {
        const name = match[1] || match[2];
        // Skip common non-component exports in Remix
        if (
            [
                "loader",
                "action",
                "meta",
                "headers",
                "links",
                "ErrorBoundary",
            ].includes(name)
        )
            continue;

        // For 'const' matches, the match ends before the parameters.
        // For 'function' matches, we need to be careful.

        let idx = match.index + match[0].length;

        // Skip whitespace
        while (idx < content.length && /\s/.test(content[idx])) idx++;

        // Skip Parentheses (arguments) - This handles (props) or ({ prop })
        if (content[idx] === "(") {
            let depth = 1;
            idx++;
            while (idx < content.length && depth > 0) {
                if (content[idx] === "(") depth++;
                else if (content[idx] === ")") depth--;
                idx++;
            }
        }

        // Find next '{' which should be the function body start
        while (idx < content.length) {
            if (content[idx] === "{") {
                return idx + 1;
            }
            idx++;
        }
    }
    return -1;
}

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });

    return arrayOfFiles;
}

const files = getAllFiles(appDir);
let modifiedFiles = [];
let errorCount = 0;

// Files/Directories to EXCLUDE for safety
const EXCLUDED_PATHS = [
    "app/root.jsx",
    "app/entry.client.tsx",
    "app/entry.server.jsx",
    "app/routes/auth.login",
    "app/emailTemplates",
    "contexts/I18nContext",
];

files.forEach((file) => {
    try {
        const relativeFilePath = path.relative(projectRoot, file);

        // Check exclusions
        if (
            EXCLUDED_PATHS.some((excluded) => relativeFilePath.includes(excluded))
        ) {
            return;
        }

        let content = fs.readFileSync(file, "utf8");
        let originalContent = content;

        // Helper to safely wrap text in tr()
        const wrapInTr = (text) => {
            let safeText = text.trim();
            safeText = safeText.replace(/"/g, '\\"');
            safeText = safeText.replace(/\n/g, "\\n");
            safeText = safeText.replace(/\r/g, "");
            safeText = safeText.replace(/\s+/g, " "); // Collapse spaces
            return `{tr("${safeText}")}`;
        };

        // 1. Wrap <Text> content
        content = content.replace(
            /(<Text[^>]*>)([^<{]+)(<\/Text>)/g,
            (match, openTag, text, closeTag) => {
                const trimmed = text.trim();
                if (!trimmed) return match;

                if (dryRun)
                    console.log(
                        `[${relativeFilePath}] Wrapping Text: "${trimmed.substring(0, 50)}..."`
                    );
                return `${openTag}${wrapInTr(text)}${closeTag}`;
            }
        );

        // 2. Wrap <Button> content
        content = content.replace(
            /(<Button[^>]*>)([^<{]+)(<\/Button>)/g,
            (match, openTag, text, closeTag) => {
                const trimmed = text.trim();
                if (!trimmed) return match;

                // Safety: If it looks like code, skip it
                if (trimmed.includes("=>") || trimmed.includes("}")) return match;

                if (dryRun)
                    console.log(
                        `[${relativeFilePath}] Wrapping Button: "${trimmed.substring(0, 50)}..."`
                    );
                return `${openTag}${wrapInTr(text)}${closeTag}`;
            }
        );

        // 2b. Wrap <Badge> content (but skip single words like "Yes"/"No")
        content = content.replace(
            /(<Badge[^>]*>)([^<{]+)(<\/Badge>)/g,
            (match, openTag, text, closeTag) => {
                const trimmed = text.trim();
                if (!trimmed) return match;

                // Skip single words or very short content
                if (trimmed.match(/^[A-Za-z]{1,6}$/) || trimmed.length < 4)
                    return match;

                // Safety: If it looks like code, skip it
                if (
                    trimmed.includes("=>") ||
                    trimmed.includes("}") ||
                    trimmed.includes("${")
                )
                    return match;

                if (dryRun)
                    console.log(
                        `[${relativeFilePath}] Wrapping Badge: "${trimmed.substring(0, 50)}..."`
                    );
                return `${openTag}${wrapInTr(text)}${closeTag}`;
            }
        );

        // 3. Wrap toast messages (simple ones without template literals)
        content = content.replace(
            /app\.toast\.show\s*\(\s*(['"`])([^'"`{$]+)\1/g,
            (match, quote, message) => {
                const trimmed = message.trim();
                if (!trimmed || trimmed.length < 4) return match;

                // Skip if contains template literal syntax or variables
                if (
                    message.includes("${") ||
                    message.includes("`") ||
                    message.includes("||")
                )
                    return match;

                if (dryRun)
                    console.log(
                        `[${relativeFilePath}] Wrapping toast: "${message.substring(0, 50)}..."`
                    );
                return `app.toast.show(tr("${message.replace(/"/g, '\\"')}"),`;
            }
        );

        // 4. Wrap simple object message properties (but skip complex ones)
        content = content.replace(
            /(\s+message\s*:\s*)(['"`])([^'"`{$\n]{4,80})\2([,\s])/g,
            (match, prefix, quote, message, suffix) => {
                const trimmed = message.trim();

                // Skip technical/API messages or ones with variables
                if (
                    message.includes("${") ||
                    message.includes("API") ||
                    message.includes("failed") ||
                    message.includes("error") ||
                    message.includes("not configured") ||
                    message.includes("environment") ||
                    message.length > 60
                ) {
                    return match;
                }

                // Only translate user-facing success messages
                if (
                    message.includes("successfully") ||
                    message.includes("saved") ||
                    message.includes("completed") ||
                    message.includes("cleared")
                ) {
                    if (dryRun)
                        console.log(
                            `[${relativeFilePath}] Wrapping message: "${message.substring(0, 50)}..."`
                        );
                    return `${prefix}tr("${message.replace(/"/g, '\\"')}")${suffix}`;
                }

                return match;
            }
        );

        // 5. Wrap attributes
        const attributes = [
            "ariaLabel",
            "content",
            "label",
            "placeholder",
            "title",
            "helpText",
        ];

        attributes.forEach((attr) => {
            // STRICT regex: value must not contain { or } or newline
            const regex = new RegExp(`\\b${attr}=(['"])([^"{}\n]{1,200})\\1`, "g");

            content = content.replace(regex, (match, quote, value) => {
                if (value.trim() === "") return match;

                // Double check for technical values in 'content' attribute
                if (attr === "content") {
                    if (
                        value.includes("width=") ||
                        value.includes("http-equiv") ||
                        value.includes("charset")
                    ) {
                        return match;
                    }
                }

                if (dryRun)
                    console.log(
                        `[${relativeFilePath}] Wrapping ${attr}: "${value.substring(0, 50)}..."`
                    );
                return `${attr}={tr("${value.replace(/"/g, '\\"')}")}`;
            });
        });

        // 6. Wrap simple throw Error messages (but skip technical ones)
        content = content.replace(
            /throw new Error\s*\(\s*(['"`])([^'"`{$\n]{4,80})\1\s*\)/g,
            (match, quote, errorMsg) => {
                // Skip technical error messages
                if (
                    errorMsg.includes("API") ||
                    errorMsg.includes("not configured") ||
                    errorMsg.includes("environment variable") ||
                    errorMsg.includes("Failed to") ||
                    errorMsg.includes("Invalid") ||
                    errorMsg.length > 50 ||
                    errorMsg.includes("${") ||
                    errorMsg.includes("not found")
                ) {
                    return match;
                }

                // Only translate simple user-facing error messages
                if (errorMsg.match(/^[A-Z][a-z\s]{10,}$/)) {
                    if (dryRun)
                        console.log(
                            `[${relativeFilePath}] Wrapping error: "${errorMsg.substring(0, 50)}..."`
                        );
                    return `throw new Error(tr("${errorMsg}"))`;
                }

                return match;
            }
        );

        // 7. Ensure Import and Hook are present if 'tr' is used
        // Check if we need to add boilerplate even if no new text was wrapped (e.g. broken previous run)
        const hasTrUsage = content.includes("tr(") || content.includes("{tr(");

        if (content !== originalContent || hasTrUsage) {
            // Check for useTr import
            let hasImport = content.includes("useTr");

            if (!hasImport) {
                const fileDir = path.dirname(file);
                const relativePath = path.relative(
                    fileDir,
                    path.join(appDir, "contexts/I18nContext")
                );
                let importPath = relativePath.startsWith(".")
                    ? relativePath
                    : "./" + relativePath;
                importPath = importPath.replace(/\\/g, "/");

                content = `import { useTr } from "${importPath}";\n` + content;
            }

            // IMPROVED HOOK INSERTION STRATEGY - 2-Step Approach
            // 1. Find component definition
            // 2. Find next {

            // Check if hook is already there to avoid duplicates
            if (!content.includes("const tr = useTr")) {
                const insertionIndex = findInsertionIndex(content);

                if (insertionIndex !== -1) {
                    const before = content.slice(0, insertionIndex);
                    const after = content.slice(insertionIndex);

                    // Use 4 spaces for indentation to match typical project style
                    content = before + "\n    const tr = useTr();" + after;

                    if (dryRun) console.log(`[${relativeFilePath}] Inserted hook.`);
                } else {
                    if (dryRun)
                        console.log(
                            `[${relativeFilePath}] No component found for hook insertion.`
                        );
                }
            }
        }

        if (content !== originalContent) {
            if (!dryRun) {
                fs.writeFileSync(file, content);
                console.log(`Updated: ${relativeFilePath}`);
            }
            modifiedFiles.push(file);
        }
    } catch (err) {
        console.error(`❌ Error processing ${file}:`, err);
        errorCount++;
    }
});

if (modifiedFiles.length === 0) {
    console.log("No files needed updating.");
} else {
    console.log(
        `\nSuccess! ${dryRun ? "Identified" : "Updated"} ${modifiedFiles.length} files.`
    );
    if (errorCount > 0) console.log(`⚠️  Encountered ${errorCount} errors.`);
}
