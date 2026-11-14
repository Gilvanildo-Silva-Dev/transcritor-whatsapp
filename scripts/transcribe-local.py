"""Transcreve somente no computador: modelo em disco e rede offline."""
import argparse
import json
import os
import sys
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model-dir", required=True)
    args = parser.parse_args()
    model_dir = Path(args.model_dir)
    if not (model_dir / "model.bin").is_file():
        emit({"error": "MODEL_NOT_READY"})
        return 3
    try:
        from faster_whisper import WhisperModel
    except (ImportError, OSError):
        emit({"error": "DEPENDENCIES_MISSING"})
        return 3
    try:
        model = WhisperModel(str(model_dir), device="cpu", compute_type="int8", cpu_threads=min(4, os.cpu_count() or 1), local_files_only=True)
    except Exception:
        emit({"error": "MODEL_NOT_READY"})
        return 3
    try:
        segments, _ = model.transcribe(args.audio, language="pt", beam_size=5, vad_filter=True, condition_on_previous_text=False)
        text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
        emit({"text": text, "engine": "local"})
        return 0
    except Exception:
        # Nao imprime nomes de arquivos, conteudo ou mensagens internas.
        emit({"error": "LOCAL_TRANSCRIPTION_FAILED"})
        return 4

if __name__ == "__main__":
    sys.exit(main())
