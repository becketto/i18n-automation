import React, { createContext, useContext, ReactNode } from "react";

interface I18nContextType {
    locale: string;
    tr: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

interface I18nProviderProps {
    locale: string;
    translations: Record<string, string>;
    children: ReactNode;
}

export function I18nProvider({
    locale,
    translations,
    children,
}: I18nProviderProps) {
    const tr = (key: string, params?: Record<string, string | number>): string => {
        // Return translation if it exists and is not empty, otherwise return the key itself
        let translation = translations[key];
        if (!translation || translation.trim() === "") {
            translation = key;
        }

        // Replace placeholders if params are provided
        if (params) {
            Object.entries(params).forEach(([paramKey, paramValue]) => {
                translation = translation.replace(
                    new RegExp(`{${paramKey}}`, "g"),
                    String(paramValue)
                );
            });
        }

        return translation;
    };

    return (
        <I18nContext.Provider value={{ locale, tr }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useTr() {
    const context = useContext(I18nContext);
    if (!context) {
        // Fallback if context is missing, still supports params for development/testing
        return (key: string, params?: Record<string, string | number>) => {
            let translation = key;
            if (params) {
                Object.entries(params).forEach(([paramKey, paramValue]) => {
                    translation = translation.replace(
                        new RegExp(`{${paramKey}}`, "g"),
                        String(paramValue)
                    );
                });
            }
            return translation;
        };
    }
    return context.tr;
}

export function useLocale() {
    const context = useContext(I18nContext);
    if (!context) {
        return "en";
    }
    return context.locale;
}
