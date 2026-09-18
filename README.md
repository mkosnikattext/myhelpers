# Text Helper Hub

A local-only helper hub with a CSV title-usage analyzer. Your CSV stays in your browser. The app does not upload it or call any external service.

## Run it

1. Install Node.js 18 or newer if it is not already installed.
2. Open Terminal in this folder.
3. Run `npm start`.
4. Open `http://localhost:4173`.

No `npm install` step is needed. The project uses only Node.js built-in modules and browser APIs.

## Add another helper

Create a folder inside `dist/helpers`. Add an `index.html` file and a `helper.json` file. The local server reads those manifests and adds every valid helper to the hub automatically.

Use this manifest shape:

```json
{
  "name": "Helper name",
  "description": "One clear sentence about the helper.",
  "category": "Data",
  "icon": "table"
}
```

If you open `dist/index.html` directly instead of using `npm start`, the hub uses `dist/helpers/index.json` as a fallback list.
