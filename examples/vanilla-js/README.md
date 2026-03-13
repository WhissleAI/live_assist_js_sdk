# Live Assist Vanilla JS Example

Demonstrates using the Live Assist SDK without React — just plain HTML + ES modules.

## Setup

```bash
# Start the backend services
cd ../../docker
docker compose up -d

# Build the core package first
cd ../../packages/core
npm install && npm run build

# Serve this directory (any static server works)
npx serve .
```

Open the served URL in your browser. Click "Start Session" to begin.

## iframe Integration

You can also embed the SDK widget via iframe if you run the SDK Docker image:

```html
<iframe
  src="http://localhost:3001/widget?agenda=Discuss+roadmap,Review+metrics"
  width="400"
  height="600"
  allow="microphone; display-capture"
/>
```
