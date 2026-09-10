from fastapi import FastAPI

app = FastAPI(
    title="SIH 3D Cadastre API",
    version="1.0.0"
)


@app.get("/")
def root():
    return {
        "message": "SIH 3D Cadastre API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }