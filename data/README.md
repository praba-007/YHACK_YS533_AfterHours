# MetroPT-3 Dataset Documentation

## 1. Dataset Overview

**MachPulse** is built and validated on the **MetroPT-3** dataset (Metro do Porto Light Rail Vehicle Auxiliary Power Unit Air Compressor). 

- **Equipment**: Knorr-Bremse VV120-T Oil-Injected Rotary Screw Air Compressor installed on Porto Metro LRVs.
- **Data Period**: February 2020 through August 2020 (7 months of continuous operation).
- **Sampling Rate**: 0.1 Hz (10-second sampling interval).
- **Observations**: 1,516,948 rows across 15 sensor and control channels.
- **Failures Documented**: 4 ground-truth maintenance failure episodes (F1, F2, F3, F4) including air leaks, oil level drops, and cooler radiator clogging.

---

## 2. Dataset Provenance

- **Source**: Metro do Porto & FEUP (Faculdade de Engenharia da Universidade do Porto).
- **Public Repositories**:
  - [UCI Machine Learning Repository — MetroPT-3](https://archive.ics.uci.edu/dataset/791/metropt+3+dataset)
  - [Kaggle — MetroPT-3 Dataset](https://www.kaggle.com/datasets/nphantawee/metropt3-dataset)

---

## 3. Expected File Path

When working with the raw dataset locally for pipeline re-execution:

```text
data/
├── .gitkeep
├── README.md
└── MetroPT3(AirCompressor).csv   (~218 MB raw CSV)
```

- **File Name**: `MetroPT3(AirCompressor).csv`
- **File Size**: `~218.3 MB` (`218,300,507` bytes)

---

## 4. How the Application Uses This Data

1. **Pre-computed Runtime Assets (Default)**:
   - For web dashboard execution and deployment (Render / Netlify), the application **does not require** the 218 MB raw CSV.
   - The ML pipeline has pre-extracted and calibrated state-specific Mahalanobis models, data quality metrics, and recent telemetry sequences stored in:
     - `ml/evaluation/pipeline_results.json` (~4 KB)
     - `ml/evaluation/recent_telemetry.json` (~37 KB)
   - These lightweight artifacts are tracked in GitHub and allow the FastAPI backend and React frontend to run instantly without heavy ingestion overhead.

2. **Full Pipeline Execution (Optional / Research)**:
   - To re-run the end-to-end data quality filtering, operating-state segmentation, Mahalanobis matrix computation, and baseline benchmark evaluation from raw signals:
     1. Download `MetroPT3(AirCompressor).csv` from UCI or Kaggle.
     2. Place it in this `data/` directory.
     3. Run `python scripts/run_pipeline.py`.

---

## 5. Git Exclusion Notice

The raw CSV file (`data/*.csv`) is excluded from Git commits via `.gitignore` to comply with GitHub repository best practices and avoid multi-megabyte binary payloads in version control.
