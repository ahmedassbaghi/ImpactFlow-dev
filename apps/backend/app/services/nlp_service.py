import json
import re
from typing import Optional
from openai import AsyncOpenAI

from app.config import get_settings

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

SYSTEM_PROMPT = """
Eres un asistente experto en evaluación de impacto social y educativo.
Tu tarea es analizar notas cualitativas escritas por educadores/voluntarios
sobre sesiones con niños en programas sociales.

Dado un fragmento de texto libre, extrae:
1. sentiment_score: número entre -1.0 (muy negativo) y 1.0 (muy positivo)
2. dimension_signals: objeto con puntuaciones sugeridas (1-5) para cada dimensión
   basadas en lo que se describe. Omite dimensiones no mencionadas.
3. tags: lista de hasta 5 etiquetas relevantes en español/catalán
4. summary: una frase resumen en catalán (máx. 80 chars)
5. flags: lista de alertas si las hay (ej: "possible_risk", "family_issue", "exceptional_progress")

IMPORTANTE: Responde ÚNICAMENTE con JSON válido. Sin explicaciones adicionales.
Sin texto antes o después del JSON.
"""

async def parse_qualitative_note(
    note_text: str,
    participant_context: Optional[dict] = None
) -> dict:
    context_str = ""
    if participant_context:
        context_str = f"\\nContexto del participante: {json.dumps(participant_context, ensure_ascii=False)}"
    
    try:
        if client is None:
            raise RuntimeError("OPENAI_API_KEY not configured")
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Nota del educador: {note_text}{context_str}"}
            ]
        )
        
        result = json.loads(response.choices[0].message.content)
        
        return {
            "sentiment_score": float(result.get("sentiment_score", 0)),
            "dimension_signals": {
                k: max(1, min(5, int(v)))
                for k, v in result.get("dimension_signals", {}).items()
                if k in ["academic", "cognitive", "social", "integration"]
            },
            "tags": result.get("tags", [])[:5],
            "summary": result.get("summary", "")[:80],
            "flags": [f for f in result.get("flags", []) if isinstance(f, str)]
        }
    except Exception as e:
        # Fallback: análisis básico sin IA
        return {
            "sentiment_score": _simple_sentiment(note_text),
            "dimension_signals": {},
            "tags": _extract_keywords(note_text),
            "summary": note_text[:80],
            "flags": []
        }

def _simple_sentiment(text: str) -> float:
    """Análisis de sentimiento basado en palabras clave (fallback offline)."""
    positive = ["bé", "molt bé", "excel·lent", "progrés", "millora", "concentrat", 
                "positiu", "participat", "animat", "bien", "excelente", "mejora"]
    negative = ["difícil", "cost", "absent", "problemes", "trist", "bloqueig",
                "problema", "ausente", "difícil", "bloqueado"]
    
    text_lower = text.lower()
    pos = sum(1 for w in positive if w in text_lower)
    neg = sum(1 for w in negative if w in text_lower)
    
    if pos + neg == 0:
        return 0.0
    return (pos - neg) / (pos + neg)

def _extract_keywords(text: str) -> list[str]:
    """Extrae palabras clave básicas (fallback offline)."""
    stopwords = {"ha", "en", "de", "la", "el", "les", "els", "un", "una", "i", "a",
                 "que", "per", "amb", "molt", "més", "se", "es", "este", "esta"}
    words = re.findall(r'\\b\\w{4,}\\b', text.lower())
    return list(dict.fromkeys(w for w in words if w not in stopwords))[:5]
