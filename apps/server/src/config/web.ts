export function getWebAppUrl(): string {
  const configuredUrl = process.env.WEB_APP_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:5173";
  }

  throw new Error("Missing WEB_APP_URL");
}
