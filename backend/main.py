
import asyncio
import math
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
LONDON = ZoneInfo("Europe/London")

START_DATE = date(2026, 1, 1)
END_DATE = date(2026, 2, 1)  # Exclusive

# Assumed day-ahead decision cutoff.
# Change this only if the client specifies a different cutoff.
DECISION_CUTOFF_HOUR = 11

ACTUALS_URL = f"{BASE_URL}/datasets/FUELHH/stream"
FORECASTS_URL = f"{BASE_URL}/datasets/WINDFOR/stream"

app = FastAPI(
    title="UK Wind Power Dashboard API",
    description=(
        "January 2026 wind generation actuals, "
        "day-ahead forecasts and forecast accuracy."
    ),
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://ukwpprtl.vercel.app",
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)



# ---------------------------------------------------------
# Date and data helpers
# ---------------------------------------------------------

def parse_datetime(value):
    """Parse an ISO timestamp and normalize it to UTC."""
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed.astimezone(timezone.utc)

    except (ValueError, TypeError):
        return None


def parse_generation(value):
    """Return a finite numeric generation value, or None."""
    try:
        number = float(value)

        if not math.isfinite(number):
            return None

        return number

    except (ValueError, TypeError):
        return None


def in_january_2026(timestamp):
    """Check the target delivery date in UK local time."""
    if timestamp is None:
        return False

    local_date = timestamp.astimezone(LONDON).date()

    return START_DATE <= local_date < END_DATE


def decision_cutoff(delivery_time):
    """
    Assumption: procurement decisions are made by
    11:00 UK local time on the preceding calendar day.
    """
    delivery_date = delivery_time.astimezone(LONDON).date()
    previous_day = delivery_date - timedelta(days=1)

    local_cutoff = datetime.combine(
        previous_day,
        time(hour=DECISION_CUTOFF_HOUR),
        tzinfo=LONDON,
    )

    return local_cutoff.astimezone(timezone.utc)


async def fetch_records(client, url, params):
    """Fetch and normalize an Elexon stream response."""
    response = await client.get(url, params=params)
    response.raise_for_status()

    payload = response.json()

    # Support both stream arrays and wrapped API responses.
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        for key in ("data", "results"):
            if isinstance(payload.get(key), list):
                return payload[key]

    raise ValueError("Unexpected response format from Elexon API")


# ---------------------------------------------------------
# Elexon data retrieval
# ---------------------------------------------------------

async def fetch_actuals(client):
    """Retrieve half-hourly national wind generation."""
    rows = await fetch_records(
        client,
        ACTUALS_URL,
        {
            "settlementDateFrom": "2026-01-01",
            "settlementDateTo": "2026-01-31",
            "fuelType": "WIND",
        },
    )

    actuals = {}

    for row in rows:
        if str(row.get("fuelType", "")).upper() != "WIND":
            continue

        start_time = parse_datetime(row.get("startTime"))
        generation = parse_generation(row.get("generation"))

        if not in_january_2026(start_time):
            continue

        if generation is None:
            continue

        # One actual observation per half-hourly start time.
        actuals[start_time] = {
            "startTime": start_time.isoformat(),
            "actualGeneration": generation,
        }

    return actuals


async def fetch_forecasts(client):
    """
    Retrieve forecast publications covering January delivery.

    The publication window starts in December so forecasts
    published before January delivery are not omitted.
    """
    rows = await fetch_records(
        client,
        FORECASTS_URL,
        {
            "publishDateTimeFrom": "2025-12-30T00:00:00Z",
            "publishDateTimeTo": "2026-02-01T00:00:00Z",
        },
    )

    forecasts = []

    for row in rows:
        start_time = parse_datetime(row.get("startTime"))
        publish_time = parse_datetime(row.get("publishTime"))
        generation = parse_generation(row.get("generation"))

        if not in_january_2026(start_time):
            continue

        if publish_time is None or generation is None:
            continue

        forecasts.append(
            {
                "startTime": start_time,
                "publishTime": publish_time,
                "forecastGeneration": generation,
            }
        )

    return forecasts


# ---------------------------------------------------------
# Forecast selection and accuracy
# ---------------------------------------------------------

