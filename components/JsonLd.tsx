import { headers } from "next/headers";

function serializeJsonLd(data: unknown) {
  return JSON.stringify(data)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export default async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get("x-nonce") || undefined;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      nonce={nonce}
      type="application/ld+json"
    />
  );
}
