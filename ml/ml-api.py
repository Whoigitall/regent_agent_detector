from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import onnxruntime as ort
import json

app = FastAPI(title='Regent ML Inference API', version='2.1.0')

MODEL_PATH = '/opt/regent-detector/ml/agent_detector.onnx'
session = ort.InferenceSession(MODEL_PATH)

CLASSES = ['aggressive_bot', 'human_trader', 'market_maker', 'wash_trader']
CLASS_MAP = {
    'aggressive_bot': 'bot',
    'human_trader': 'human', 
    'market_maker': 'ai_agent',
    'wash_trader': 'robot'
}

class DetectionRequest(BaseModel):
    mouse_events: int = 0
    time_on_page: float = 0
    scroll_events: int = 0
    click_count: int = 0
    keystroke_events: int = 0
    plugins: int = 0
    hardware_concurrency: int = 0
    page_views: int = 0
    webdriver: bool = False
    headless: bool = False

class DetectionResponse(BaseModel):
    ml_class: str
    mapped_class: str
    confidence: float
    all_probabilities: dict
    method: str

@app.get('/health')
def health():
    return {'status': 'ok', 'model': 'loaded', 'version': '2.1.0'}

@app.post('/predict', response_model=DetectionResponse)
def predict(req: DetectionRequest):
    try:
        features = [
            req.mouse_events / 100.0,
            req.time_on_page,
            0.8 if req.mouse_events > 0 and req.keystroke_events == 0 else 0.3,
            sum([req.mouse_events > 0, req.scroll_events > 0, req.keystroke_events > 0]) / 3.0,
            req.click_count / 50.0,
            0.5,
            req.time_on_page,
            0.7,
            100.0,
            min((50 if req.webdriver else 0) + (30 if req.headless else 0) + (20 if req.plugins == 0 else 0), 100)
        ]
        
        input_tensor = np.array([features], dtype=np.float32)
        outputs = session.run(None, {'float_input': input_tensor})
        
        # outputs[0] = ndarray of labels, e.g. ['human_trader']
        # outputs[1] = list of dicts, e.g. [{'aggressive_bot': 0.0, 'human_trader': 0.99, ...}]
        label_output = outputs[0]
        prob_list = outputs[1] if len(outputs) > 1 else None
        
        predicted_class = str(label_output[0])
        if isinstance(predicted_class, bytes):
            predicted_class = predicted_class.decode('utf-8')
        
        mapped_class = CLASS_MAP.get(predicted_class, predicted_class)
        
        if prob_list is not None and len(prob_list) > 0:
            all_probs = prob_list[0]  # dict
            confidence = float(all_probs.get(predicted_class, 0.0))
        else:
            confidence = 0.8
            all_probs = {cls: 0.25 for cls in CLASSES}
            all_probs[predicted_class] = confidence
        
        return DetectionResponse(
            ml_class=predicted_class,
            mapped_class=mapped_class,
            confidence=confidence,
            all_probabilities=all_probs,
            method='onnx:random_forest'
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=3002)
