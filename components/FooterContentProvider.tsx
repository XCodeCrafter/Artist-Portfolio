"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_FOOTER_CONTENT, type FooterContent } from "@/lib/content/footer";

const FooterContentContext = createContext<FooterContent>(DEFAULT_FOOTER_CONTENT);

export default function FooterContentProvider({ content, children }: { content?: FooterContent; children: ReactNode }) {
  return <FooterContentContext.Provider value={content ?? DEFAULT_FOOTER_CONTENT}>{children}</FooterContentContext.Provider>;
}

export function useFooterContent() { return useContext(FooterContentContext); }
