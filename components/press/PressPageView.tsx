import type { ComponentProps } from "react";
import NewsletterBlock from "@/components/NewsletterBlock";
import { PressReviewsSection } from "@/components/home/HomeEditorialSections";
import type { HomePress } from "@/lib/admin/home-editorial";

export type PressPageViewData = {
  press: HomePress;
  footer: ComponentProps<typeof NewsletterBlock>;
};

export default function PressPageView({ data, staticPreview = false }: { data: PressPageViewData; staticPreview?: boolean }) {
  // Keep hidden articles out of the client component's serialized public props,
  // not just out of its rendered markup. The editor retains the full draft.
  const press = staticPreview ? data.press : { ...data.press, items: data.press.items.filter(item => item.visible) };
  return <>
    <main>
      <PressReviewsSection data={press} standalone staticPreview={staticPreview} />
    </main>
    <NewsletterBlock {...data.footer} />
  </>;
}
