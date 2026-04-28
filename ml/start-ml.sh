#!/bin/bash
cd /opt/regent-detector/ml
export PYTHONPATH=/opt/regent-detector/ml
exec /opt/regent-detector/ml/venv/bin/python -m uvicorn ml-api:app --host 127.0.0.1 --port 3002
