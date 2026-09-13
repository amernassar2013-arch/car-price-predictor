from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from google import genai 
import time
load_dotenv()

app = Flask(__name__)
CORS(app)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# تحميل الموديل وأسماء الأعمدة وقواميس التكرار مرة وحدة عند بدء التشغيل
model = joblib.load("car_price_model.pkl")
with open("model_columns.json", "r", encoding="utf-8") as f:
    model_columns = json.load(f)
with open("freq_maps.json", "r", encoding="utf-8") as f:
    freq_maps = json.load(f)

make_freq_map = freq_maps["make_freq_map"]
model_freq_map = freq_maps["model_freq_map"]
trim_freq_map = freq_maps["trim_freq_map"]

FUEL_COLUMNS = [
    "fuel_بنزين", "fuel_ديزل", "fuel_كهربائي",
    "fuel_مايلد هايبرد", "fuel_هايبرد", "fuel_هايبرد - Plug-in"
]
ORIGIN_COLUMNS = [
    "origin_مواصفات أخرى", "origin_مواصفات أمريكية", "origin_مواصفات أوروبية",
    "origin_مواصفات خليجية", "origin_مواصفات صينية", "origin_مواصفات كوريا",
    "origin_مواصفات يابانية", "origin_وارد وكالة"
]

def prepare_features(data):
    row = {col: 0 for col in model_columns}

    # mileage (log1p متل التدريب)
    mileage_raw = data.get("mileage") or 0
    try:
        mileage = float(mileage_raw)
    except (ValueError, TypeError):
        mileage = 0
    row["mileage"] = np.log1p(mileage)

    # car_age و is_new من year
    year = data.get("year")
    if year:
        try:
            year_int = int(year)
            current_year = datetime.now().year
            car_age = max(current_year - year_int, 0)
            row["car_age"] = car_age
            row["is_new"] = 1 if car_age <= 0 else 0
        except (ValueError, TypeError):
            pass
    # fuel_type -> one-hot
    fuel = data.get("fuel_type")
    fuel_col = f"fuel_{fuel}" if fuel else None
    if fuel_col in FUEL_COLUMNS:
        row[fuel_col] = 1

    # origin -> one-hot
    origin = data.get("origin")
    origin_col = f"origin_{origin}" if origin else None
    if origin_col in ORIGIN_COLUMNS:
        row[origin_col] = 1

    # make/model/trim -> frequency encoding (0 لو غير معروف بالبيانات)
    make = data.get("make")
    model_name = data.get("model")
    row["make_freq"] = make_freq_map.get(make, 0)
    row["model_freq"] = model_freq_map.get(model_name, 0)

    # trim مش موجود من /api/parse حاليًا، فنعتبره ناقص
    row["trim_freq"] = 0
    row["trim_missing"] = 1

    # insp_score/insp_is_assumed مش موجودين من /api/parse، قيم افتراضية
    row["insp_score"] = 0
    row["insp_is_assumed"] = 1
    row["insp_missing"] = 1

    return row

@app.route("/api/ping")
def ping():
    return jsonify({"status": "فعال"})

@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.get_json()

    row = prepare_features(data)
    X_input = pd.DataFrame([row])[model_columns]

    pred_log = model.predict(X_input)[0]
    pred_price = np.expm1(pred_log)

    return jsonify({"price": round(float(pred_price), 2), "mae": 3534})

@app.route("/api/parse", methods=["POST"])
def parse_text():
    data = request.get_json()
    user_text = data.get("text", "")

    prompt = f"""
استخرج من النص التالي بيانات السيارة وارجعها بصيغة JSON فقط بدون أي شرح إضافي وبدون علامات ```.
الحقول المطلوبة بالضبط: make, model, year, mileage, fuel_type, condition, origin.
حقل origin يقصد به بلد المنشأ/المواصفات، وقيمته لازم تكون واحدة بالضبط من هاي القائمة (انسخها حرفياً كما هي):
["مواصفات أخرى", "مواصفات أمريكية", "مواصفات أوروبية", "مواصفات خليجية", "مواصفات صينية", "مواصفات كوريا", "مواصفات يابانية", "وارد وكالة"]
إذا حقل غير مذكور بالنص، رجّعه null.

النص: "{user_text}"
"""

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-3.8-flash",
                contents=prompt
            )
            break
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(2)

    raw_text = response.text.strip()
    raw_text = raw_text.replace("```json", "").replace("```", "").strip()

    try:
        extracted = json.loads(raw_text)
    except json.JSONDecodeError:
        return jsonify({"error": "تعذر تحليل رد Gemini", "raw": raw_text}), 500

    return jsonify(extracted)

if __name__ == "__main__":
    app.run(debug=True)