def build_analysis(actuals, forecasts):
    """
    For each delivery period, select the latest forecast
    published before the assumed day-ahead decision cutoff.
    """
    forecasts_by_delivery_time = {}

    for forecast in forecasts:
        start_time = forecast["startTime"]

        forecasts_by_delivery_time.setdefault(
            start_time, []
        ).append(forecast)

    records = []

    for start_time in sorted(actuals):
        actual = actuals[start_time]
        cutoff = decision_cutoff(start_time)

        eligible_forecasts = [
            forecast
            for forecast in forecasts_by_delivery_time.get(
                start_time, []
            )
            if forecast["publishTime"] <= cutoff
        ]

        selected = (
            max(
                eligible_forecasts,
                key=lambda item: item["publishTime"],
            )
            if eligible_forecasts
            else None
        )

        forecast_value = (
            selected["forecastGeneration"]
            if selected
            else None
        )

        error = (
            forecast_value - actual["actualGeneration"]
            if forecast_value is not None
            else None
        )

        records.append(
            {
                "startTime": start_time.isoformat(),
                "actualGeneration": actual["actualGeneration"],
                "forecastGeneration": forecast_value,
                "publishTime": (
                    selected["publishTime"].isoformat()
                    if selected
                    else None
                ),
                "decisionCutoff": cutoff.isoformat(),
                "error": error,
                "absoluteError": (
                    abs(error) if error is not None else None
                ),
            }
        )

    matched = [
        row for row in records
        if row["forecastGeneration"] is not None
    ]

    errors = [row["error"] for row in matched]

    mae = (
        sum(abs(error) for error in errors) / len(errors)
        if errors else None
    )

    rmse = (
        math.sqrt(
            sum(error ** 2 for error in errors) / len(errors)
        )
        if errors else None
    )

    bias = (
        sum(errors) / len(errors)
        if errors else None
    )

    def rounded(value):
        return round(value, 2) if value is not None else None

    latest_publication = max(
        (
            row["publishTime"]
            for row in records
            if row["publishTime"] is not None
        ),
        default=None,
    )

    return {
        "period": {
            "startDate": START_DATE.isoformat(),
            "endDate": "2026-01-31",
            "timezone": "Europe/London",
        },
        "decisionAssumption": (
            f"Latest forecast published by "
            f"{DECISION_CUTOFF_HOUR:02d}:00 UK time "
            "on the preceding calendar day"
        ),
        "units": "MW",
        "dataSource": {
            "actuals": ACTUALS_URL,
            "forecasts": FORECASTS_URL,
        },
        "summary": {
            "actualPeriods": len(actuals),
            "periodsWithEligibleForecast": len(matched),
            "periodsWithoutEligibleForecast": (
                len(records) - len(matched)
            ),
            "forecastCoveragePercent": rounded(
                100 * len(matched) / len(records)
                if records else None
            ),
            "maeMW": rounded(mae),
            "rmseMW": rounded(rmse),
            "biasMW": rounded(bias),
            "latestForecastPublication": latest_publication,
        },
        "records": records,
    }


# ---------------------------------------------------------
# API endpoints
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "UK Wind Power Dashboard API",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "project": "UK Wind Power Dashboard",
    }


@app.get("/api/dashboard")
async def dashboard(
    refresh: bool = Query(
        default=False,
        description="Fetch fresh data rather than use the cache",
    )
):
    # Simple in-memory cache to reduce repeated upstream requests.
    if not refresh and hasattr(dashboard, "_cache"):
        cached = dashboard._cache

        if datetime.now(timezone.utc) < cached["expiresAt"]:
            return cached["data"]

    try:
        timeout = httpx.Timeout(60.0, connect=15.0)

        async with httpx.AsyncClient(
            timeout=timeout,
            headers={"Accept": "application/json"},
        ) as client:
            actuals, forecasts = await asyncio.gather(
                fetch_actuals(client),
                fetch_forecasts(client),
            )

        result = build_analysis(actuals, forecasts)

        dashboard._cache = {
            "data": result,
            "expiresAt": (
                datetime.now(timezone.utc)
                + timedelta(minutes=15)
            ),
        }

        return result

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Elexon returned HTTP "
                f"{exc.response.status_code}. "
                "Try again later."
            ),
        ) from exc

    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to retrieve or parse Elexon data: {exc}",
        ) from exc
