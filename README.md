# Regent Agent Detector

Detect and classify non-human traffic on your website, including early-stage autonomous AI agents.

## What it does

- Identifies non-human traffic (bots / automation)
- Assigns risk score
- Flags probable AI agent behavior
- Provides explainable signals

## What it is NOT

- Not a KYC/KYA system
- Not guaranteed identification of AI agents
- Not a bot blocker

## Installation

```html
<script src="https://your-cdn/detector.js"></script>

## Output Example
The detector provides a JSON object with classification and underlying signals:
```json
{
  "type": "probable_agent",
  "risk_score": 78,
  "signals": [
    "headless browser",
    "no plugins",
    "linear navigation"
  ]
}

Why Agent Awareness?
As autonomous agents (AI users) become common, websites need a layer to differentiate between human users, traditional bots, and agentic AI. Regent Agent Detector is the first step toward Know Your Agent (KYA) compliance.

Disclaimer
Early-stage AI agent detection is probabilistic and for informational purposes only.
