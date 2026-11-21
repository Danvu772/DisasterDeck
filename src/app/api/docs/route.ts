// Owned by Role 1. GET /api/docs: Swagger UI for /api/openapi.json.
// A plain HTML page that loads Swagger UI from the jsDelivr CDN (pinned version), so it adds
// no dependency and stays out of the app's layout, styles and login redirect.
export const runtime = "nodejs";

const SWAGGER = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.0";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Disaster Deck API</title>
  <link rel="stylesheet" href="${SWAGGER}/swagger-ui.css" />
  <style>body { margin: 0; background: #fff; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: true,   // keeps the agent key or demo user across reloads
      tryItOutEnabled: true,
      displayRequestDuration: true,
      withCredentials: true,        // send the SSOJet session cookie when signed in
    });
  </script>
</body>
</html>`;

export function GET(): Response {
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
