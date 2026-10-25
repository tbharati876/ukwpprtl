
# UK Wind Generation Forecast Dashboard

A full-stack web application for analysing UK national wind generation and evaluating day-ahead forecast accuracy using Elexon BMRS data.

## Project Overview

This dashboard compares actual UK wind generation with eligible wind forecasts for January 2026. It presents forecast accuracy metrics, daily trends, and half-hourly observations to support energy procurement analysis.

## Features

- Actual and forecast wind generation comparison
- Mean Absolute Error (MAE)
- Root Mean Squared Error (RMSE)
- Forecast bias
- Forecast coverage percentage
- Daily generation chart
- Searchable half-hourly observations
- CSV export
- Python API with data caching

## Technology Stack

**Frontend:** React, Vite, Recharts, Lucide React, CSS

**Backend:** Python, FastAPI, HTTPX, Uvicorn

**Data source:** Elexon BMRS API

## Data Sources

### Actual Generation

Dataset: FUELHH, filtered for the WIND fuel type.

### Wind Forecasts

Dataset: WINDFOR, using delivery time, publication time, and forecast generation.

## Analysis Period

January 1–31, 2026.

Generation is measured in megawatts (MW). The current analysis assumes a procurement decision cutoff of 11:00 UK time on the preceding calendar day. This assumption should be confirmed against the client's actual decision process.

## Forecast Accuracy Metrics

- **MAE:** Average absolute difference between forecast and actual generation.
- **RMSE:** Square root of the average squared forecast error.
- **Forecast bias:** Mean forecast minus actual generation. Positive values indicate overforecasting.
- **Forecast coverage:** Percentage of actual delivery periods with an eligible forecast.

Coverage and the decision-time assumption should be considered when interpreting the results.

## Run Locally

### Prerequisites

- Python 3.10 or later
- Node.js and npm
- Git

### 1. Start the backend

Open a terminal:

```bash
cd backend
python -m venv .venv
```

On Windows PowerShell, activate the environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies and start the API:

```bash
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

API: http://127.0.0.1:8000

API documentation: http://127.0.0.1:8000/docs

### 2. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm install recharts lucide-react
npm run dev
```

Open the local URL displayed by Vite, usually http://localhost:5173.

Keep both servers running while using the dashboard.

## API Endpoints

- `GET /` — API status
- `GET /api/health` — Health check
- `GET /api/dashboard` — Dashboard data and accuracy metrics
- `GET /api/dashboard?refresh=true` — Request fresh upstream data

## Limitations and Future Improvements

- Investigate periods without eligible forecasts and improve coverage where appropriate.
- Confirm the procurement decision cutoff.
- Add automated tests for data processing and metrics.
- Complete Docker configuration and deployment.
- Add production error monitoring.


