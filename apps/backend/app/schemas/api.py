from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ParticipantCreate(BaseModel):
    program_id: str
    code: str
    first_name: str
    birth_year: Optional[int] = None
    gender: str = "unknown"
    nationality: Optional[str] = None
    enrollment_date: date
    consent_given: bool = False
    is_control_group: bool = False


class ParticipantOut(BaseModel):
    id: str
    code: str
    first_name: str
    nationality: Optional[str]
    enrollment_date: date
    is_control_group: bool
    active: bool

    class Config:
        from_attributes = True


class ProgramCreate(BaseModel):
    name: str
    description: Optional[str] = None
    program_type: str = "other"
    start_date: date
    end_date: Optional[date] = None


class ProgramOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    program_type: str
    start_date: date
    end_date: Optional[date]
    active: bool

    class Config:
        from_attributes = True


class AssessmentInput(BaseModel):
    participant_id: str
    program_id: str
    assessment_date: date
    period_label: Optional[str] = None
    reading_level: Optional[int] = Field(default=None, ge=1, le=5)
    math_level: Optional[int] = Field(default=None, ge=1, le=5)
    comprehension_level: Optional[int] = Field(default=None, ge=1, le=5)
    attention_level: Optional[int] = Field(default=None, ge=1, le=5)
    memory_level: Optional[int] = Field(default=None, ge=1, le=5)
    autonomy_level: Optional[int] = Field(default=None, ge=1, le=5)
    peer_interaction: Optional[int] = Field(default=None, ge=1, le=5)
    group_work: Optional[int] = Field(default=None, ge=1, le=5)
    emotional_regulation: Optional[int] = Field(default=None, ge=1, le=5)
    language_fluency: Optional[int] = Field(default=None, ge=1, le=5)
    cultural_adaptation: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None


class SessionObservationInput(BaseModel):
    participant_id: str
    academic_score: Optional[int] = Field(default=None, ge=1, le=5)
    cognitive_score: Optional[int] = Field(default=None, ge=1, le=5)
    social_score: Optional[int] = Field(default=None, ge=1, le=5)
    integration_score: Optional[int] = Field(default=None, ge=1, le=5)
    qualitative_note: Optional[str] = None
    mood_indicator: Optional[str] = None
    attendance_status: str = "present"


class SessionMicroGoalCompletionInput(BaseModel):
    goal_id: str
    note: Optional[str] = None


class SessionCreate(BaseModel):
    program_id: str
    session_date: date
    session_type: str = "group"
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    observations: list[SessionObservationInput]
    micro_goal_completions: list[SessionMicroGoalCompletionInput] = []


class SessionOut(BaseModel):
    id: str
    program_id: str
    session_date: date
    session_type: str
    duration_minutes: Optional[int]
    notes: Optional[str]
    notes_ai_summary: Optional[str]
    notes_sentiment: Optional[float]

    class Config:
        from_attributes = True


class SessionObservationOut(BaseModel):
    id: str
    participant_id: str
    academic_score: Optional[int]
    cognitive_score: Optional[int]
    social_score: Optional[int]
    integration_score: Optional[int]
    qualitative_note: Optional[str]
    mood_indicator: Optional[str]

    class Config:
        from_attributes = True


class MicroGoalCreate(BaseModel):
    program_id: str
    title: str
    description: Optional[str] = None
    dimension: str
    difficulty: int = Field(default=1, ge=1, le=3)
    target_date: Optional[date] = None


class MicroGoalOut(BaseModel):
    id: str
    program_id: str
    title: str
    description: Optional[str]
    dimension: str
    difficulty: int
    target_date: Optional[date]
    active: bool
    created_at: datetime
    completions_count: int = 0
    last_completed_at: Optional[datetime] = None


class ReportRequest(BaseModel):
    program_id: str
    report_type: str = "quarterly"
    period_start: date
    period_end: date
    title: str


class ReportStatus(BaseModel):
    id: str
    status: str
    created_at: datetime


class ReportListItem(BaseModel):
    id: str
    title: str
    status: str
    report_type: str
    period_start: date
    period_end: date
    created_at: datetime
    created_by_name: str
    program_id: Optional[str] = None
    program_name: Optional[str] = None


class ParseNoteRequest(BaseModel):
    note_text: str
    participant_context: Optional[dict] = None


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    password: str = Field(min_length=6)


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class PlanUpdateRequest(BaseModel):
    plan: str = Field(pattern="^(free|starter|pro|enterprise)$")
