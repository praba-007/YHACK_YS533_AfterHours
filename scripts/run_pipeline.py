"""
Convenience script to execute the MachPulse ML pipeline against the real dataset.
"""
import json
import sys
from pathlib import Path

# Ensure project root is in sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from ml.pipeline import run_pipeline

if __name__ == "__main__":
    csv_file = root_dir / "data" / "MetroPT3(AirCompressor).csv"
    if not csv_file.exists():
        print(f"Error: Dataset not found at {csv_file}")
        sys.exit(1)

    print(f"Starting MachPulse ML pipeline on {csv_file}...")
    results = run_pipeline(csv_path=csv_file)

    # Save results to evaluation output
    output_path = root_dir / "ml" / "evaluation" / "pipeline_results.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print("\n" + "=" * 60)
    print("RESULTS SAVED TO:", output_path)
    print("=" * 60)
    print(json.dumps(results, indent=2))
