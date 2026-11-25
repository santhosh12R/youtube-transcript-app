import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="YouTube to Transcript")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url_or_id: str) -> Optional[str]:
    """Extract an 11-character YouTube video ID from a URL or raw ID."""
    value = url_or_id.strip()
    if not value:
        return None
    if VIDEO_ID_RE.match(value):
        return value

    if not re.match(r"^https?://", value, re.IGNORECASE):
        value = "https://" + value

    parsed = urllib.parse.urlparse(value)
    host = parsed.netloc.lower().split(":")[0]
    path_parts = [p for p in parsed.path.split("/") if p]

    if host in {"youtu.be", "www.youtu.be"} and path_parts:
        candidate = path_parts[0]
        return candidate if VIDEO_ID_RE.match(candidate) else None

    if host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        if parsed.path == "/watch":
            qs = urllib.parse.parse_qs(parsed.query)
            candidate = qs.get("v", [None])[0]
            return candidate if candidate and VIDEO_ID_RE.match(candidate) else None
        if len(path_parts) >= 2 and path_parts[0] in {"shorts", "embed", "live", "v"}:
            candidate = path_parts[1]
            return candidate if VIDEO_ID_RE.match(candidate) else None

    return None


def fetch_oembed_metadata(video_id: str) -> dict:
    """Fetch basic video metadata from YouTube's public oEmbed endpoint."""
    oembed_url = (
        "https://www.youtube.com/oembed?url="
        + urllib.parse.quote(f"https://www.youtube.com/watch?v={video_id}", safe="")
        + "&format=json"
    )
    req = urllib.request.Request(
        oembed_url,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "title": data.get("title", f"YouTube Video ({video_id})"),
                "author": data.get("author_name", "Unknown channel"),
                "thumbnail": data.get(
                    "thumbnail_url",
                    f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                ),
            }
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return {
            "title": f"YouTube Video ({video_id})",
            "author": "YouTube",
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        }


@app.get("/")
def serve_index():
    """Serve the main web page."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/transcript")
def get_transcript(
    url: str = Query(..., description="YouTube video URL or 11-character video ID"),
    lang: Optional[str] = Query(None, description="Preferred language code"),
):
    """Fetch the transcript and metadata for a YouTube video."""
    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Please paste a valid youtube.com or youtu.be link.",
        )

    api = YouTubeTranscriptApi()
    try:
        transcript_list = api.list(video_id)
    except TranscriptsDisabled:
        raise HTTPException(
            status_code=404,
            detail="Transcripts/captions are disabled for this video.",
        )
    except VideoUnavailable:
        raise HTTPException(
            status_code=404,
            detail="This video is unavailable or private.",
        )
    except CouldNotRetrieveTranscript as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not retrieve transcript from YouTube: {exc}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error fetching transcript list: {exc}",
        )

    available = list(transcript_list)
    if not available:
        raise HTTPException(
            status_code=404,
            detail="No transcripts found for this video.",
        )

    selected_transcript = None
    if lang:
        try:
            selected_transcript = transcript_list.find_transcript([lang])
        except NoTranscriptFound:
            raise HTTPException(
                status_code=404,
                detail=f"No transcript available for language '{lang}'.",
            )
    else:
        for preferred in (["en", "en-US", "en-GB"],):
            try:
                selected_transcript = transcript_list.find_transcript(preferred)
                break
            except NoTranscriptFound:
                continue
        if selected_transcript is None:
            selected_transcript = available[0]

    try:
        fetched = selected_transcript.fetch()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to download transcript content: {exc}",
        )

    segments = [
        {
            "text": snippet.text.replace("\n", " ").strip(),
            "start": round(float(snippet.start), 2),
            "duration": round(float(snippet.duration), 2),
        }
        for snippet in fetched
        if snippet.text and snippet.text.strip()
    ]

    languages = [
        {
            "code": item.language_code,
            "name": item.language,
            "is_generated": bool(item.is_generated),
        }
        for item in available
    ]

    metadata = fetch_oembed_metadata(video_id)
    full_text = " ".join(seg["text"] for seg in segments)

    return {
        "video_id": video_id,
        "video_url": f"https://www.youtube.com/watch?v={video_id}",
        "metadata": metadata,
        "language": {
            "code": selected_transcript.language_code,
            "name": selected_transcript.language,
            "is_generated": bool(selected_transcript.is_generated),
        },
        "available_languages": languages,
        "segments": segments,
        "full_text": full_text,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
