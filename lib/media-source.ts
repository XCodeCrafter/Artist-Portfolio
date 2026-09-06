const UNSAFE_LOCAL_PATH = /[\\\u0000-\u001f\u007f]/;

function isSafeHttpsUrl(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443")
  );
}

function configuredOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      !isSafeHttpsUrl(url) ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function configuredImageKitUrlEndpoint(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      !isSafeHttpsUrl(url) ||
      url.hostname.toLowerCase() !== "ik.imagekit.io" ||
      url.port ||
      !/^\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname) ||
      url.search ||
      url.hash ||
      value !== `${url.origin}${url.pathname}`
    ) {
      return null;
    }

    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function isSafeLocalMediaPath(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !UNSAFE_LOCAL_PATH.test(value)
  );
}

export function isConfiguredSupabaseMediaSource(value: string) {
  const supabaseOrigin = configuredOrigin(
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  if (!supabaseOrigin) return false;

  try {
    const assetUrl = new URL(value);
    return (
      isSafeHttpsUrl(assetUrl) &&
      assetUrl.origin === supabaseOrigin &&
      assetUrl.pathname.startsWith("/storage/v1/object/public/") &&
      !assetUrl.hash
    );
  } catch {
    return false;
  }
}

export function isConfiguredR2MediaSource(value: string) {
  const mediaOrigin = getConfiguredR2MediaOrigin();
  if (!mediaOrigin) return false;

  try {
    const assetUrl = new URL(value);
    return (
      isSafeHttpsUrl(assetUrl) &&
      assetUrl.origin === mediaOrigin &&
      assetUrl.pathname.startsWith("/media/") &&
      !assetUrl.search &&
      !assetUrl.hash
    );
  } catch {
    return false;
  }
}

export function getConfiguredR2MediaOrigin() {
  return configuredOrigin(process.env.NEXT_PUBLIC_MEDIA_ORIGIN);
}

export function isConfiguredImageKitMediaSource(value: string) {
  const urlEndpoint = getConfiguredImageKitUrlEndpoint();
  if (!urlEndpoint) return false;

  try {
    const endpoint = new URL(urlEndpoint);
    const assetUrl = new URL(value);
    const mediaPathPrefix = `${endpoint.pathname}/media/`;

    return (
      isSafeHttpsUrl(assetUrl) &&
      assetUrl.origin === endpoint.origin &&
      assetUrl.pathname.startsWith(mediaPathPrefix) &&
      assetUrl.pathname.length > mediaPathPrefix.length &&
      !assetUrl.search &&
      !assetUrl.hash
    );
  } catch {
    return false;
  }
}

export function getConfiguredImageKitUrlEndpoint() {
  return configuredImageKitUrlEndpoint(
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
  );
}

export function isConfiguredMediaLibrarySource(value: string) {
  return (
    isConfiguredSupabaseMediaSource(value) ||
    isConfiguredR2MediaSource(value) ||
    isConfiguredImageKitMediaSource(value)
  );
}

export function isSafeManagedMediaSource(value: string) {
  return (
    isSafeLocalMediaPath(value) || isConfiguredMediaLibrarySource(value)
  );
}
