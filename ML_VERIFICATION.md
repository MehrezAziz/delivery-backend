# Optional ML verification (driver documents)

When enabled, the API runs the Python script in `../ML` after a document is uploaded and stores JSON in `documents.ml_analysis`.

## Environment variables

Add to `.env`:

```env
# Set to true to run analysis after upload (requires Python + checkpoint paths)
ML_VERIFY_ENABLED=false
ML_PYTHON_PATH=C:/Projet PFE/Dev/ML/.venv/Scripts/python.exe
ML_PROJECT_ROOT=C:/Projet PFE/Dev/ML
ML_VERIFY_CHECKPOINT=C:/Projet PFE/Dev/ML/models/doc_type_baseline.pt
```

- Use forward slashes or escaped paths on Windows.
- `ML_PROJECT_ROOT` must be the folder that contains `src/inference/verify_driver_documents.py`.
- Install Tesseract OCR on the server if you want OCR text (`pip install pytesseract` + system Tesseract).

## Database

`documents.ml_analysis` (JSON) is written by `MlVerificationService`. Apply schema with:

```bash
npx prisma db push
```

## Admin API

Pending driver payloads include `mlAnalysis` on each document when present (see `DocumentResponseDto`).
