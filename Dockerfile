FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1
ENV ETC_HOST=0.0.0.0
ENV ETC_PORT=8765
ENV ETC_DATA_DIR=/data

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY app.py pdf_extractor.py cloud_storage.py database.py inventory.py ./
  COPY static ./static
  COPY sql ./sql

VOLUME ["/data"]
EXPOSE 8765

CMD ["sh", "-c", "python app.py --host 0.0.0.0 --port ${PORT:-8765} --no-browser"]
