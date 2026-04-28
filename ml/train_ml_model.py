import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import json

# Generate synthetic data
np.random.seed(42)
n_samples = 2000

# Classes: human_trader, aggressive_bot, market_maker, wash_trader
classes = ['human_trader', 'aggressive_bot', 'market_maker', 'wash_trader']
n_classes = len(classes)

# Features: trade_frequency, avg_order_size, time_pattern_regularity, price_deviation, cancel_rate, win_rate, avg_hold_time, correlation_with_market, latency_ms, risk_score
X = []
y = []

for i, cls in enumerate(classes):
    n = n_samples // n_classes
    if cls == 'human_trader':
        # Human: varied behavior, medium latency, moderate risk
        freq = np.random.normal(5, 2, n)
        size = np.random.normal(1000, 500, n)
        pattern = np.random.normal(0.3, 0.2, n)  # Low regularity
        deviation = np.random.normal(0.5, 0.3, n)
        cancel = np.random.normal(0.2, 0.1, n)
        win = np.random.normal(0.55, 0.15, n)
        hold = np.random.normal(300, 200, n)
        corr = np.random.normal(0.4, 0.3, n)
        latency = np.random.normal(150, 80, n)
        risk = np.random.normal(30, 20, n)
    elif cls == 'aggressive_bot':
        # Bot: high freq, low latency, very regular
        freq = np.random.normal(50, 10, n)
        size = np.random.normal(5000, 1000, n)
        pattern = np.random.normal(0.9, 0.05, n)
        deviation = np.random.normal(0.1, 0.05, n)
        cancel = np.random.normal(0.8, 0.1, n)
        win = np.random.normal(0.45, 0.1, n)
        hold = np.random.normal(5, 2, n)
        corr = np.random.normal(0.8, 0.1, n)
        latency = np.random.normal(10, 5, n)
        risk = np.random.normal(80, 10, n)
    elif cls == 'market_maker':
        # AI Agent: balanced, medium-high freq, systematic
        freq = np.random.normal(20, 5, n)
        size = np.random.normal(10000, 2000, n)
        pattern = np.random.normal(0.7, 0.1, n)
        deviation = np.random.normal(0.3, 0.1, n)
        cancel = np.random.normal(0.5, 0.1, n)
        win = np.random.normal(0.6, 0.1, n)
        hold = np.random.normal(60, 20, n)
        corr = np.random.normal(0.9, 0.05, n)
        latency = np.random.normal(50, 20, n)
        risk = np.random.normal(50, 15, n)
    else:  # wash_trader
        # Robot: random, high deviation, low win
        freq = np.random.normal(100, 20, n)
        size = np.random.normal(100, 50, n)
        pattern = np.random.normal(0.2, 0.3, n)
        deviation = np.random.normal(0.8, 0.1, n)
        cancel = np.random.normal(0.9, 0.05, n)
        win = np.random.normal(0.2, 0.1, n)
        hold = np.random.normal(1, 0.5, n)
        corr = np.random.normal(0.1, 0.1, n)
        latency = np.random.normal(5, 3, n)
        risk = np.random.normal(90, 8, n)
    
    X_cls = np.column_stack([freq, size, pattern, deviation, cancel, win, hold, corr, latency, risk])
    X.append(X_cls)
    y.extend([cls] * n)

X = np.vstack(X)
y = np.array(y)

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# Train model
model = RandomForestClassifier(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1)
model.fit(X_train, y_train)

# Predictions
y_pred = model.predict(X_test)

# Metrics
metrics = {
    'accuracy': float(accuracy_score(y_test, y_pred)),
    'precision': float(precision_score(y_test, y_pred, average='weighted')),
    'recall': float(recall_score(y_test, y_pred, average='weighted')),
    'f1': float(f1_score(y_test, y_pred, average='weighted')),
    'classification_report': classification_report(y_test, y_pred, output_dict=True)
}

# Save metrics
with open('training_metrics.json', 'w') as f:
    json.dump(metrics, f, indent=2)

# Convert to ONNX
initial_type = [('float_input', FloatTensorType([None, 10]))]
onnx_model = convert_sklearn(model, initial_types=initial_type, target_opset=13)

with open('agent_detector.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())

print(f'Model trained: accuracy={metrics["accuracy"]:.4f}')
print(f'ONNX model saved: agent_detector.onnx')
